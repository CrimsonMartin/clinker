// citationApi.ts - Client for citation metadata lookups.
//
//  - enrichFromDoi(doi): GET /v1/meta/doi/{doi} on the Clinker API (server fetches doi.org /
//    Crossref so the extension's host_permissions stay limited to our API). Requires sign-in.
//  - extractFromOpenTab(url): ask the content script in an open browser tab showing `url`
//    to extract metadata from the live page (for nodes saved before metadata existed).

namespace ClinkerCitationApi {
  type Item = CitationLinker.CitationMetadata;

  export class CitationApiError extends Error {
    constructor(public readonly code: string, message: string, public readonly status = 0) {
      super(message);
      this.name = 'CitationApiError';
    }
  }

  function auth(): any {
    const w: any = typeof window !== 'undefined' ? window : globalThis;
    return w.authManager;
  }

  /** Fetch CSL-JSON for a DOI. Throws CitationApiError (codes: invalid_doi, not_signed_in, doi_not_found, rate_limited, upstream_error, network_error). */
  export async function enrichFromDoi(doiInput: string): Promise<Item> {
    const svc = (globalThis as any).CitationLinker?.citationService;
    const doi = svc ? svc.normalizeDoi(doiInput) : (doiInput || '').trim();
    if (!doi) throw new CitationApiError('invalid_doi', 'That does not look like a DOI (expected 10.xxxx/…)');
    const am = auth();
    if (!am || typeof am.authorizedFetch !== 'function' || (typeof am.isLoggedIn === 'function' && !am.isLoggedIn())) {
      throw new CitationApiError('not_signed_in', 'Sign in to look up DOIs');
    }
    let res: Response;
    try {
      res = await am.authorizedFetch(`/v1/meta/doi/${encodeURIComponent(doi)}`, { method: 'GET' });
    } catch (e: any) {
      const msg = String((e && e.message) || e);
      if (/no user logged in/i.test(msg)) throw new CitationApiError('not_signed_in', 'Sign in to look up DOIs');
      throw new CitationApiError('network_error', 'Could not reach the Clinker server');
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const code = (body && body.error && body.error.code) || 'upstream_error';
      const messages: Record<string, string> = {
        doi_not_found: 'No record found for that DOI',
        rate_limited: 'Too many lookups — try again in a minute',
        invalid_doi: 'That does not look like a DOI',
        unauthorized: 'Sign in to look up DOIs'
      };
      throw new CitationApiError(code, messages[code] || (body && body.error && body.error.message) || `Lookup failed (${res.status})`, res.status);
    }
    if (!body || typeof body !== 'object' || !body.title) throw new CitationApiError('upstream_error', 'Unexpected response from server');
    return body as Item;
  }

  /** Extract metadata from an open tab showing `url` (null when no such tab / not reachable). */
  export async function extractFromOpenTab(url: string): Promise<Item | null> {
    const b: any = typeof browser !== 'undefined' ? browser : null;
    if (!b || !b.tabs || typeof b.tabs.query !== 'function') return null;
    try {
      const tabs: any[] = await b.tabs.query({});
      const strip = (u: string) => (u || '').replace(/#.*$/, '');
      const tab = tabs.find(t => t.url && strip(t.url) === strip(url));
      if (!tab || tab.id === undefined) return null;
      const res = await b.tabs.sendMessage(tab.id, { action: 'extractCitationMetadata' });
      return res && res.citation ? (res.citation as Item) : null;
    } catch {
      return null;
    }
  }
}

(function exposeCitationApi() {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : window;
  g.CitationLinker = g.CitationLinker || {};
  g.CitationLinker.citationApi = ClinkerCitationApi;
  if (typeof window !== 'undefined') {
    (window as any).CitationLinker = (window as any).CitationLinker || g.CitationLinker;
    (window as any).CitationLinker.citationApi = ClinkerCitationApi;
  }
})();
