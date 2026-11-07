import type { FastifyInstance } from 'fastify';
import { ApiError } from '../errors.js';
import {
  DoiNotFoundError,
  TtlLruCache,
  normalizeDoi,
  resolveDoi,
  type CslItem,
  type FetchLike,
} from '../doi.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;

export interface MetaRoutesOptions {
  /** Injected for tests; defaults to the global fetch at call time. */
  fetch?: FetchLike;
}

/** Bibliographic metadata lookups. Keeps the extension's host_permissions limited to our API. */
export async function metaRoutes(app: FastifyInstance, opts: MetaRoutesOptions) {
  const { config } = app.deps;
  const cache = new TtlLruCache<CslItem | null>(CACHE_MAX_ENTRIES);
  const inFlight = new Map<string, Promise<CslItem | null>>();

  app.addHook('preHandler', app.requireAuth);

  const lookup = (doi: string): Promise<CslItem | null> => {
    const key = doi.toLowerCase();
    const cached = cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    let p = inFlight.get(key);
    if (!p) {
      const fetchFn: FetchLike = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
      p = resolveDoi(doi, fetchFn)
        .then((item) => {
          cache.set(key, item, DAY_MS);
          return item;
        })
        .catch((err) => {
          if (err instanceof DoiNotFoundError) {
            cache.set(key, null, NOT_FOUND_TTL_MS);
            return null;
          }
          throw err;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, p);
    }
    return p;
  };

  // DOIs contain "/", so take the rest of the path (clients should still encodeURIComponent it).
  app.get<{ Params: { '*': string } }>(
    '/meta/doi/*',
    { config: { rateLimit: { max: config.metaRateLimitMax, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const doi = normalizeDoi(req.params['*'] ?? '');
      if (!doi) throw new ApiError(400, 'invalid_doi', 'Expected a DOI like 10.1234/abc');
      let item: CslItem | null;
      try {
        item = await lookup(doi);
      } catch (err) {
        req.log.warn({ err, doi }, 'DOI lookup failed');
        throw new ApiError(502, 'upstream_error', 'DOI registry lookup failed, try again later');
      }
      if (!item) throw new ApiError(404, 'doi_not_found', `No metadata found for DOI ${doi}`);
      reply.header('Cache-Control', 'private, max-age=86400');
      return item;
    },
  );
}
