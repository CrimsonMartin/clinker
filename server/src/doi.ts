// DOI -> CSL-JSON lookup (doi.org content negotiation, falling back to the Crossref REST API),
// with validation/normalization and a small in-memory TTL+LRU cache.

export const DOI_RE = /^10\.\d{4,9}\/\S+$/;
export const MAX_DOI_LENGTH = 256;
// Query/fragment delimiters, backslash, whitespace and C0/C1 control characters.
const UNSAFE_DOI_CHARS = /[?#\\\s\u0000-\u001f\u007f-\u009f]/;

/** Normalize user input ("doi:10.1/x", "https://doi.org/10.1/x", " 10.1/X ") to a bare DOI, or null. */
export function normalizeDoi(input: string): string | null {
  let s = (input ?? '').trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  s = s
    .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
  if (!s || s.length > MAX_DOI_LENGTH || !DOI_RE.test(s)) return null;
  // The DOI ends up in an upstream URL path: refuse anything that could change which resource
  // (or host) we hit: dot segments, query/fragment, backslashes, whitespace, control chars.
  if (UNSAFE_DOI_CHARS.test(s) || s.split('/').some((seg) => seg === '.' || seg === '..')) return null;
  return s;
}

/** `https://doi.org/<doi>` with every path segment percent-encoded. */
export function doiOrgUrl(doi: string): string {
  return `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`;
}

export type CslName = { family?: string; given?: string; literal?: string; suffix?: string };
export type CslDate = { 'date-parts'?: number[][]; literal?: string };
export type CslItem = Record<string, unknown> & { type: string };

const STRING_FIELDS = [
  'title',
  'title-short',
  'container-title',
  'container-title-short',
  'collection-title',
  'event-title',
  'volume',
  'issue',
  'page',
  'edition',
  'number',
  'genre',
  'DOI',
  'ISBN',
  'ISSN',
  'PMID',
  'PMCID',
  'URL',
  'publisher',
  'publisher-place',
  'language',
  'abstract',
  'source',
] as const;

const NAME_FIELDS = ['author', 'editor', 'translator'] as const;
const DATE_FIELDS = ['issued', 'accessed'] as const;

// Crossref "type" values -> CSL types.
const CROSSREF_TYPES: Record<string, string> = {
  'journal-article': 'article-journal',
  'proceedings-article': 'paper-conference',
  'book-chapter': 'chapter',
  'book-section': 'chapter',
  'book-part': 'chapter',
  'reference-entry': 'entry-encyclopedia',
  book: 'book',
  monograph: 'book',
  'edited-book': 'book',
  'reference-book': 'book',
  'book-set': 'book',
  'book-series': 'book',
  report: 'report',
  'report-series': 'report',
  dissertation: 'thesis',
  'posted-content': 'article',
  dataset: 'dataset',
  standard: 'standard',
  component: 'article',
  other: 'document',
};

const CSL_TYPES = new Set([
  'article',
  'article-journal',
  'article-magazine',
  'article-newspaper',
  'bill',
  'book',
  'broadcast',
  'chapter',
  'dataset',
  'document',
  'entry',
  'entry-dictionary',
  'entry-encyclopedia',
  'figure',
  'graphic',
  'interview',
  'legal_case',
  'legislation',
  'manuscript',
  'map',
  'motion_picture',
  'musical_score',
  'pamphlet',
  'paper-conference',
  'patent',
  'personal_communication',
  'post',
  'post-weblog',
  'report',
  'review',
  'review-book',
  'song',
  'software',
  'speech',
  'standard',
  'thesis',
  'treaty',
  'webpage',
]);

function str(v: unknown, max = 2000): string | undefined {
  if (Array.isArray(v)) v = v.find((x) => typeof x === 'string' || typeof x === 'number');
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v)
    .replace(/<[^>]*>/g, '') // Crossref titles/abstracts may carry JATS markup
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function names(v: unknown): CslName[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CslName[] = [];
  for (const raw of v.slice(0, 1000)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const n: CslName = {};
    const family = str(r.family, 200);
    const given = str(r.given, 200);
    const literal = str(r.literal, 300) ?? str(r.name, 300);
    const suffix = str(r.suffix, 50);
    if (family) {
      n.family = family;
      if (given) n.given = given;
      if (suffix) n.suffix = suffix;
    } else if (literal) {
      n.literal = literal;
    } else if (given) {
      n.literal = given;
    } else continue;
    out.push(n);
  }
  return out.length ? out : undefined;
}

function date(v: unknown): CslDate | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const parts = r['date-parts'];
  if (Array.isArray(parts) && Array.isArray(parts[0])) {
    const p = (parts[0] as unknown[])
      .slice(0, 3)
      .map((x) => (typeof x === 'string' ? parseInt(x, 10) : x))
      .filter((x): x is number => typeof x === 'number' && Number.isInteger(x));
    if (p.length && p[0]! >= 1000 && p[0]! <= 2999) return { 'date-parts': [p] };
  }
  const literal = str(r.literal ?? r.raw, 100);
  return literal ? { literal } : undefined;
}

/** Keep only well-formed CSL fields; coerce arrays to strings; map Crossref types. */
export function normalizeCsl(raw: unknown, doi: string): CslItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rawType = typeof r.type === 'string' ? r.type : '';
  const type = CSL_TYPES.has(rawType) ? rawType : (CROSSREF_TYPES[rawType] ?? 'article-journal');
  const out: CslItem = { type };
  for (const f of STRING_FIELDS) {
    const v = str(r[f], f === 'abstract' ? 5000 : 1000);
    if (v) out[f] = v;
  }
  for (const f of NAME_FIELDS) {
    const v = names(r[f]);
    if (v) out[f] = v;
  }
  for (const f of DATE_FIELDS) {
    const v = date(r[f]);
    if (v) out[f] = v;
  }
  // Crossref API: prefer print/online publication dates when "issued" is absent.
  if (!out.issued) {
    const d = date(r['published-print']) ?? date(r['published-online']) ?? date(r.published) ?? date(r.created);
    if (d) out.issued = d;
  }
  if (!out['container-title'] && type === 'article-journal') {
    const short = str(r['short-container-title']);
    if (short) out['container-title'] = short;
  }
  delete out['container-title-short'];
  out.DOI = doi;
  if (!out.URL) out.URL = `https://doi.org/${doi}`;
  if (!out.title) return null;
  return out;
}

export class DoiNotFoundError extends Error {}
export class DoiUpstreamError extends Error {}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const USER_AGENT = 'Clinker/1.0 (+https://clinker.lanerate.io; mailto:support@lanerate.io)';

export const MAX_UPSTREAM_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

/**
 * Hosts doi.org content negotiation redirects to (Crossref, DataCite/Crosscite, mEDRA, JaLC),
 * plus the registries we call directly. Redirects anywhere else are refused.
 */
export const UPSTREAM_HOSTS = new Set([
  'doi.org',
  'dx.doi.org',
  'api.crossref.org',
  'data.crossref.org',
  'api.datacite.org',
  'data.datacite.org',
  'data.crosscite.org',
  'data.medra.org',
  'japanlinkcenter.org',
]);

function isAllowedUpstream(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && UPSTREAM_HOSTS.has(url.hostname);
}

/** Read a response body, aborting as soon as it exceeds `limit` bytes. */
export async function readCapped(res: Response, limit = MAX_UPSTREAM_BYTES): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await res.body?.cancel().catch(() => {});
    throw new DoiUpstreamError('Upstream response too large');
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new DoiUpstreamError('Upstream response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function fetchJson(fetchFn: FetchLike, startUrl: string, accept: string, timeoutMs: number): Promise<unknown | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = startUrl;
  let res: Response;
  for (let hops = 0; ; hops++) {
    res = await fetchFn(url, {
      headers: { Accept: accept, 'User-Agent': USER_AGENT },
      redirect: 'manual',
      signal,
    });
    if (res.status < 300 || res.status >= 400 || res.status === 304) break;
    await res.body?.cancel().catch(() => {});
    const location = res.headers.get('location');
    if (!location) throw new DoiUpstreamError(`${url} responded ${res.status} without Location`);
    if (hops >= MAX_REDIRECTS) throw new DoiUpstreamError(`${startUrl}: too many redirects`);
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      throw new DoiUpstreamError(`${url} redirected to an invalid URL`);
    }
    if (!isAllowedUpstream(next)) throw new DoiUpstreamError(`${url} redirected to disallowed host ${next.host}`);
    url = next.href;
  }
  if (res.status === 404 || res.status === 410) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new DoiUpstreamError(`${url} responded ${res.status}`);
  }
  const text = await readCapped(res);
  try {
    return JSON.parse(text);
  } catch {
    throw new DoiUpstreamError(`${url} returned non-JSON`);
  }
}

/** Resolve a DOI to CSL-JSON. Throws DoiNotFoundError / DoiUpstreamError. */
export async function resolveDoi(doi: string, fetchFn: FetchLike = fetch, timeoutMs = 8000): Promise<CslItem> {
  let notFound = 0;
  let lastError: unknown = null;

  try {
    const csl = await fetchJson(fetchFn, doiOrgUrl(doi), 'application/vnd.citationstyles.csl+json', timeoutMs);
    if (csl === null) notFound++;
    else {
      const item = normalizeCsl(csl, doi);
      if (item) return { ...item, source: 'doi.org' };
    }
  } catch (err) {
    lastError = err;
  }

  try {
    const body = (await fetchJson(
      fetchFn,
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      'application/json',
      timeoutMs,
    )) as { message?: unknown } | null;
    if (body === null) notFound++;
    else {
      const item = normalizeCsl(body.message, doi);
      if (item) return { ...item, source: 'crossref' };
    }
  } catch (err) {
    lastError = err;
  }

  if (notFound === 2 || (notFound === 1 && !lastError)) throw new DoiNotFoundError(`DOI ${doi} not found`);
  throw new DoiUpstreamError(lastError instanceof Error ? lastError.message : 'DOI lookup failed');
}

/** Minimal TTL + LRU cache (Map preserves insertion order). */
export class TtlLruCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
