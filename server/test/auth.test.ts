import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, register, resetDb, setup, teardown, uniqueEmail, type TestCtx } from './helpers.js';

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

describe('register', () => {
  it('creates a user and returns an AuthResponse', async () => {
    const res = await post('/v1/auth/register', { email: '  Alice@Example.COM ', password: 'password123' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), email: 'alice@example.com', createdAt: expect.any(String) });
    expect(new Date(body.user.createdAt).toISOString()).toBe(body.user.createdAt);
    expect(body.accessToken.split('.')).toHaveLength(3);
    const ttl = new Date(body.accessTokenExpiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.refreshToken.length).toBeGreaterThanOrEqual(40);

    // Refresh token is stored hashed, never in plaintext.
    const { rows } = await ctx.pool.query('SELECT token_hash FROM refresh_tokens');
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0].token_hash).toString('base64url')).not.toBe(body.refreshToken);
  });

  it('rejects duplicate email (case-insensitive) with 409 email_taken', async () => {
    await register(ctx.app, 'bob@example.com');
    const res = await post('/v1/auth/register', { email: 'BOB@example.com', password: 'password123' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
  });

  it('rejects short passwords and invalid emails with 400', async () => {
    const short = await post('/v1/auth/register', { email: uniqueEmail(), password: 'short' });
    expect(short.statusCode).toBe(400);
    expect(short.json().error.code).toBe('invalid_request');
    const bad = await post('/v1/auth/register', { email: 'not-an-email', password: 'password123' });
    expect(bad.statusCode).toBe(400);
    const missing = await post('/v1/auth/register', {});
    expect(missing.statusCode).toBe(400);
  });
});

describe('login', () => {
  it('logs in with correct credentials (email case-insensitive)', async () => {
    const u = await register(ctx.app, 'carol@example.com', 'hunter2hunter2');
    const res = await post('/v1/auth/login', { email: 'Carol@Example.com', password: 'hunter2hunter2' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(u.user.id);
    expect(res.json().refreshToken).not.toBe(u.refreshToken);
  });

  it('returns 401 invalid_credentials for wrong password or unknown user', async () => {
    await register(ctx.app, 'dave@example.com', 'password123');
    for (const payload of [
      { email: 'dave@example.com', password: 'wrongpassword' },
      { email: 'nobody@example.com', password: 'password123' },
    ]) {
      const res = await post('/v1/auth/login', payload);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { code: 'invalid_credentials', message: expect.any(String) } });
    }
  });
});

describe('refresh rotation', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const u = await register(ctx.app);
    const r1 = await post('/v1/auth/refresh', { refreshToken: u.refreshToken });
    expect(r1.statusCode).toBe(200);
    const b1 = r1.json();
    expect(b1.user.id).toBe(u.user.id);
    expect(b1.refreshToken).not.toBe(u.refreshToken);

    const me = await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(b1.accessToken) });
    expect(me.statusCode).toBe(200);

    // Old token is now revoked.
    const reuse = await post('/v1/auth/refresh', { refreshToken: u.refreshToken });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().error.code).toBe('invalid_refresh_token');

    // New token works exactly once more.
    const r2 = await post('/v1/auth/refresh', { refreshToken: b1.refreshToken });
    expect(r2.statusCode).toBe(200);
    expect((await post('/v1/auth/refresh', { refreshToken: b1.refreshToken })).statusCode).toBe(401);
  });

  it('rejects unknown and expired refresh tokens', async () => {
    expect((await post('/v1/auth/refresh', { refreshToken: 'garbage' })).statusCode).toBe(401);
    const u = await register(ctx.app);
    await ctx.pool.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 second'`);
    const res = await post('/v1/auth/refresh', { refreshToken: u.refreshToken });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_refresh_token');
  });

  it('concurrent refreshes of the same token: exactly one succeeds', async () => {
    const u = await register(ctx.app);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/v1/auth/refresh', { refreshToken: u.refreshToken })),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 401)).toHaveLength(4);
  });
});

describe('logout', () => {
  it('revokes the given refresh token only', async () => {
    const u = await register(ctx.app);
    const second = (await post('/v1/auth/login', { email: u.email, password: u.password })).json();
    const res = await post('/v1/auth/logout', { refreshToken: u.refreshToken });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect((await post('/v1/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
    expect((await post('/v1/auth/refresh', { refreshToken: second.refreshToken })).statusCode).toBe(200);
  });

  it('returns 204 for an unknown token', async () => {
    expect((await post('/v1/auth/logout', { refreshToken: 'whatever' })).statusCode).toBe(204);
  });
});

describe('password reset', () => {
  it('full flow: request -> mail -> confirm -> old sessions revoked, new password works', async () => {
    const u = await register(ctx.app, 'erin@example.com', 'oldpassword');
    const mail = ctx.mailer.next();
    const req = await post('/v1/auth/password-reset/request', { email: 'ERIN@example.com' });
    expect(req.statusCode).toBe(202);
    const msg = await mail;
    expect(msg.to).toBe('erin@example.com');
    const m = /https:\/\/clinker\.test\/reset-password#token=([A-Za-z0-9_-]+)/.exec(msg.text);
    expect(m).not.toBeNull();
    const token = m![1]!;

    const tooShort = await post('/v1/auth/password-reset/confirm', { token, password: 'short' });
    expect(tooShort.statusCode).toBe(400);

    const ok = await post('/v1/auth/password-reset/confirm', { token, password: 'newpassword' });
    expect(ok.statusCode).toBe(204);

    expect((await post('/v1/auth/login', { email: u.email, password: 'oldpassword' })).statusCode).toBe(401);
    expect((await post('/v1/auth/login', { email: u.email, password: 'newpassword' })).statusCode).toBe(200);
    expect((await post('/v1/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);

    // Token is single use.
    const again = await post('/v1/auth/password-reset/confirm', { token, password: 'anotherpassword' });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('invalid_token');
  });

  it('returns 202 and sends nothing for unknown emails', async () => {
    const res = await post('/v1/auth/password-reset/request', { email: 'ghost@example.com' });
    expect(res.statusCode).toBe(202);
    await new Promise((r) => setTimeout(r, 200));
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it('rejects unknown and expired tokens with 400 invalid_token', async () => {
    const bad = await post('/v1/auth/password-reset/confirm', { token: 'nope', password: 'password123' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_token');

    await register(ctx.app, 'frank@example.com');
    const mail = ctx.mailer.next();
    await post('/v1/auth/password-reset/request', { email: 'frank@example.com' });
    const token = /#token=([A-Za-z0-9_-]+)/.exec((await mail).text)![1]!;
    await ctx.pool.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 second'`);
    const expired = await post('/v1/auth/password-reset/confirm', { token, password: 'password123' });
    expect(expired.statusCode).toBe(400);
  });
});

describe('/v1/me', () => {
  it('returns the current user', async () => {
    const u = await register(ctx.app);
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(u.accessToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: u.user });
  });

  it('DELETE removes the user and all their data', async () => {
    const u = await register(ctx.app);
    const put = await ctx.app.inject({
      method: 'PUT',
      url: '/v1/sync',
      headers: bearer(u.accessToken),
      payload: { data: { a: 1 }, baseVersion: null },
    });
    expect(put.statusCode).toBe(200);
    await post('/v1/auth/password-reset/request', { email: u.email });
    await ctx.mailer.next();

    const del = await ctx.app.inject({ method: 'DELETE', url: '/v1/me', headers: bearer(u.accessToken) });
    expect(del.statusCode).toBe(204);

    for (const table of ['users', 'refresh_tokens', 'password_reset_tokens', 'sync_docs']) {
      const { rows } = await ctx.pool.query(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0].n, table).toBe(0);
    }
    // Still-valid access token can no longer act on the deleted account.
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(u.accessToken) })).statusCode).toBe(401);
    const put2 = await ctx.app.inject({
      method: 'PUT',
      url: '/v1/sync',
      headers: bearer(u.accessToken),
      payload: { data: { a: 1 }, baseVersion: null },
    });
    expect(put2.statusCode).toBe(401);
    expect((await post('/v1/auth/login', { email: u.email, password: u.password })).statusCode).toBe(401);
  });

  it('DELETE tolerates Content-Type: application/json with an empty body', async () => {
    const u = await register(ctx.app);
    const del = await ctx.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: { ...bearer(u.accessToken), 'content-type': 'application/json' },
    });
    expect(del.statusCode).toBe(204);
  });
});

describe('rate limiting', () => {
  it('limits auth routes per IP', async () => {
    const limited = await setup({ AUTH_RATE_LIMIT_MAX: '3' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await limited.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          payload: { email: 'x@example.com', password: 'password123' },
        });
        codes.push(r.statusCode);
        if (r.statusCode === 429) expect(r.json().error.code).toBe('rate_limited');
      }
      expect(codes).toEqual([401, 401, 401, 429, 429]);
      // Non-auth routes are not limited.
      const h = await limited.app.inject({ method: 'GET', url: '/healthz' });
      expect(h.statusCode).toBe(200);
    } finally {
      await teardown(limited);
    }
  });
});
