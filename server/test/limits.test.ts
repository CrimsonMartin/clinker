import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { bearer, register, setup, teardown, uniqueEmail, type TestCtx } from './helpers.js';

async function withCtx(env: Record<string, string>, fn: (ctx: TestCtx) => Promise<void>) {
  const ctx = await setup(env);
  try {
    await fn(ctx);
  } finally {
    await teardown(ctx);
  }
}

const registerRaw = (ctx: TestCtx) =>
  ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: uniqueEmail(), password: 'password123' } });

const getConfig = async (ctx: TestCtx) => (await ctx.app.inject({ method: 'GET', url: '/v1/config' })).json();

describe('config parsing', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32) };
  it('defaults', () => {
    const c = loadConfig(base);
    expect(c.maxUsers).toBe(0);
    expect(c.registrationEnabled).toBe(true);
    expect(c.syncRateLimitMax).toBe(30);
  });
  it('parses and validates overrides', () => {
    const c = loadConfig({ ...base, MAX_USERS: '5', REGISTRATION_ENABLED: 'false', SYNC_RATE_LIMIT_MAX: '7' });
    expect(c).toMatchObject({ maxUsers: 5, registrationEnabled: false, syncRateLimitMax: 7 });
    expect(() => loadConfig({ ...base, MAX_USERS: '-1' })).toThrow(/MAX_USERS/);
    expect(() => loadConfig({ ...base, REGISTRATION_ENABLED: 'maybe' })).toThrow(/REGISTRATION_ENABLED/);
  });
});

describe('registration limits', () => {
  it('REGISTRATION_ENABLED=false closes registration', () =>
    withCtx({ REGISTRATION_ENABLED: 'false' }, async (ctx) => {
      const res = await registerRaw(ctx);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('registration_closed');
      expect(await getConfig(ctx)).toEqual({ passwordReset: true, registrationOpen: false });
    }));

  it('MAX_USERS caps the number of accounts', () =>
    withCtx({ MAX_USERS: '2' }, async (ctx) => {
      expect((await getConfig(ctx)).registrationOpen).toBe(true);
      expect((await registerRaw(ctx)).statusCode).toBe(201);
      expect((await registerRaw(ctx)).statusCode).toBe(201);
      const third = await registerRaw(ctx);
      expect(third.statusCode).toBe(403);
      expect(third.json().error.code).toBe('registration_closed');
      expect((await getConfig(ctx)).registrationOpen).toBe(false);
      const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM users');
      expect(rows[0].n).toBe(2);
    }));

  it('MAX_USERS holds under concurrent sign-ups', () =>
    withCtx({ MAX_USERS: '3' }, async (ctx) => {
      const results = await Promise.all(Array.from({ length: 8 }, () => registerRaw(ctx)));
      expect(results.filter((r) => r.statusCode === 201)).toHaveLength(3);
      expect(results.filter((r) => r.statusCode === 403)).toHaveLength(5);
    }));
});

describe('GET /v1/config', () => {
  it('reports passwordReset=false when no mailer is configured', async () => {
    const ctx = await setup();
    try {
      // setup() wires a fake mailer; rebuild without one.
      const { buildApp } = await import('../src/app.js');
      const app = await buildApp({ config: ctx.config, pool: ctx.pool, logger: false });
      try {
        const res = await app.inject({ method: 'GET', url: '/v1/config' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ passwordReset: false, registrationOpen: true });
      } finally {
        await app.close();
      }
    } finally {
      await teardown(ctx);
    }
  });
});

describe('sync rate limit', () => {
  it('limits PUT /v1/sync per user, not per IP', () =>
    withCtx({ SYNC_RATE_LIMIT_MAX: '3' }, async (ctx) => {
      const a = await register(ctx.app);
      const b = await register(ctx.app);
      const put = (token: string) =>
        ctx.app.inject({ method: 'PUT', url: '/v1/sync', headers: bearer(token), payload: { data: {}, baseVersion: null } });
      const codes = [];
      for (let i = 0; i < 4; i++) codes.push((await put(a.accessToken)).statusCode);
      expect(codes).toEqual([200, 200, 200, 429]);
      // Same IP, different user: unaffected.
      expect((await put(b.accessToken)).statusCode).toBe(200);
      // GET is not limited.
      expect((await ctx.app.inject({ method: 'GET', url: '/v1/sync', headers: bearer(a.accessToken) })).statusCode).toBe(200);
      // Unauthenticated requests are rejected by auth before the limiter runs.
      expect((await put('bogus')).statusCode).toBe(401);
    }));
});
