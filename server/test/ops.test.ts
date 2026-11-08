import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db.js';
import { setup, teardown, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(() => teardown(ctx));

describe('ops endpoints', () => {
  it('GET /healthz', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('GET /readyz when the DB is reachable', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
  });

  it('unknown routes use the error envelope', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
  });

  it('migrations are idempotent', async () => {
    expect(await migrate(ctx.pool)).toEqual([]);
    const { rows } = await ctx.pool.query('SELECT version FROM schema_migrations');
    expect(rows.map((r) => r.version)).toContain('001_init.sql');
    expect(rows.map((r) => r.version)).toContain('002_session_security.sql');
  });

  it('serves the password reset page', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/reset-password' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('CORS', () => {
  const preflight = (origin: string) =>
    ctx.app.inject({
      method: 'OPTIONS',
      url: '/v1/sync',
      headers: {
        origin,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

  it.each(['chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'moz-extension://1b2c3d4e-0000-4000-8000-123456789abc', 'https://app.example.com'])(
    'allows %s with Authorization header',
    async (origin) => {
      const res = await preflight(origin);
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization');
      expect(String(res.headers['access-control-allow-methods'])).toContain('PUT');
    },
  );

  it('does not allow arbitrary web origins', async () => {
    const res = await preflight('https://evil.example.org');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('adds CORS headers to actual responses', async () => {
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const res = await ctx.app.inject({ method: 'GET', url: '/healthz', headers: { origin } });
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });
});

describe('privacy policy page', () => {
  it('serves the public privacy policy', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/privacy' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Citation Linker Privacy Policy');
    expect(res.body).toContain('their web addresses are not stored');
  });
});
