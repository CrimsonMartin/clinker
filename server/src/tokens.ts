import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const JWT_ISSUER = 'clinker';
export const JWT_AUDIENCE = 'clinker-api';

/** 256-bit random opaque token, base64url encoded. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(secret: string, private readonly ttlSec: number) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(userId: string): Promise<{ token: string; expiresAt: Date }> {
    // iat keeps millisecond precision (RFC 7519 NumericDate may be fractional) so revocation via
    // users.tokens_valid_after can't be dodged by a token minted in the same second.
    const now = Date.now() / 1000;
    const exp = Math.floor(now) + this.ttlSec;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** Returns the subject (user id) and issued-at (unix seconds), or null if invalid/expired. */
  async verify(token: string): Promise<{ userId: string; iat: number } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || typeof payload.iat !== 'number') return null;
      return { userId: payload.sub, iat: payload.iat };
    } catch {
      return null;
    }
  }
}
