import { describe, expect, it } from 'vitest';
import { isCloudflareIp, rateLimitBucket } from '../src/clientIp.js';
import { setup, teardown } from './helpers.js';

describe('isCloudflareIp', () => {
  it('matches Cloudflare IPv4/IPv6 ranges (incl. IPv4-mapped)', () => {
    expect(isCloudflareIp('173.245.48.1')).toBe(true);
    expect(isCloudflareIp('104.16.0.0')).toBe(true);
    expect(isCloudflareIp('::ffff:162.158.1.2')).toBe(true);
    expect(isCloudflareIp('2606:4700::1')).toBe(true);
    expect(isCloudflareIp('2a06:98c7:ffff::1')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isCloudflareIp('127.0.0.1')).toBe(false);
    expect(isCloudflareIp('8.8.8.8')).toBe(false);
    expect(isCloudflareIp('2001:db8::1')).toBe(false);
    expect(isCloudflareIp('not-an-ip')).toBe(false);
    expect(isCloudflareIp('')).toBe(false);
  });
});

describe('rateLimitBucket', () => {
  it('keeps IPv4 and groups IPv6 by /64', () => {
    expect(rateLimitBucket('1.2.3.4')).toBe('1.2.3.4');
    expect(rateLimitBucket('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(rateLimitBucket('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(rateLimitBucket('2001:DB8:1:2::ffff')).toBe('2001:db8:1:2::/64');
    expect(rateLimitBucket('2001:db8::')).toBe('2001:db8:0:0::/64');
  });
});

describe('rate-limit key', () => {
  const login = (app: Awaited<ReturnType<typeof setup>>['app'], remoteAddress: string, cfIp: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress,
      headers: { 'cf-connecting-ip': cfIp },
      payload: { email: 'x@example.com', password: 'password123' },
    });

  it('ignores CF-Connecting-IP from non-Cloudflare peers', async () => {
    const ctx = await setup({ AUTH_RATE_LIMIT_MAX: '2' });
    try {
      // Rotating the header from a direct peer must not dodge the limit.
      const codes = [];
      for (let i = 0; i < 3; i++) codes.push((await login(ctx.app, '203.0.113.7', `198.51.100.${i}`)).statusCode);
      expect(codes).toEqual([401, 401, 429]);
    } finally {
      await teardown(ctx);
    }
  });

  it('honours CF-Connecting-IP from Cloudflare edges', async () => {
    const ctx = await setup({ AUTH_RATE_LIMIT_MAX: '2' });
    try {
      const codes = [];
      // Same edge, different real clients: separate buckets.
      for (let i = 0; i < 3; i++) codes.push((await login(ctx.app, '173.245.48.10', `198.51.100.${i}`)).statusCode);
      expect(codes).toEqual([401, 401, 401]);
      // Same real client through different edges: one bucket.
      expect((await login(ctx.app, '162.158.0.1', '198.51.100.0')).statusCode).toBe(401);
      expect((await login(ctx.app, '104.16.0.1', '198.51.100.0')).statusCode).toBe(429);
      // Garbage header from an edge falls back to the edge address.
      expect((await login(ctx.app, '172.64.0.9', 'nonsense')).statusCode).toBe(401);
    } finally {
      await teardown(ctx);
    }
  });
});
