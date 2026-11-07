import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, register, resetDb, setup, teardown, TEST_JWT_SECRET, type AuthResponse, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let user: AuthResponse;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(() => teardown(ctx));
beforeEach(async () => {
  await resetDb(ctx.pool);
  user = await register(ctx.app);
});

const put = (payload: unknown, token = user.accessToken) =>
  ctx.app.inject({ method: 'PUT', url: '/v1/sync', headers: bearer(token), payload: payload as object });
const get = (token = user.accessToken) => ctx.app.inject({ method: 'GET', url: '/v1/sync', headers: bearer(token) });

const sample = { tabsData: { t1: { url: 'https://example.com', title: 'Ex' } }, tabsMetadata: {}, citationTree: { roots: [] } };

describe('sync', () => {
  it('GET returns 404 not_found before first upload', async () => {
    const res = await get();
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('first upload with baseVersion 0 or null creates version 1', async () => {
    const res = await put({ data: sample, baseVersion: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: sample, version: 1, updatedAt: expect.any(String) });
    const g = await get();
    expect(g.statusCode).toBe(200);
    expect(g.json()).toEqual(res.json());

    const other = await register(ctx.app);
    const res2 = await put({ data: { x: 1 }, baseVersion: null }, other.accessToken);
    expect(res2.json().version).toBe(1);
  });

  it('optimistic concurrency: matching baseVersion bumps version, stale one gets 409 with current doc', async () => {
    await put({ data: { n: 1 }, baseVersion: 0 });
    const v2 = await put({ data: { n: 2 }, baseVersion: 1 });
    expect(v2.statusCode).toBe(200);
    expect(v2.json().version).toBe(2);

    const stale = await put({ data: { n: 'stale' }, baseVersion: 1 });
    expect(stale.statusCode).toBe(409);
    const body = stale.json();
    expect(body.error.code).toBe('version_conflict');
    expect(body.current).toEqual({ data: { n: 2 }, version: 2, updatedAt: v2.json().updatedAt });

    // Stored doc unchanged by the rejected write.
    expect((await get()).json().data).toEqual({ n: 2 });

    // baseVersion 0 when a doc already exists is also a conflict.
    const zero = await put({ data: { n: 0 }, baseVersion: 0 });
    expect(zero.statusCode).toBe(409);
    expect(zero.json().current.version).toBe(2);

    // Future version is a conflict too.
    expect((await put({ data: {}, baseVersion: 99 })).statusCode).toBe(409);
  });

  it('baseVersion null force-overwrites and still bumps the version', async () => {
    await put({ data: { n: 1 }, baseVersion: 0 });
    await put({ data: { n: 2 }, baseVersion: 1 });
    const forced = await put({ data: { forced: true }, baseVersion: null });
    expect(forced.statusCode).toBe(200);
    expect(forced.json()).toMatchObject({ data: { forced: true }, version: 3 });
  });

  it('conflict on a non-existent doc returns current: null', async () => {
    const res = await put({ data: {}, baseVersion: 5 });
    expect(res.statusCode).toBe(409);
    expect(res.json().current).toBeNull();
  });

  it('concurrent writers with the same baseVersion: exactly one wins', async () => {
    await put({ data: { n: 1 }, baseVersion: 0 });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => put({ data: { writer: i }, baseVersion: 1 })));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
    expect((await get()).json().version).toBe(2);
  });

  it('documents are isolated per user', async () => {
    await put({ data: { mine: true }, baseVersion: 0 });
    const other = await register(ctx.app);
    expect((await get(other.accessToken)).statusCode).toBe(404);
  });

  it('validates the body', async () => {
    for (const payload of [
      { data: [1, 2], baseVersion: 0 },
      { data: 'str', baseVersion: 0 },
      { data: null, baseVersion: 0 },
      { data: {} },
      { baseVersion: 0 },
      { data: {}, baseVersion: '1' },
      { data: {}, baseVersion: -1 },
      { data: {}, baseVersion: 1.5 },
    ]) {
      const res = await put(payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe('invalid_request');
    }
  });

  it('accepts bodies up to ~5 MB and rejects larger ones with 413', async () => {
    const big = { blob: 'a'.repeat(4.5 * 1024 * 1024) };
    const ok = await put({ data: big, baseVersion: null });
    expect(ok.statusCode).toBe(200);

    const tooBig = { blob: 'a'.repeat(5 * 1024 * 1024 + 10) };
    const res = await put({ data: tooBig, baseVersion: null });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('payload_too_large');
  });

  it('rejects data containing NUL characters (not storable in jsonb) with 400', async () => {
    const res = await put({ data: { s: 'a\u0000b' }, baseVersion: null });
    expect(res.statusCode).toBe(400);
  });
});

describe('auth required', () => {
  const routes = [
    ['GET', '/v1/me'],
    ['DELETE', '/v1/me'],
    ['GET', '/v1/sync'],
    ['PUT', '/v1/sync'],
  ] as const;

  async function expired() {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.user.id)
      .setIssuer('clinker')
      .setAudience('clinker-api')
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 60)
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  }

  async function wrongSecret() {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.user.id)
      .setIssuer('clinker')
      .setAudience('clinker-api')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('some-other-secret-that-is-long-enough-xxxxxxxx'));
  }

  it.each(routes)('%s %s returns 401 without/with bad tokens', async (method, url) => {
    const headerSets: Array<Record<string, string>> = [
      {},
      { authorization: 'Bearer' },
      { authorization: 'Basic abc' },
      { authorization: 'Bearer not.a.jwt' },
      bearer(await expired()),
      bearer(await wrongSecret()),
      bearer(user.refreshToken),
    ];
    for (const headers of headerSets) {
      const res = await ctx.app.inject({ method, url, headers, payload: method === 'PUT' ? { data: {}, baseVersion: null } : undefined });
      expect(res.statusCode, JSON.stringify(headers)).toBe(401);
      expect(res.json().error.code).toBe('unauthorized');
    }
    // Nothing was written / deleted.
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM users');
    expect(rows[0].n).toBe(1);
  });
});
