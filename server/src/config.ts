export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  host: string;
  corsExtraOrigins: string[];
  smtpUrl: string | null;
  mailFrom: string | null;
  publicBaseUrl: string;
  logLevel: string;
  trustProxy: boolean;
  authRateLimitMax: number;
  metaRateLimitMax: number;
  /** PUT /v1/sync requests per minute per user. */
  syncRateLimitMax: number;
  /** Maximum number of accounts; 0 = unlimited. */
  maxUsers: number;
  registrationEnabled: boolean;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  resetTokenTtlSec: number;
}

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new ConfigError(`Missing required environment variable ${name}`);
  return v;
}

function int(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const raw = env[name]?.trim();
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ConfigError(`${name} must be a positive integer`);
  return n;
}

function nonNegativeInt(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const raw = env[name]?.trim();
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ConfigError(`${name} must be a non-negative integer`);
  return n;
}

function bool(env: NodeJS.ProcessEnv, name: string, def: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return def;
  if (['true', '1', 'yes'].includes(raw)) return true;
  if (['false', '0', 'no'].includes(raw)) return false;
  throw new ConfigError(`${name} must be true or false`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = required(env, 'DATABASE_URL');
  const jwtSecret = required(env, 'JWT_SECRET');
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new ConfigError('JWT_SECRET must be at least 32 bytes (e.g. `openssl rand -base64 48`)');
  }
  const smtpUrl = env.SMTP_URL?.trim() || null;
  const mailFrom = env.MAIL_FROM?.trim() || null;
  if (smtpUrl && !mailFrom) throw new ConfigError('MAIL_FROM is required when SMTP_URL is set');

  const publicBaseUrl = (env.PUBLIC_BASE_URL?.trim() || 'https://clinker.lanerate.io').replace(/\/+$/, '');
  try {
    new URL(publicBaseUrl);
  } catch {
    throw new ConfigError('PUBLIC_BASE_URL must be an absolute URL');
  }

  return {
    databaseUrl,
    jwtSecret,
    port: int(env, 'PORT', 8080),
    host: env.HOST?.trim() || '0.0.0.0',
    corsExtraOrigins: (env.CORS_EXTRA_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    smtpUrl,
    mailFrom,
    publicBaseUrl,
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    trustProxy: (env.TRUST_PROXY ?? 'true').trim().toLowerCase() !== 'false',
    authRateLimitMax: int(env, 'AUTH_RATE_LIMIT_MAX', 10),
    metaRateLimitMax: int(env, 'META_RATE_LIMIT_MAX', 60),
    syncRateLimitMax: int(env, 'SYNC_RATE_LIMIT_MAX', 30),
    maxUsers: nonNegativeInt(env, 'MAX_USERS', 0),
    registrationEnabled: bool(env, 'REGISTRATION_ENABLED', true),
    accessTokenTtlSec: 15 * 60,
    refreshTokenTtlSec: 30 * 24 * 60 * 60,
    resetTokenTtlSec: 60 * 60,
  };
}
