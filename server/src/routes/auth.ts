import type { FastifyInstance, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import type { Config } from '../config.js';
import type { Pool, PoolClient } from '../db.js';
import { withTransaction } from '../db.js';
import { ApiError, unauthorized } from '../errors.js';
import { hashToken, randomToken } from '../tokens.js';

// OWASP-recommended argon2id parameters; modest memory so small pods can handle bursts.
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// Arbitrary advisory-lock key for the MAX_USERS check.
const REGISTRATION_LOCK_KEY = 727_465_002;

const registrationClosed = () => new ApiError(403, 'registration_closed', 'New account registration is closed');

/** Whether POST /register would currently accept a new account. */
export async function registrationOpen(pool: Pool, config: Config): Promise<boolean> {
  if (!config.registrationEnabled) return false;
  if (config.maxUsers === 0) return true;
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  return rows[0]!.n < config.maxUsers;
}

/**
 * A rotated-away refresh token presented again within this many seconds is treated as a benign
 * race (e.g. sidebar and background refreshing at once) and just rejected. Later than that it
 * is treated as theft: the whole token family is revoked.
 */
export const REFRESH_REUSE_GRACE_SEC = 10;

const invalidPassword = () => new ApiError(403, 'invalid_password', 'Current password is incorrect');

/** Verify `password` against the stored hash of `userId`; throws 403 invalid_password. */
export async function verifyUserPassword(pool: Pool, userId: string, password: string): Promise<void> {
  const { rows } = await pool.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw unauthorized('User no longer exists');
  if (!(await argon2.verify(rows[0].password_hash, password))) throw invalidPassword();
}

/**
 * Log out every session of a user: revoke all refresh tokens and reject access tokens issued
 * before `validAfter` (unix seconds, fractional). A session issued after this call is unaffected.
 */
async function revokeAllSessions(c: PoolClient, userId: string, validAfter: number): Promise<void> {
  await c.query('UPDATE users SET tokens_valid_after = to_timestamp($2) WHERE id = $1', [userId, validAfter]);
  await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

// Millisecond precision, matching the fractional `iat` of access tokens (see tokens.ts).
const nowEpoch = () => Date.now() / 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserRow {
  id: string;
  email: string;
  created_at: Date;
}

export function toUser(row: UserRow) {
  return { id: row.id, email: row.email, createdAt: row.created_at.toISOString() };
}

function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new ApiError(400, 'invalid_request', 'A valid email address is required');
  }
  return email;
}

const emailPasswordSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 320 },
      password: { type: 'string', minLength: 8, maxLength: 1024 },
    },
  },
} as const;

const refreshSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: { refreshToken: { type: 'string', minLength: 1, maxLength: 512 } },
  },
} as const;

export async function authRoutes(app: FastifyInstance) {
  const { pool, config, accessTokens, mailer } = app.deps;
  const rateLimit = { max: config.authRateLimitMax, timeWindow: '1 minute' };

  let dummyHash: Promise<string> | null = null;
  const getDummyHash = () => (dummyHash ??= argon2.hash(randomToken(), ARGON2_OPTS));

  /** Mint an access + refresh token pair. `familyId` continues a refresh chain; omit for a new login. */
  async function issueSession(client: PoolClient, user: UserRow, familyId: string | null = null) {
    const refreshToken = randomToken();
    await client.query(
      `INSERT INTO refresh_tokens (token_hash, user_id, expires_at, family_id)
       VALUES ($1, $2, now() + make_interval(secs => $3), coalesce($4::uuid, gen_random_uuid()))`,
      [hashToken(refreshToken), user.id, config.refreshTokenTtlSec, familyId],
    );
    const access = await accessTokens.sign(user.id);
    return {
      user: toUser(user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
    };
  }

  app.post<{ Body: { email: string; password: string } }>(
    '/register',
    { schema: emailPasswordSchema, config: { rateLimit } },
    async (req, reply) => {
      if (!config.registrationEnabled) throw registrationClosed();
      const email = normaliseEmail(req.body.email);
      const passwordHash = await argon2.hash(req.body.password, ARGON2_OPTS);
      try {
        const res = await withTransaction(pool, async (c) => {
          if (config.maxUsers > 0) {
            // Serialise registrations so concurrent sign-ups can't overshoot the cap.
            await c.query('SELECT pg_advisory_xact_lock($1)', [REGISTRATION_LOCK_KEY]);
            const { rows } = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
            if (rows[0]!.n >= config.maxUsers) throw registrationClosed();
          }
          const { rows } = await c.query<UserRow>(
            `INSERT INTO users (email, password_hash) VALUES ($1, $2)
             RETURNING id, email, created_at`,
            [email, passwordHash],
          );
          return issueSession(c, rows[0]!);
        });
        return reply.status(201).send(res);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw new ApiError(409, 'email_taken', 'An account with this email already exists');
        }
        throw err;
      }
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/login',
    { schema: emailPasswordSchema, config: { rateLimit } },
    async (req) => {
      const email = req.body.email.trim().toLowerCase();
      const { rows } = await pool.query<UserRow & { password_hash: string }>(
        'SELECT id, email, created_at, password_hash FROM users WHERE email = $1',
        [email],
      );
      const row = rows[0];
      // Always run a verify so response time doesn't reveal whether the account exists.
      const ok = await argon2.verify(row?.password_hash ?? (await getDummyHash()), req.body.password);
      if (!row || !ok) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password');
      return withTransaction(pool, (c) => issueSession(c, row));
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    '/refresh',
    { schema: refreshSchema, config: { rateLimit } },
    async (req) => {
      const result = await withTransaction(pool, async (c) => {
        const { rows } = await c.query<{
          id: string;
          user_id: string;
          family_id: string;
          revoked: boolean;
          reused: boolean;
          expired: boolean;
        }>(
          `SELECT id, user_id, family_id,
                  revoked_at IS NOT NULL AS revoked,
                  coalesce(revoked_at < now() - make_interval(secs => $2), false) AS reused,
                  expires_at <= now() AS expired
             FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
          [hashToken(req.body.refreshToken), REFRESH_REUSE_GRACE_SEC],
        );
        const tok = rows[0];
        if (!tok) return null;
        if (tok.revoked) {
          if (tok.reused) {
            // A token rotated away long ago is being replayed: assume it was stolen. Kill the
            // whole chain (attacker's and victim's copies) and any access tokens minted from it.
            req.log.warn({ userId: tok.user_id, familyId: tok.family_id }, 'refresh token reuse detected; revoking family');
            await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [
              tok.family_id,
            ]);
            await c.query('UPDATE users SET tokens_valid_after = to_timestamp($2) WHERE id = $1', [tok.user_id, nowEpoch()]);
          }
          return null;
        }
        if (tok.expired) return null;
        await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [tok.id]);
        const users = await c.query<UserRow>('SELECT id, email, created_at FROM users WHERE id = $1', [tok.user_id]);
        if (!users.rows[0]) return null;
        return issueSession(c, users.rows[0], tok.family_id);
      });
      if (!result) throw new ApiError(401, 'invalid_refresh_token', 'Refresh token is invalid, expired or revoked');
      return result;
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    '/logout',
    { schema: refreshSchema, config: { rateLimit } },
    async (req, reply) => {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [hashToken(req.body.refreshToken)],
      );
      return reply.status(204).send();
    },
  );

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', minLength: 1, maxLength: 1024 },
            newPassword: { type: 'string', minLength: 8, maxLength: 1024 },
          },
        },
      },
      config: { rateLimit },
      onRequest: app.requireAuth,
    },
    async (req) => {
      await verifyUserPassword(pool, req.userId, req.body.currentPassword);
      const passwordHash = await argon2.hash(req.body.newPassword, ARGON2_OPTS);
      return withTransaction(pool, async (c) => {
        const { rows } = await c.query<UserRow>(
          'UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id, email, created_at',
          [req.userId, passwordHash],
        );
        if (!rows[0]) throw unauthorized('User no longer exists');
        await revokeAllSessions(c, req.userId, nowEpoch());
        await c.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [
          req.userId,
        ]);
        // Fresh pair for the caller (new family); every other session is now logged out.
        return issueSession(c, rows[0]);
      });
    },
  );

  app.post('/logout-all', { config: { rateLimit }, onRequest: app.requireAuth }, async (req, reply) => {
    await withTransaction(pool, (c) => revokeAllSessions(c, req.userId, nowEpoch()));
    return reply.status(204).send();
  });

  app.post<{ Body: { email: string } }>(
    '/password-reset/request',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', minLength: 1, maxLength: 320 } },
        },
      },
      config: { rateLimit },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      if (!mailer.enabled) {
        req.log.info('password reset requested but SMTP is not configured; ignoring');
        return reply.status(202).send();
      }
      // Fire-and-forget so the response time doesn't reveal whether the account exists.
      void (async () => {
        const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
        if (!rows[0]) return;
        const token = randomToken();
        await pool.query(
          `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
           VALUES ($1, $2, now() + make_interval(secs => $3))`,
          [hashToken(token), rows[0].id, config.resetTokenTtlSec],
        );
        const link = `${config.publicBaseUrl}/reset-password#token=${token}`;
        await mailer.send({
          to: email,
          subject: 'Reset your Citation Linker password',
          text:
            `Someone (hopefully you) asked to reset the password for your Citation Linker account.\n\n` +
            `Open this link within 1 hour to choose a new password:\n${link}\n\n` +
            `If you did not request this, you can ignore this email.\n`,
        });
      })().catch((err) => req.log.error({ err }, 'failed to send password reset mail'));
      return reply.status(202).send();
    },
  );

  app.post<{ Body: { token: string; password: string } }>(
    '/password-reset/confirm',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string', minLength: 1, maxLength: 512 },
            password: { type: 'string', minLength: 8, maxLength: 1024 },
          },
        },
      },
      config: { rateLimit },
    },
    async (req: FastifyRequest<{ Body: { token: string; password: string } }>, reply) => {
      const passwordHash = await argon2.hash(req.body.password, ARGON2_OPTS);
      const ok = await withTransaction(pool, async (c) => {
        const { rows } = await c.query<{ id: string; user_id: string }>(
          `SELECT id, user_id FROM password_reset_tokens
            WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
            FOR UPDATE`,
          [hashToken(req.body.token)],
        );
        const tok = rows[0];
        if (!tok) return false;
        await c.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, tok.user_id]);
        // Invalidate this and any other outstanding reset links, and log out all sessions.
        await c.query(
          'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
          [tok.user_id],
        );
        await revokeAllSessions(c, tok.user_id, nowEpoch());
        return true;
      });
      if (!ok) throw new ApiError(400, 'invalid_token', 'Reset token is invalid or expired');
      return reply.status(204).send();
    },
  );
}
