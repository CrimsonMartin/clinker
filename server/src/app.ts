import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Pool } from './db.js';
import { ApiError, errorBody, unauthorized } from './errors.js';
import { noopMailer, type Mailer } from './mailer.js';
import { AccessTokens } from './tokens.js';
import { authRoutes, registrationOpen } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { syncRoutes } from './routes/sync.js';
import { resetPageRoute } from './routes/resetPage.js';
import { privacyPageRoute } from './routes/privacyPage.js';
import { metaRoutes } from './routes/meta.js';
import type { FetchLike } from './doi.js';
import { clientIp, rateLimitBucket } from './clientIp.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    deps: AppDeps;
    requireAuth: (req: import('fastify').FastifyRequest) => Promise<void>;
  }
}

export interface AppDeps {
  config: Config;
  pool: Pool;
  mailer: Mailer;
  accessTokens: AccessTokens;
}

export interface BuildAppOptions {
  config: Config;
  pool: Pool;
  mailer?: Mailer;
  logger?: boolean | object;
  /** Outbound fetch used for metadata lookups (tests inject a mock). */
  fetch?: FetchLike;
}

const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension):\/\/[A-Za-z0-9._-]+$/;

export function isAllowedOrigin(origin: string, extra: string[]): boolean {
  return EXTENSION_ORIGIN.test(origin) || extra.includes(origin);
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, pool } = opts;
  const app = Fastify({
    logger:
      opts.logger === undefined
        ? {
            level: config.logLevel,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          }
        : opts.logger,
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024, // default for small auth bodies; sync PUT overrides
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, allErrors: false } },
  });

  const deps: AppDeps = {
    config,
    pool,
    mailer: opts.mailer ?? noopMailer,
    accessTokens: new AccessTokens(config.jwtSecret, config.accessTokenTtlSec),
  };
  app.decorate('deps', deps);
  app.decorateRequest('userId', '');

  // Every response (incl. errors and 404s): never let a browser sniff a JSON body into HTML.
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    return payload;
  });

  // Accept an empty body with Content-Type: application/json (common with fetch() wrappers).
  const defaultJson = app.getDefaultJsonParser('error', 'error');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '' || (typeof body === 'string' && body.trim() === '')) return done(null, undefined);
    defaultJson(req, body as string, done);
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser clients send no Origin; CORS headers are irrelevant for them.
      if (!origin) return cb(null, true);
      cb(null, isAllowedOrigin(origin, config.corsExtraOrigins));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  });

  await app.register(rateLimit, {
    global: false,
    // CF-Connecting-IP only when the peer is a Cloudflare edge (see clientIp.ts).
    keyGenerator: (req) => rateLimitBucket(clientIp(req)),
    errorResponseBuilder: (_req, ctx) =>
      new ApiError(429, 'rate_limited', `Too many requests, retry in ${ctx.after}`),
  });

  app.decorate('requireAuth', async (req) => {
    const header = req.headers.authorization;
    const match = header && /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) throw unauthorized();
    const claims = await deps.accessTokens.verify(match[1]!);
    if (!claims) throw unauthorized('Invalid or expired access token');
    // One PK lookup: the user must still exist, and the token must not predate the last
    // password change / "sign out everywhere".
    const { rows } = await pool.query<{ current: boolean }>(
      'SELECT tokens_valid_after <= to_timestamp($2) AS current FROM users WHERE id = $1',
      [claims.userId, claims.iat],
    );
    if (!rows[0]) throw unauthorized('User no longer exists');
    if (!rows[0].current) throw unauthorized('Access token has been revoked');
    req.userId = claims.userId;
  });

  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.extra));
    }
    if ((err as FastifyError).validation) {
      return reply.status(400).send(errorBody('invalid_request', err.message));
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 413) return reply.status(413).send(errorBody('payload_too_large', 'Request body too large'));
    if (status === 415) return reply.status(415).send(errorBody('unsupported_media_type', err.message));
    if (status >= 400 && status < 500) return reply.status(status).send(errorBody('invalid_request', err.message));
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(errorBody('internal_error', 'Internal server error'));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(errorBody('not_found', `Route ${req.method} ${req.url.split('?')[0]} not found`));
  });

  app.get('/healthz', { logLevel: 'warn' }, async () => ({ ok: true }));
  app.get('/readyz', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.status(503).send(errorBody('db_unavailable', 'Database not reachable'));
    }
  });

  // Public server capabilities so clients can hide features this deployment doesn't offer.
  app.get(
    '/v1/config',
    { config: { rateLimit: { max: config.metaRateLimitMax, timeWindow: '1 minute' } } },
    async () => ({
      passwordReset: deps.mailer.enabled,
      registrationOpen: await registrationOpen(pool, config),
    }),
  );

  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(meRoutes, { prefix: '/v1' });
  await app.register(syncRoutes, { prefix: '/v1' });
  await app.register(metaRoutes, { prefix: '/v1', fetch: opts.fetch });
  await app.register(resetPageRoute);
  await app.register(privacyPageRoute);

  return app;
}

/**
 * Delete expired tokens. Safe to run from multiple replicas. Revoked refresh tokens are kept
 * until they would have expired so that replaying one is still detected as reuse.
 */
export async function purgeExpiredTokens(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'`);
  await pool.query(`DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'`);
}
