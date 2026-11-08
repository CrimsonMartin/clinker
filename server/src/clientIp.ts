import { BlockList, isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';

// Cloudflare's published edge ranges, copied from
//   https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6 (fetched 2026-11-07).
// CF-Connecting-IP is only trusted when the TCP peer (req.ip, per trustProxy) is in one of these,
// because anyone who reaches the origin directly can set that header to anything.
// These lists change rarely; re-check them occasionally.
export const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

export const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

const cloudflare = new BlockList();
for (const cidr of CLOUDFLARE_IPV4) {
  const [net, prefix] = cidr.split('/');
  cloudflare.addSubnet(net!, Number(prefix), 'ipv4');
}
for (const cidr of CLOUDFLARE_IPV6) {
  const [net, prefix] = cidr.split('/');
  cloudflare.addSubnet(net!, Number(prefix), 'ipv6');
}

/** Strip the IPv4-mapped IPv6 prefix (`::ffff:1.2.3.4` -> `1.2.3.4`). */
function unmap(ip: string): string {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return m ? m[1]! : ip;
}

export function isCloudflareIp(ip: string): boolean {
  const addr = unmap(ip);
  const family = isIP(addr);
  if (family === 4) return cloudflare.check(addr, 'ipv4');
  if (family === 6) return cloudflare.check(addr, 'ipv6');
  return false;
}

/** Expand an IPv6 address to 8 numeric hextets (null if it can't be parsed). */
function ipv6Hextets(ip: string): number[] | null {
  let addr = ip.split('%')[0]!;
  // Embedded IPv4 tail (e.g. ::ffff:1.2.3.4 or 64:ff9b::1.2.3.4) -> two hextets.
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(addr);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    addr = addr.slice(0, v4.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || head.length + fill + tail.length !== 8) return null;
  const parts = [...head, ...Array<string>(fill).fill('0'), ...tail].map((h) => parseInt(h, 16));
  return parts.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff) ? null : parts;
}

/**
 * Normalise an address into a rate-limit bucket: IPv4 as-is, IPv6 by /64 (one subscriber
 * usually controls a whole /64, so per-address keys would be trivial to rotate).
 */
export function rateLimitBucket(ip: string): string {
  const addr = unmap(ip);
  if (isIP(addr) !== 6) return addr.toLowerCase();
  const h = ipv6Hextets(addr);
  if (!h) return addr.toLowerCase();
  return `${h.slice(0, 4).map((n) => n.toString(16)).join(':')}::/64`;
}

/**
 * The client address to rate-limit on. We sit behind Cloudflare (proxied) + ingress-nginx, so for
 * legitimate traffic req.ip is a Cloudflare edge and the real client is in CF-Connecting-IP.
 * Anything else (direct-to-origin traffic) is keyed on the peer address itself.
 */
export function clientIp(req: FastifyRequest): string {
  if (isCloudflareIp(req.ip)) {
    const raw = req.headers['cf-connecting-ip'];
    const cf = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (cf && isIP(cf)) return cf;
  }
  return req.ip;
}
