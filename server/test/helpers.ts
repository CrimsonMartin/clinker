import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createPool, migrate, type Pool } from '../src/db.js';
import type { Mailer, MailMessage } from '../src/mailer.js';
import type { FetchLike } from '../src/doi.js';

export const TEST_JWT_SECRET = 'test-secret-'.padEnd(48, 'x');

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Example:\n' +
        '  docker run -d --rm --name clinker-test-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine\n' +
        '  TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test',
    );
  }
  return url;
}

export class FakeMailer implements Mailer {
  readonly enabled = true;
  sent: MailMessage[] = [];
  private waiters: Array<(m: MailMessage) => void> = [];
  async send(msg: MailMessage) {
    this.sent.push(msg);
    this.waiters.shift()?.(msg);
  }
  next(timeoutMs = 5000): Promise<MailMessage> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no mail sent')), timeoutMs);
      this.waiters.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
  }
}

export interface TestCtx {
  app: FastifyInstance;
  pool: Pool;
  config: Config;
  mailer: FakeMailer;
}

export async function setup(
  envOverrides: Record<string, string> = {},
  appOpts: { fetch?: FetchLike } = {},
): Promise<TestCtx> {
  const config = loadConfig({
    DATABASE_URL: testDatabaseUrl(),
    JWT_SECRET: TEST_JWT_SECRET,
    AUTH_RATE_LIMIT_MAX: '10000',
    CORS_EXTRA_ORIGINS: 'https://app.example.com',
    PUBLIC_BASE_URL: 'https://clinker.test',
    ...envOverrides,
  });
  const pool = createPool(config.databaseUrl);
  await migrate(pool);
  await resetDb(pool);
  const mailer = new FakeMailer();
  const app = await buildApp({ config, pool, mailer, logger: false, fetch: appOpts.fetch });
  await app.ready();
  return { app, pool, config, mailer };
}

export async function teardown(ctx: TestCtx | undefined) {
  if (!ctx) return;
  await ctx.app.close();
  await ctx.pool.end();
}

export async function resetDb(pool: Pool) {
  await pool.query('TRUNCATE users, refresh_tokens, password_reset_tokens, sync_docs RESTART IDENTITY CASCADE');
}

let counter = 0;
export function uniqueEmail() {
  return `user${Date.now()}_${counter++}@example.com`;
}

export async function register(app: FastifyInstance, email = uniqueEmail(), password = 'correct horse battery') {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password } });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  return { ...(res.json() as AuthResponse), email, password };
}

export interface AuthResponse {
  user: { id: string; email: string; createdAt: string };
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
