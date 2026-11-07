// citationMetadata.ts - Extract bibliographic (CSL-JSON shaped) metadata from a web page.
//
// Loaded as a content script (before dist/content.js) so new nodes get a `citation`
// attached when they are saved, and in the sidebar so the citation services can reuse
// the parsing helpers (names, dates, DOIs).
//
// Sources, in priority order (first non-empty value wins per field):
//   1. Highwire Press `citation_*` tags (Google Scholar; used by most publishers, arXiv, PubMed, bepress)
//   2. JSON-LD (schema.org ScholarlyArticle / Article / Book / Chapter / WebPage ...)
//   3. PRISM `prism.*` tags
//   4. Dublin Core `DC.*` / `dcterms.*` tags
//   5. OpenGraph / Twitter / generic `<meta name="author|date">` / `<title>`
// plus DOI detection in the URL, meta tags and (when unambiguous) doi.org links.
//
// Everything lives in one namespace object to avoid clashing with other global scripts
// (the extension compiles with `module: none`, so all files share one global scope).

namespace ClinkerCitationExtraction {
  type CslName = CitationLinker.CslName;
  type CslDate = CitationLinker.CslDate;
  type CitationMetadata = CitationLinker.CitationMetadata;
  type CslType = CitationLinker.CslType;

  const MAX_FIELD = 2000;

  // ---------------------------------------------------------------------------
  // Generic helpers (also used by services/citationService.ts and the editor)
  // ---------------------------------------------------------------------------

  export function clean(value: unknown, max = MAX_FIELD): string {
    if (value === null || value === undefined) return '';
    let s = String(value);
    // Strip HTML tags occasionally present in meta content (e.g. <i> in titles)
    s = s.replace(/<[^>]*>/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > max) s = s.slice(0, max).trim();
    return s;
  }

  const CORPORATE_RE = new RegExp(
    '\\b(universit(y|ies|ät|é|à|eit)|institut(e|o)?|organi[sz]ation|association|society|department|ministry|agency|' +
      'council|committee|foundation|cent(er|re)|corporation|company|inc|ltd|llc|gmbh|group|team|staff|news|press|' +
      'office|bureau|board|commission|consortium|collaboration|network|project|services?|government|editors|editorial|' +
      'hospital|school|college|library|museum|authority|federation|alliance|union|trust|panel|wikipedia|contributors)\\b',
    'i'
  );

  const PARTICLES = new Set(['van', 'von', 'de', 'der', 'den', 'del', 'della', 'di', 'da', 'la', 'le', 'du', 'dos', 'das', 'ten', 'ter', 'bin', 'al', 'el', 'y']);
  const SUFFIXES = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

  /** Parse a free-text author string ("Smith, John A.", "John A. Smith", "Smith JA", "WHO"). */
  export function parseName(raw: unknown): CslName | null {
    let s = clean(raw, 300);
    if (!s) return null;
    s = s.replace(/^by\s+/i, '');
    s = s.replace(/\S+@\S+/g, ''); // e-mail addresses
    s = s.replace(/[*†‡§¶#]+/g, ''); // footnote markers
    s = s.replace(/(\s|^)\d+(,\d+)*(\s|$)/g, ' '); // affiliation numbers
    s = s.replace(/\s+/g, ' ').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return null;

    const tokensAll = s.split(' ');
    if (CORPORATE_RE.test(s) || tokensAll.length > 5) return { literal: s };

    if (s.includes(',')) {
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length === 1) return { family: parts[0] };
      const family = parts[0];
      const rest = parts.slice(1);
      let suffix: string | undefined;
      // "Smith, Jr., John" or "Smith, John, Jr."
      const sIdx = rest.findIndex(p => SUFFIXES.test(p));
      if (sIdx >= 0) suffix = rest.splice(sIdx, 1)[0];
      const given = rest.join(' ').trim();
      const name: CslName = { family };
      if (given) name.given = given;
      if (suffix) name.suffix = suffix;
      return name;
    }

    let tokens = tokensAll.slice();
    let suffix: string | undefined;
    if (tokens.length > 2 && SUFFIXES.test(tokens[tokens.length - 1])) {
      suffix = tokens.pop();
    }
    if (tokens.length === 1) return suffix ? { family: tokens[0], suffix } : { family: tokens[0] };

    // PubMed / Vancouver style "Smith JA"
    if (tokens.length === 2 && /^[A-Z]{1,3}$/.test(tokens[1]) && /[a-z]/.test(tokens[0])) {
      return { family: tokens[0], given: tokens[1].split('').map(c => c + '.').join(' ') };
    }

    let split = tokens.length - 1;
    for (let i = 1; i < tokens.length - 1; i++) {
      if (PARTICLES.has(tokens[i].toLowerCase())) {
        split = i;
        break;
      }
    }
    const name: CslName = { family: tokens.slice(split).join(' '), given: tokens.slice(0, split).join(' ') };
    if (suffix) name.suffix = suffix;
    return name;
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function validParts(y: number, m?: number, d?: number): number[] | null {
    if (!(y >= 1000 && y <= 2999)) return null;
    const parts = [y];
    if (m !== undefined && m >= 1 && m <= 12) {
      parts.push(m);
      if (d !== undefined && d >= 1 && d <= 31) parts.push(d);
    }
    return parts;
  }

  /** Parse "2020-05-01", "2020/05", "2020-05-01T10:00:00Z", "May 1, 2020", "1 May 2020", "2020". */
  export function parseDate(raw: unknown): CslDate | undefined {
    const s = clean(raw, 100);
    if (!s) return undefined;
    let m = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?(?:$|[T\s])/.exec(s);
    if (m) {
      const parts = validParts(+m[1], m[2] ? +m[2] : undefined, m[3] ? +m[3] : undefined);
      if (parts) return { 'date-parts': [parts] };
    }
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(s); // 20200501
    if (m) {
      const parts = validParts(+m[1], +m[2], +m[3]);
      if (parts) return { 'date-parts': [parts] };
    }
    const monthRe = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
    // "1 May 2020"
    m = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + monthRe + ',?\\s+(\\d{4})\\b', 'i').exec(s);
    if (m) {
      const parts = validParts(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
      if (parts) return { 'date-parts': [parts] };
    }
    // "May 1, 2020" / "May 2020"
    m = new RegExp('\\b' + monthRe + '\\s+(?:(\\d{1,2})(?:st|nd|rd|th)?,?\\s+)?(\\d{4})\\b', 'i').exec(s);
    if (m) {
      const parts = validParts(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, m[2] ? +m[2] : undefined);
      if (parts) return { 'date-parts': [parts] };
    }
    m = /\b(1[5-9]\d{2}|2[0-9]\d{2})\b/.exec(s);
    if (m) return { 'date-parts': [[+m[1]]] };
    return undefined;
  }

  /** Date parts for "today" (or a given Date / ISO string) — used for `accessed`. */
  export function dateToCsl(date: Date | string): CslDate | undefined {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) return undefined;
    return { 'date-parts': [[d.getFullYear(), d.getMonth() + 1, d.getDate()]] };
  }

  const DOI_RE = /10\.\d{4,9}\/[^\s"'<>]+/;

  /** Extract a bare DOI ("10.1234/abc") from "doi:...", "https://doi.org/...", a URL path, etc. */
  export function normalizeDoi(raw: unknown): string | undefined {
    let s = clean(raw, 500);
    if (!s) return undefined;
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep as-is */
    }
    s = s.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    const m = DOI_RE.exec(s);
    if (!m) return undefined;
    let doi = m[0];
    doi = doi.replace(/[?#].*$/, '');
    doi = doi.replace(/\/(full|abstract|pdf|epdf|pdfdirect|html|fulltext|references|figures|summary)$/i, '');
    doi = doi.replace(/\.pdf$/i, '');
    doi = doi.replace(/[.,;:]+$/, '');
    // Unbalanced trailing ")" or "]"
    while (/[)\]]$/.test(doi)) {
      const open = (doi.match(/[([]/g) || []).length;
      const close = (doi.match(/[)\]]/g) || []).length;
      if (close > open) doi = doi.slice(0, -1);
      else break;
    }
    return doi.length > 7 ? doi : undefined;
  }

  export function normalizeIsbn(raw: unknown): string | undefined {
    const s = clean(raw, 100).replace(/^isbn[:\s]*/i, '');
    const compact = s.replace(/[\s-]/g, '');
    return /^(\d{9}[\dXx]|\d{13})$/.test(compact) ? s : undefined;
  }

  // ---------------------------------------------------------------------------
  // Meta tag collection
  // ---------------------------------------------------------------------------

  type MetaMap = Map<string, string[]>;

  function collectMeta(doc: Document): MetaMap {
    const map: MetaMap = new Map();
    doc.querySelectorAll('meta').forEach(el => {
      const key = (el.getAttribute('name') || el.getAttribute('property') || el.getAttribute('itemprop') || '').trim().toLowerCase();
      const content = el.getAttribute('content');
      if (!key || content === null) return;
      const value = clean(content);
      if (!value) return;
      // bepress uses the Highwire vocabulary with a prefix
      const normKey = key.replace(/^bepress_citation_/, 'citation_').replace(/^dcterms\./, 'dc.').replace(/^dc:/, 'dc.');
      const list = map.get(normKey) || [];
      list.push(value);
      map.set(normKey, list);
    });
    return map;
  }

  const first = (meta: MetaMap, ...keys: string[]): string => {
    for (const k of keys) {
      const v = meta.get(k);
      if (v && v.length) return v[0];
    }
    return '';
  };
  const all = (meta: MetaMap, ...keys: string[]): string[] => {
    for (const k of keys) {
      const v = meta.get(k);
      if (v && v.length) return v;
    }
    return [];
  };

  function namesFrom(values: string[]): CslName[] {
    const out: CslName[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      // Some sites put all authors in one tag separated by ";" (citation_authors)
      const pieces = v.includes(';') ? v.split(';') : [v];
      for (const p of pieces) {
        const n = parseName(p);
        if (!n) continue;
        const key = JSON.stringify(n).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n);
      }
    }
    return out.slice(0, 500);
  }

  function pages(firstPage: string, lastPage: string, combined = ''): string {
    if (combined) return combined.replace(/\s*[-–—]+\s*/, '-');
    if (firstPage && lastPage && firstPage !== lastPage) return `${firstPage}-${lastPage}`;
    return firstPage || '';
  }

  type Partial_ = Partial<CitationMetadata> & { _typeHint?: CslType };

  function fromHighwire(meta: MetaMap): Partial_ {
    const out: Partial_ = {};
    out.title = first(meta, 'citation_title');
    out.author = namesFrom(all(meta, 'citation_author', 'citation_authors'));
    out.editor = namesFrom(all(meta, 'citation_editor'));
    out.issued = parseDate(first(meta, 'citation_publication_date', 'citation_date', 'citation_cover_date', 'citation_online_date', 'citation_year'));
    const journal = first(meta, 'citation_journal_title');
    const conference = first(meta, 'citation_conference_title', 'citation_conference');
    const book = first(meta, 'citation_inbook_title', 'citation_book_title');
    const thesisInst = first(meta, 'citation_dissertation_institution', 'citation_dissertation_name');
    const reportInst = first(meta, 'citation_technical_report_institution');
    out['container-title'] = journal || conference || book || '';
    out.volume = first(meta, 'citation_volume');
    out.issue = first(meta, 'citation_issue');
    out.page = pages(first(meta, 'citation_firstpage'), first(meta, 'citation_lastpage'));
    out.DOI = normalizeDoi(first(meta, 'citation_doi'));
    out.ISBN = normalizeIsbn(first(meta, 'citation_isbn'));
    out.ISSN = first(meta, 'citation_issn', 'citation_eissn');
    out.PMID = first(meta, 'citation_pmid');
    out.publisher = first(meta, 'citation_publisher') || thesisInst || reportInst;
    out.number = first(meta, 'citation_technical_report_number');
    out.language = first(meta, 'citation_language');
    out.abstract = first(meta, 'citation_abstract');
    out.keyword = all(meta, 'citation_keywords').join(', ');
    const arxiv = first(meta, 'citation_arxiv_id');
    if (arxiv) {
      out.number = `arXiv:${arxiv}`;
      if (!out['container-title']) out['container-title'] = 'arXiv';
    }
    if (journal) out._typeHint = 'article-journal';
    else if (conference) out._typeHint = 'paper-conference';
    else if (book) out._typeHint = 'chapter';
    else if (thesisInst) out._typeHint = 'thesis';
    else if (reportInst) out._typeHint = 'report';
    else if (arxiv) out._typeHint = 'article';
    else if (out.ISBN && out.title) out._typeHint = 'book';
    else if (out.title) out._typeHint = 'article-journal';
    return out;
  }

  function fromPrism(meta: MetaMap): Partial_ {
    return {
      'container-title': first(meta, 'prism.publicationname'),
      volume: first(meta, 'prism.volume'),
      issue: first(meta, 'prism.number', 'prism.issueidentifier'),
      page: pages(first(meta, 'prism.startingpage'), first(meta, 'prism.endingpage'), first(meta, 'prism.pagerange')),
      DOI: normalizeDoi(first(meta, 'prism.doi')),
      ISSN: first(meta, 'prism.issn', 'prism.eissn'),
      ISBN: normalizeIsbn(first(meta, 'prism.isbn')),
      issued: parseDate(first(meta, 'prism.publicationdate', 'prism.coverdate')),
      URL: first(meta, 'prism.url'),
      _typeHint: first(meta, 'prism.publicationname') ? 'article-journal' : undefined
    };
  }

  function fromDublinCore(meta: MetaMap): Partial_ {
    const identifiers = all(meta, 'dc.identifier');
    let doi: string | undefined;
    let isbn: string | undefined;
    for (const id of identifiers) {
      if (!doi && /(^doi:|doi\.org\/|^10\.\d{4,9}\/)/i.test(id)) doi = normalizeDoi(id);
      if (!isbn && /isbn/i.test(id)) isbn = normalizeIsbn(id);
    }
    const dcType = first(meta, 'dc.type').toLowerCase();
    let hint: CslType | undefined;
    if (/journal|article/.test(dcType)) hint = 'article-journal';
    else if (/book/.test(dcType)) hint = 'book';
    else if (/thesis|dissertation/.test(dcType)) hint = 'thesis';
    else if (/report/.test(dcType)) hint = 'report';
    return {
      title: first(meta, 'dc.title'),
      author: namesFrom(all(meta, 'dc.creator', 'dc.creator.personalname', 'dc.contributor.author')),
      issued: parseDate(first(meta, 'dc.date.issued', 'dc.issued', 'dc.date', 'dc.created', 'dc.date.created')),
      publisher: first(meta, 'dc.publisher'),
      'container-title': first(meta, 'dc.ispartof', 'dc.source', 'dc.relation.ispartof'),
      language: first(meta, 'dc.language'),
      abstract: first(meta, 'dc.description', 'dc.abstract'),
      DOI: doi,
      ISBN: isbn,
      _typeHint: hint
    };
  }

  // ---------------------------------------------------------------------------
  // JSON-LD
  // ---------------------------------------------------------------------------

  const SCHOLARLY_TYPES = ['scholarlyarticle', 'medicalscholarlyarticle'];
  const ARTICLE_TYPES = ['newsarticle', 'reportagenewsarticle', 'analysisnewsarticle', 'opinionnewsarticle', 'blogposting', 'article', 'techarticle', 'report', 'socialmediaposting'];
  const BOOK_TYPES = ['book'];
  const CHAPTER_TYPES = ['chapter'];
  const PAGE_TYPES = ['webpage', 'itempage', 'aboutpage', 'qapage', 'faqpage', 'collectionpage', 'profilepage'];

  function ldTypes(item: any): string[] {
    const t = item && item['@type'];
    return (Array.isArray(t) ? t : [t]).filter(x => typeof x === 'string').map((x: string) => x.toLowerCase().replace(/^schema:/, ''));
  }

  function flattenLd(data: any, out: any[], depth = 0): void {
    if (!data || depth > 4) return;
    if (Array.isArray(data)) {
      data.forEach(d => flattenLd(d, out, depth + 1));
      return;
    }
    if (typeof data !== 'object') return;
    if (data['@graph']) flattenLd(data['@graph'], out, depth + 1);
    if (data['@type']) out.push(data);
    // WebPage.mainEntity often holds the article
    if (data.mainEntity && typeof data.mainEntity === 'object') flattenLd(data.mainEntity, out, depth + 1);
  }

  function ldText(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return clean(v);
    if (Array.isArray(v)) return ldText(v[0]);
    if (typeof v === 'object') return clean(v.name || v['@value'] || v.headline || '');
    return '';
  }

  function ldNames(v: any): CslName[] {
    if (!v) return [];
    const list = Array.isArray(v) ? v : [v];
    const out: CslName[] = [];
    for (const a of list.slice(0, 500)) {
      if (typeof a === 'string') {
        const n = parseName(a);
        if (n) out.push(n);
      } else if (a && typeof a === 'object') {
        const types = ldTypes(a);
        if (types.includes('organization') || types.includes('newsmediaorganization')) {
          const name = clean(a.name);
          if (name) out.push({ literal: name });
        } else if (a.familyName || a.givenName) {
          const n: CslName = {};
          if (a.familyName) n.family = clean(a.familyName);
          if (a.givenName) n.given = clean(a.givenName);
          out.push(n);
        } else if (a.name) {
          const n = parseName(ldText(a.name));
          if (n) out.push(n);
        }
      }
    }
    return out;
  }

  function ldDoi(item: any): string | undefined {
    const candidates: any[] = [];
    for (const key of ['identifier', 'sameAs', '@id', 'url']) {
      const v = item[key];
      if (Array.isArray(v)) candidates.push(...v);
      else if (v) candidates.push(v);
    }
    for (const c of candidates) {
      if (c && typeof c === 'object') {
        const prop = String(c.propertyID || c.name || '').toLowerCase();
        const val = c.value || c['@value'] || c['@id'];
        if (prop === 'doi' || /doi\.org\//i.test(String(val || ''))) {
          const d = normalizeDoi(val);
          if (d) return d;
        }
      } else if (typeof c === 'string' && /(^doi:|doi\.org\/10\.)/i.test(c)) {
        const d = normalizeDoi(c);
        if (d) return d;
      }
    }
    return undefined;
  }

  function fromJsonLd(doc: Document): { scholarly: Partial_; other: Partial_ } {
    const items: any[] = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      const text = el.textContent || '';
      if (!text.trim() || text.length > 2_000_000) return;
      try {
        flattenLd(JSON.parse(text), items);
      } catch {
        /* ignore malformed JSON-LD */
      }
    });

    const rank = (item: any): number => {
      const t = ldTypes(item);
      if (t.some(x => SCHOLARLY_TYPES.includes(x))) return 5;
      if (t.some(x => CHAPTER_TYPES.includes(x))) return 4;
      if (t.some(x => BOOK_TYPES.includes(x))) return 4;
      if (t.some(x => ARTICLE_TYPES.includes(x))) return 3;
      if (t.some(x => PAGE_TYPES.includes(x))) return 1;
      return 0;
    };
    let best: any = null;
    let bestRank = 0;
    for (const item of items) {
      const r = rank(item);
      if (r > bestRank) {
        best = item;
        bestRank = r;
      }
    }
    if (!best) return { scholarly: {}, other: {} };

    const t = ldTypes(best);
    const out: Partial_ = {};
    out.title = ldText(best.headline) || ldText(best.name);
    out.author = ldNames(best.author || best.creator);
    out.editor = ldNames(best.editor);
    out.issued = parseDate(ldText(best.datePublished) || ldText(best.dateCreated) || ldText(best.copyrightYear));
    out.publisher = ldText(best.publisher);
    out.DOI = ldDoi(best);
    out.ISBN = normalizeIsbn(ldText(best.isbn));
    out.language = ldText(best.inLanguage);
    out.abstract = ldText(best.abstract) || '';
    out.URL = typeof best.url === 'string' ? best.url : '';
    const kw = best.keywords;
    out.keyword = Array.isArray(kw) ? kw.map(ldText).filter(Boolean).join(', ') : ldText(kw);

    // Walk isPartOf chain: PublicationIssue -> PublicationVolume -> Periodical / Book
    let part = best.isPartOf;
    for (let i = 0; i < 4 && part; i++) {
      if (Array.isArray(part)) part = part[0];
      if (!part || typeof part !== 'object') break;
      const pt = ldTypes(part);
      if (pt.includes('publicationissue') && part.issueNumber) out.issue = out.issue || ldText(part.issueNumber);
      if (pt.includes('publicationvolume') && part.volumeNumber) out.volume = out.volume || ldText(part.volumeNumber);
      if ((pt.includes('periodical') || pt.includes('book') || pt.includes('website') || pt.includes('newspaper')) && part.name) {
        out['container-title'] = out['container-title'] || ldText(part.name);
      }
      part = part.isPartOf;
    }
    if (best.volumeNumber) out.volume = out.volume || ldText(best.volumeNumber);
    if (best.issueNumber) out.issue = out.issue || ldText(best.issueNumber);
    out.page = pages(ldText(best.pageStart), ldText(best.pageEnd), ldText(best.pagination));

    if (t.some(x => SCHOLARLY_TYPES.includes(x))) out._typeHint = 'article-journal';
    else if (t.some(x => CHAPTER_TYPES.includes(x))) out._typeHint = 'chapter';
    else if (t.some(x => BOOK_TYPES.includes(x))) out._typeHint = 'book';
    else if (t.some(x => /newsarticle$/.test(x))) out._typeHint = 'article-newspaper';
    else if (t.includes('blogposting')) out._typeHint = 'post-weblog';
    else if (t.includes('report')) out._typeHint = 'report';
    else out._typeHint = 'webpage';

    // News sites: publisher name doubles as site name
    if (!out['container-title'] && out._typeHint !== 'book' && out.publisher) out['container-title'] = out.publisher;

    return bestRank >= 4 || t.some(x => SCHOLARLY_TYPES.includes(x)) ? { scholarly: out, other: {} } : { scholarly: {}, other: out };
  }

  // ---------------------------------------------------------------------------
  // Generic page metadata
  // ---------------------------------------------------------------------------

  function hostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function fromGeneric(doc: Document, meta: MetaMap, url: string): Partial_ {
    const siteName = first(meta, 'og:site_name', 'application-name', 'twitter:site').replace(/^@/, '');
    let title = first(meta, 'og:title', 'twitter:title') || clean(doc.title);
    if (!first(meta, 'og:title', 'twitter:title') && siteName && title) {
      // "Article title | Site Name" -> "Article title"
      const esc = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      title = title.replace(new RegExp(`\\s*[|\\-–—:·•]\\s*${esc}\\s*$`, 'i'), '').trim() || title;
    }
    const authorValues = all(meta, 'author', 'article:author', 'parsely-author', 'sailthru.author', 'byl').filter(v => !/^https?:\/\//i.test(v));
    const ogType = first(meta, 'og:type').toLowerCase();
    return {
      title,
      author: namesFrom(authorValues),
      issued: parseDate(
        first(meta, 'article:published_time', 'datepublished', 'date', 'pubdate', 'publish-date', 'publication_date', 'parsely-pub-date', 'sailthru.date', 'og:pubdate')
      ),
      'container-title': siteName || hostname(url),
      language: (doc.documentElement && doc.documentElement.getAttribute('lang')) || '',
      _typeHint: ogType === 'book' ? 'book' : 'webpage'
    };
  }

  function doiFromLinks(doc: Document): string | undefined {
    const found = new Set<string>();
    doc.querySelectorAll('a[href*="doi.org/10."]').forEach(a => {
      const d = normalizeDoi(a.getAttribute('href'));
      if (d) found.add(d.toLowerCase());
    });
    // Only trust links when exactly one DOI appears (reference lists contain many).
    if (found.size === 1) return Array.from(found)[0];
    return undefined;
  }

  function doiFromUrl(url: string): string | undefined {
    try {
      const u = new URL(url);
      if (/(^|\.)doi\.org$/i.test(u.hostname)) return normalizeDoi(u.pathname.slice(1));
      if (/\/10\.\d{4,9}\//.test(decodeURIComponent(u.pathname))) return normalizeDoi(decodeURIComponent(u.pathname));
    } catch {
      /* ignore */
    }
    return undefined;
  }

  function arxivFromUrl(url: string): string | undefined {
    const m = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/[0-9]{7})(?:v\d+)?/i.exec(url);
    return m ? m[1] : undefined;
  }

  function isEmpty(v: unknown): boolean {
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  }

  const FIELDS: Array<keyof CitationMetadata> = [
    'title', 'author', 'editor', 'issued', 'container-title', 'volume', 'issue', 'page', 'DOI', 'ISBN', 'ISSN', 'PMID',
    'publisher', 'number', 'language', 'abstract', 'keyword', 'URL'
  ];

  /**
   * Extract CSL-JSON shaped citation metadata from a document.
   * Pure: only reads `doc`; `url` is the page URL; `now` sets the accessed date.
   */
  export function extractCitationMetadata(doc: Document, url: string, now: Date = new Date()): CitationMetadata {
    const meta = collectMeta(doc);
    const highwire = fromHighwire(meta);
    const ld = fromJsonLd(doc);
    const prism = fromPrism(meta);
    const dc = fromDublinCore(meta);
    const generic = fromGeneric(doc, meta, url);

    const sources: Array<[string, Partial_]> = [
      ['highwire', highwire],
      ['json-ld', ld.scholarly],
      ['prism', prism],
      ['dublin-core', dc],
      ['json-ld', ld.other],
      ['page', generic]
    ];

    const out: any = {};
    const used = new Set<string>();
    for (const field of FIELDS) {
      for (const [name, src] of sources) {
        const v = (src as any)[field];
        if (!isEmpty(v)) {
          out[field] = v;
          if (field !== 'container-title' && field !== 'language') used.add(name);
          break;
        }
      }
    }

    // Type: strongest hint wins
    let type: CslType = 'webpage';
    for (const [, src] of sources) {
      if (src._typeHint) {
        type = src._typeHint;
        break;
      }
    }

    // A generic site name is not a journal: if the type came from page-level data only,
    // keep container-title as the website name.
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
    let pageUrl = url;
    if (canonical && /^https?:\/\//i.test(canonical)) pageUrl = canonical;
    out.URL = pageUrl || out.URL;

    if (!out.DOI) out.DOI = doiFromUrl(url) || doiFromLinks(doc);
    const arxiv = arxivFromUrl(url);
    if (arxiv) {
      if (type === 'webpage') type = 'article';
      if (!out.number) out.number = `arXiv:${arxiv}`;
      if (!out['container-title'] || out['container-title'] === 'arxiv.org') out['container-title'] = 'arXiv';
      if (!out.DOI && /^\d{4}\./.test(arxiv)) out.DOI = `10.48550/arXiv.${arxiv}`;
    }

    if (out.abstract) out.abstract = clean(out.abstract, MAX_FIELD);
    if (out.language) out.language = clean(out.language, 20);
    if (!out.title) out.title = hostname(url) || url;

    const result: CitationMetadata = { type, ...out };
    const accessed = dateToCsl(now);
    if (accessed) result.accessed = accessed;
    result.source = used.size ? Array.from(used).join('+') : 'page';

    // Drop empty strings / arrays
    for (const k of Object.keys(result) as Array<keyof CitationMetadata>) {
      if (isEmpty(result[k])) delete result[k];
    }
    return result;
  }
}

// Expose on the global object (content script world, sidebar window, Jest global).
(function exposeCitationExtraction() {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
  g.ClinkerCitationExtraction = ClinkerCitationExtraction;
  g.CitationLinker = g.CitationLinker || {};
  g.CitationLinker.citationExtraction = ClinkerCitationExtraction;
  g.extractCitationMetadata = ClinkerCitationExtraction.extractCitationMetadata;

  // In a web page (content script), answer on-demand extraction requests from the sidebar,
  // e.g. to fill in metadata for nodes saved before this feature existed.
  try {
    const isWebPage = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
    const rt: any =
      typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage
        ? chrome.runtime
        : typeof browser !== 'undefined' && (browser as any).runtime
          ? (browser as any).runtime
          : null;
    if (isWebPage && rt && rt.onMessage && typeof rt.onMessage.addListener === 'function' && typeof document !== 'undefined') {
      rt.onMessage.addListener((message: any, _sender: any, sendResponse: (r: any) => void) => {
        if (message && message.action === 'extractCitationMetadata') {
          try {
            sendResponse({ citation: ClinkerCitationExtraction.extractCitationMetadata(document, location.href) });
          } catch (e: any) {
            sendResponse({ error: String((e && e.message) || e) });
          }
          return false;
        }
        return undefined;
      });
    }
  } catch {
    /* not in an extension context */
  }
})();
