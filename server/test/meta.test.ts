import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bearer, register, setup, teardown, type TestCtx } from './helpers.js';
import { MAX_UPSTREAM_BYTES, TtlLruCache, normalizeCsl, normalizeDoi, resolveDoi } from '../src/doi.js';

const CSL_FROM_DOI_ORG = {
  type: 'article-journal',
  title: 'A study of <i>things</i>',
  author: [
    { family: 'Smith', given: 'John A.', sequence: 'first', affiliation: [] },
    { family: 'Doe', given: 'Jane' },
    { name: 'The Collaboration' },
  ],
  'container-title': 'Journal of Studies',
  volume: 12,
  issue: '3',
  page: '45-67',
  issued: { 'date-parts': [[2020, 5]] },
  DOI: '10.1234/JOS.2020.123',
  URL: 'http://dx.doi.org/10.1234/jos.2020.123',
  publisher: 'Study Press',
  reference: [{ key: 'ref1' }],
  'junk-field': { evil: true },
};

const CROSSREF_WORK = {
  status: 'ok',
  message: {
    type: 'book-chapter',
    title: ['A chapter'],
    'container-title': ['The Big Book'],
    author: [{ given: 'Ann', family: 'Lee' }],
    editor: [{ given: 'Bob', family: 'Ray' }],
    'published-print': { 'date-parts': [[2019, 2, 3]] },
    page: '1-10',
    publisher: 'Book House',
    ISBN: ['9780000000002'],
  },
};

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('normalizeDoi', () => {
  it('accepts bare, prefixed and URL forms', () => {
    expect(normalizeDoi('10.1234/abc')).toBe('10.1234/abc');
    expect(normalizeDoi(' doi:10.1234/abc ')).toBe('10.1234/abc');
    expect(normalizeDoi('https://doi.org/10.1234/a/b(c)')).toBe('10.1234/a/b(c)');
    expect(normalizeDoi('http://dx.doi.org/10.1234%2Fabc')).toBe('10.1234/abc');
  });
  it('rejects garbage', () => {
    expect(normalizeDoi('')).toBeNull();
    expect(normalizeDoi('11.1234/abc')).toBeNull();
    expect(normalizeDoi('10.12/abc')).toBeNull();
    expect(normalizeDoi('10.1234/' + 'x'.repeat(300))).toBeNull();
  });
  it('rejects DOIs that could change the upstream URL', () => {
    for (const bad of [
      '10.1234/../../evil',
      '10.1234/a/../b',
      '10.1234/..',
      '10.1234/./x',
      '10.1234%2F..%2F..%2Fx',
      '10.1234/a?x=1',
      '10.1234/a%3Fx=1',
      '10.1234/a#frag',
      '10.1234/a%23frag',
      '10.1234/a\\b',
      '10.1234/a%5Cb',
      '10.1234/a%20b',
      '10.1234/a%0Ab',
      '10.1234/a%00b',
      '10.1234/a%7Fb',
    ]) {
      expect(normalizeDoi(bad), bad).toBeNull();
    }
    // Dots inside a segment are fine.
    expect(normalizeDoi('10.1234/a..b')).toBe('10.1234/a..b');
    expect(normalizeDoi('10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O')).toBe(
      '10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O',
    );
  });
});

describe('normalizeCsl', () => {
  it('keeps known fields, strips markup and unknown fields, coerces numbers', () => {
    const item = normalizeCsl(CSL_FROM_DOI_ORG, '10.1234/jos.2020.123')!;
    expect(item).toEqual({
      type: 'article-journal',
      title: 'A study of things',
      author: [{ family: 'Smith', given: 'John A.' }, { family: 'Doe', given: 'Jane' }, { literal: 'The Collaboration' }],
      'container-title': 'Journal of Studies',
      volume: '12',
      issue: '3',
      page: '45-67',
      issued: { 'date-parts': [[2020, 5]] },
      DOI: '10.1234/jos.2020.123',
      URL: 'http://dx.doi.org/10.1234/jos.2020.123',
      publisher: 'Study Press',
    });
  });
  it('maps Crossref works to CSL', () => {
    const item = normalizeCsl(CROSSREF_WORK.message, '10.5555/ch')!;
    expect(item.type).toBe('chapter');
    expect(item.title).toBe('A chapter');
    expect(item['container-title']).toBe('The Big Book');
    expect(item.issued).toEqual({ 'date-parts': [[2019, 2, 3]] });
    expect(item.editor).toEqual([{ family: 'Ray', given: 'Bob' }]);
    expect(item.ISBN).toBe('9780000000002');
    expect(item.URL).toBe('https://doi.org/10.5555/ch');
  });
  it('rejects items without a title', () => {
    expect(normalizeCsl({ type: 'article-journal' }, '10.1/x')).toBeNull();
    expect(normalizeCsl(null, '10.1/x')).toBeNull();
  });
});

describe('resolveDoi', () => {
  it('uses doi.org content negotiation first', async () => {
    const fetchFn = vi.fn(async () => json(CSL_FROM_DOI_ORG));
    const item = await resolveDoi('10.1234/jos.2020.123', fetchFn);
    expect(item.source).toBe('doi.org');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://doi.org/10.1234/jos.2020.123');
    expect((init.headers as Record<string, string>).Accept).toBe('application/vnd.citationstyles.csl+json');
  });
  it('falls back to Crossref when doi.org fails', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.startsWith('https://doi.org/') ? new Response('oops', { status: 503 }) : json(CROSSREF_WORK),
    );
    const item = await resolveDoi('10.5555/ch', fetchFn);
    expect(item.source).toBe('crossref');
    expect(fetchFn.mock.calls[1]![0]).toBe('https://api.crossref.org/works/10.5555%2Fch');
  });
  it('percent-encodes each path segment for doi.org', async () => {
    const fetchFn = vi.fn(async (_url: string) => json(CSL_FROM_DOI_ORG));
    await resolveDoi('10.1002/(SICI)1097:8<693::AID>3.0.CO;2-O', fetchFn);
    expect(fetchFn.mock.calls[0]![0]).toBe('https://doi.org/10.1002/(SICI)1097%3A8%3C693%3A%3AAID%3E3.0.CO%3B2-O');
  });
  it('does not let fetch follow redirects itself', async () => {
    const fetchFn = vi.fn(async () => json(CSL_FROM_DOI_ORG));
    await resolveDoi('10.1234/x', fetchFn);
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('manual');
  });
  it('follows redirects to allowlisted registry hosts', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.startsWith('https://doi.org/')
        ? redirect('https://api.crossref.org/v1/works/10.1234%2Fx/transform')
        : json(CSL_FROM_DOI_ORG),
    );
    const item = await resolveDoi('10.1234/x', fetchFn);
    expect(item.source).toBe('doi.org');
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://doi.org/10.1234/x',
      'https://api.crossref.org/v1/works/10.1234%2Fx/transform',
    ]);
  });
  it.each([
    ['http://api.crossref.org/works/x', 'non-https'],
    ['https://169.254.169.254/latest/meta-data', 'metadata IP'],
    ['https://evil.example.com/', 'other host'],
    ['https://api.crossref.org.evil.com/', 'suffix trick'],
    ['https://user@api.crossref.org/', 'userinfo'],
    ['https://api.crossref.org:8443/', 'port'],
  ])('refuses to follow a redirect to %s (%s)', async (target) => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith('https://doi.org/')) return redirect(target);
      if (url.startsWith('https://api.crossref.org/works/')) return new Response('', { status: 404 });
      return json(CSL_FROM_DOI_ORG);
    });
    await expect(resolveDoi('10.1234/x', fetchFn)).rejects.toThrow(/disallowed host/);
    expect(calls).not.toContain(target);
  });
  it('stops after too many redirects', async () => {
    let n = 0;
    const fetchFn = vi.fn(async (url: string) =>
      url.startsWith('https://api.crossref.org/works/') ? new Response('', { status: 404 }) : redirect(`https://doi.org/hop${n++}`),
    );
    await expect(resolveDoi('10.1234/x', fetchFn)).rejects.toThrow(/too many redirects/);
    // initial request + 3 followed redirects, then the Crossref fallback
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });
  it('aborts oversized bodies while streaming', async () => {
    let pulled = 0;
    let cancelled = false;
    const chunk = new Uint8Array(256 * 1024).fill(0x20);
    const huge = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(ctrl) {
            pulled += chunk.byteLength;
            ctrl.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 200 },
      );
    const fetchFn = vi.fn(async () => huge());
    await expect(resolveDoi('10.1234/x', fetchFn)).rejects.toThrow(/too large/);
    expect(cancelled).toBe(true);
    // Stopped shortly after the cap rather than reading an unbounded body (two registries tried).
    expect(pulled).toBeLessThan(2 * (MAX_UPSTREAM_BYTES + 4 * chunk.byteLength));
  });
  it('rejects bodies whose Content-Length exceeds the cap without reading them', async () => {
    const fetchFn = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'content-length': String(MAX_UPSTREAM_BYTES + 1) } }),
    );
    await expect(resolveDoi('10.1234/x', fetchFn)).rejects.toThrow(/too large/);
  });
  it('throws not-found when both registries 404', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
    await expect(resolveDoi('10.5555/missing', fetchFn)).rejects.toThrow(/not found/);
  });
});

describe('TtlLruCache', () => {
  it('expires and evicts least recently used', () => {
    let now = 0;
    const c = new TtlLruCache<number>(2, () => now);
    c.set('a', 1, 100);
    c.set('b', 2, 100);
    expect(c.get('a')).toBe(1); // a is now most recent
    c.set('c', 3, 100); // evicts b
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    now = 200;
    expect(c.get('a')).toBeUndefined();
  });
});

describe('GET /v1/meta/doi/*', () => {
  let ctx: TestCtx;
  let token: string;
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

  beforeAll(async () => {
    ctx = await setup({ META_RATE_LIMIT_MAX: '8' }, { fetch: fetchMock });
    token = (await register(ctx.app)).accessToken;
  });
  afterAll(() => teardown(ctx));
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('requires auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/meta/doi/10.1234/abc' });
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns normalized CSL-JSON and caches it', async () => {
    fetchMock.mockImplementation(async () => json(CSL_FROM_DOI_ORG));
    const url = '/v1/meta/doi/' + encodeURIComponent('10.1234/JOS.2020.123');
    const res = await ctx.app.inject({ method: 'GET', url, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('A study of things');
    expect(body.DOI).toBe('10.1234/JOS.2020.123');
    expect(body.source).toBe('doi.org');
    expect(res.headers['cache-control']).toContain('max-age=86400');

    // Unencoded slash + different case hits the cache
    const res2 = await ctx.app.inject({ method: 'GET', url: '/v1/meta/doi/10.1234/jos.2020.123', headers: bearer(token) });
    expect(res2.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('400s on an invalid DOI', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/meta/doi/not-a-doi', headers: bearer(token) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_doi');
    const traversal = await ctx.app.inject({
      method: 'GET',
      url: '/v1/meta/doi/' + encodeURIComponent('10.1234/../../admin?x=1'),
      headers: bearer(token),
    });
    expect(traversal.statusCode).toBe(400);
    expect(traversal.json().error.code).toBe('invalid_doi');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404s when the DOI does not exist', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 404 }));
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/meta/doi/10.9999/nope', headers: bearer(token) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('doi_not_found');
  });

  it('502s when upstream is down', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/meta/doi/10.9999/down', headers: bearer(token) });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('upstream_error');
  });

  it('rate-limits', async () => {
    fetchMock.mockImplementation(async () => json(CSL_FROM_DOI_ORG));
    let last = 0;
    for (let i = 0; i < 10; i++) {
      const res = await ctx.app.inject({ method: 'GET', url: '/v1/meta/doi/10.1234/jos.2020.123', headers: bearer(token) });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});
