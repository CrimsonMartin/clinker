import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REFRESH_REUSE_GRACE_SEC } from '../src/routes/auth.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/tokens.js';
import { bearer, register, resetDb, setup, teardown, TEST_JWT_SECRET, uniqueEmail, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(() => teardown(ctx));
beforeEach(async () => {
  await resetDb(ctx.pool);
  ctx.mailer.sent = [];
});

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });
const me = (token: string) => ctx.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(token) });
const authed = (url: string, token: string, payload?: object) =>
  ctx.app.inject({ method: 'POST', url, headers: bearer(token), payload });

async function resetLink(email: string): Promise<string> {
  const mail = ctx.mailer.next();
  await post('/v1/auth/password-reset/request', { email });
  return /#token=([A-Za-z0-9_-]+)/.exec((await mail).text)![1]!;
}

describe('refresh token reuse detection', () => {
  it('replaying a rotated-away token after the grace window revokes the whole family', async () => {
    const u = await register(ctx.app);
    const other = (await post('/v1/auth/login', { email: u.email, password: u.password })).json();
    const r1 = (await post('/v1/auth/refresh', { refreshToken: u.refreshToken })).json();
    const r2 = (await post('/v1/auth/refresh', { refreshToken: r1.refreshToken })).json();

    // Pretend the rotated tokens were revoked well outside the grace window.
    await ctx.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() - make_interval(secs => $1) WHERE revoked_at IS NOT NULL`,
      [REFRESH_REUSE_GRACE_SEC + 5],
    );
    const replay = await post('/v1/auth/refresh', { refreshToken: u.refreshToken });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('invalid_refresh_token');

    // The newest token of that family is dead too, as are access tokens minted before now...
    expect((await post('/v1/auth/refresh', { refreshToken: r2.refreshToken })).statusCode).toBe(401);
    expect((await me(r2.accessToken)).statusCode).toBe(401);
    // ...but an unrelated session (separate login = separate family) can still refresh.
    expect((await post('/v1/auth/refresh', { refreshToken: other.refreshToken })).statusCode).toBe(200);
  });

  it('a replay within the grace window is rejected without revoking the family', async () => {
    const u = await register(ctx.app);
    const r1 = (await post('/v1/auth/refresh', { refreshToken: u.refreshToken })).json();
    const race = await post('/v1/auth/refresh', { refreshToken: u.refreshToken });
    expect(race.statusCode).toBe(401);
    expect(race.json().error.code).toBe('invalid_refresh_token');
    expect((await me(r1.accessToken)).statusCode).toBe(200);
    expect((await post('/v1/auth/refresh', { refreshToken: r1.refreshToken })).statusCode).toBe(200);
  });

  it('refresh keeps the family id; a new login starts a new one', async () => {
    const u = await register(ctx.app);
    await post('/v1/auth/refresh', { refreshToken: u.refreshToken });
    await post('/v1/auth/login', { email: u.email, password: u.password });
    const { rows } = await ctx.pool.query('SELECT family_id FROM refresh_tokens ORDER BY id');
    expect(rows).toHaveLength(3);
    expect(rows[1].family_id).toBe(rows[0].family_id);
    expect(rows[2].family_id).not.toBe(rows[0].family_id);
  });
});

describe('access token checks', () => {
  it('rejects tokens issued before tokens_valid_after', async () => {
    const u = await register(ctx.app);
    expect((await me(u.accessToken)).statusCode).toBe(200);
    await ctx.pool.query(`UPDATE users SET tokens_valid_after = now() + interval '2 seconds'`);
    const res = await me(u.accessToken);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('rejects validly signed tokens for users that do not exist', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-4000-8000-000000000000')
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));
    for (const url of ['/v1/me', '/v1/sync', '/v1/meta/doi/10.1234/x']) {
      const res = await ctx.app.inject({ method: 'GET', url, headers: bearer(token) });
      expect(res.statusCode, url).toBe(401);
    }
  });
});

describe('POST /v1/auth/password', () => {
  it('changes the password, logs out every session and returns a fresh pair', async () => {
    const u = await register(ctx.app, uniqueEmail(), 'old password 1');
    const other = (await post('/v1/auth/login', { email: u.email, password: 'old password 1' })).json();

    const res = await authed('/v1/auth/password', u.accessToken, {
      currentPassword: 'old password 1',
      newPassword: 'new password 2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toEqual(u.user);
    expect(body.refreshToken).toEqual(expect.any(String));

    // Old refresh and access tokens (this device and others) are dead.
    expect((await post('/v1/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
    expect((await post('/v1/auth/refresh', { refreshToken: other.refreshToken })).statusCode).toBe(401);
    expect((await me(u.accessToken)).statusCode).toBe(401);
    expect((await me(other.accessToken)).statusCode).toBe(401);

    // The new pair works.
    expect((await me(body.accessToken)).statusCode).toBe(200);
    expect((await post('/v1/auth/refresh', { refreshToken: body.refreshToken })).statusCode).toBe(200);

    expect((await post('/v1/auth/login', { email: u.email, password: 'old password 1' })).statusCode).toBe(401);
    expect((await post('/v1/auth/login', { email: u.email, password: 'new password 2' })).statusCode).toBe(200);
  });

  it('rejects a wrong current password with 403 and changes nothing', async () => {
    const u = await register(ctx.app);
    const res = await authed('/v1/auth/password', u.accessToken, { currentPassword: 'nope', newPassword: 'new password 2' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('invalid_password');
    expect((await me(u.accessToken)).statusCode).toBe(200);
    expect((await post('/v1/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(200);
  });

  it('validates input and requires auth', async () => {
    const u = await register(ctx.app);
    const short = await authed('/v1/auth/password', u.accessToken, { currentPassword: u.password, newPassword: 'short' });
    expect(short.statusCode).toBe(400);
    const anon = await post('/v1/auth/password', { currentPassword: u.password, newPassword: 'new password 2' });
    expect(anon.statusCode).toBe(401);
  });

  it('invalidates outstanding password reset links', async () => {
    const u = await register(ctx.app);
    const token = await resetLink(u.email);
    await authed('/v1/auth/password', u.accessToken, { currentPassword: u.password, newPassword: 'new password 2' });
    const res = await post('/v1/auth/password-reset/confirm', { token, password: 'third password' });
    expect(res.statusCode).toBe(400);
  });

  it('is rate limited per IP like login', async () => {
    const limited = await setup({ AUTH_RATE_LIMIT_MAX: '2' });
    try {
      const u = await register(limited.app);
      const codes = [];
      for (let i = 0; i < 3; i++) {
        const r = await limited.app.inject({
          method: 'POST',
          url: '/v1/auth/password',
          headers: bearer(u.accessToken),
          payload: { currentPassword: 'wrong guess', newPassword: 'new password 2' },
        });
        codes.push(r.statusCode);
      }
      expect(codes).toEqual([403, 403, 429]);
    } finally {
      await teardown(limited);
    }
  });
});

describe('POST /v1/auth/logout-all', () => {
  it("revokes every refresh and access token of the caller's account only", async () => {
    const u = await register(ctx.app);
    const other = (await post('/v1/auth/login', { email: u.email, password: u.password })).json();
    const stranger = await register(ctx.app);

    const res = await authed('/v1/auth/logout-all', u.accessToken);
    expect(res.statusCode).toBe(204);

    for (const t of [u.refreshToken, other.refreshToken]) {
      expect((await post('/v1/auth/refresh', { refreshToken: t })).statusCode).toBe(401);
    }
    expect((await me(u.accessToken)).statusCode).toBe(401);
    expect((await me(other.accessToken)).statusCode).toBe(401);
    expect((await me(stranger.accessToken)).statusCode).toBe(200);
    expect((await post('/v1/auth/refresh', { refreshToken: stranger.refreshToken })).statusCode).toBe(200);

    // Signing in again works immediately.
    const again = (await post('/v1/auth/login', { email: u.email, password: u.password })).json();
    expect((await me(again.accessToken)).statusCode).toBe(200);
  });

  it('requires auth', async () => {
    expect((await post('/v1/auth/logout-all', {})).statusCode).toBe(401);
  });
});

describe('password reset', () => {
  it('also revokes access tokens issued before the reset', async () => {
    const u = await register(ctx.app);
    const token = await resetLink(u.email);
    expect((await post('/v1/auth/password-reset/confirm', { token, password: 'brand new pw' })).statusCode).toBe(204);
    expect((await me(u.accessToken)).statusCode).toBe(401);
  });
});

describe('security headers', () => {
  it('sends X-Content-Type-Options: nosniff on success, error and 404 responses', async () => {
    const u = await register(ctx.app);
    const responses = [
      await me(u.accessToken),
      await me('bogus'),
      await ctx.app.inject({ method: 'GET', url: '/nope' }),
      await ctx.app.inject({ method: 'GET', url: '/healthz' }),
      await ctx.app.inject({ method: 'GET', url: '/privacy' }),
      await post('/v1/auth/login', { email: 'x' }),
    ];
    for (const res of responses) expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
