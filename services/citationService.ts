// citationService.ts - Dependency-free citation formatting and reference export.
//
// Styles (bibliography entries): APA 7, MLA 9, Chicago 17 author-date, Chicago 17
// notes-bibliography, Harvard (Cite Them Right), IEEE.
// Exports: BibTeX, RIS, CSL-JSON, plain-text and HTML bibliographies.
//
// Requires citationMetadata.ts (for parseName/parseDate/normalizeDoi helpers) to be loaded first.
//
// Formatting works on "marked" strings: italics are wrapped in \u0001 ... \u0002 so a single
// formatter produces both plain text (markers stripped) and HTML (<i>, escaped, linkified).

namespace ClinkerCitations {
  type Item = CitationLinker.CitationMetadata;
  type Name = CitationLinker.CslName;
  type TreeNode = CitationLinker.TreeNode;

  export type StyleId = 'apa' | 'mla' | 'chicago-ad' | 'chicago-nb' | 'harvard' | 'ieee';
  export type ExportFormatId = StyleId | 'bibtex' | 'ris' | 'csl-json';
  export type Scope = 'node' | 'subtree' | 'tab' | 'all';

  export const STYLES: Array<{ id: StyleId; label: string }> = [
    { id: 'apa', label: 'APA 7th' },
    { id: 'mla', label: 'MLA 9th' },
    { id: 'chicago-ad', label: 'Chicago (author-date)' },
    { id: 'chicago-nb', label: 'Chicago (notes-bibliography)' },
    { id: 'harvard', label: 'Harvard' },
    { id: 'ieee', label: 'IEEE' }
  ];

  export const FORMATS: Array<{ id: 'text' | 'html' | 'bibtex' | 'ris' | 'csl-json'; label: string; extension: string; mime: string }> = [
    { id: 'text', label: 'Plain text', extension: 'txt', mime: 'text/plain' },
    { id: 'html', label: 'HTML', extension: 'html', mime: 'text/html' },
    { id: 'bibtex', label: 'BibTeX (.bib)', extension: 'bib', mime: 'application/x-bibtex' },
    { id: 'ris', label: 'RIS (.ris)', extension: 'ris', mime: 'application/x-research-info-systems' },
    { id: 'csl-json', label: 'CSL-JSON (.json)', extension: 'json', mime: 'application/vnd.citationstyles.csl+json' }
  ];

  const I0 = '\u0001';
  const I1 = '\u0002';
  const it = (s: string | undefined): string => (s ? I0 + s + I1 : '');

  function ext(): any {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : window;
    const e = g.ClinkerCitationExtraction || (g.CitationLinker && g.CitationLinker.citationExtraction);
    if (!e) throw new Error('citationMetadata.js must be loaded before citationService.js');
    return e;
  }

  // ---------------------------------------------------------------------------
  // Small text helpers
  // ---------------------------------------------------------------------------

  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_MLA = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  const MONTHS_IEEE = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

  export function stripMarkers(s: string): string {
    return s.replace(/[\u0001\u0002]/g, '');
  }

  function plainEnd(s: string): string {
    return stripMarkers(s).trim();
  }

  /** Append `p` unless the (marker-stripped) text already ends in terminal punctuation. */
  function end(s: string, p = '.'): string {
    if (!s) return s;
    const t = plainEnd(s);
    if (/[.?!]$/.test(t) && (p === '.' || p === ',')) {
      // "J. A." + "." -> "J. A."; "Why?" + "," -> "Why?"
      return s;
    }
    // Put the punctuation after a closing italic marker
    return s + p;
  }

  function enDash(p: string): string {
    return p.replace(/\s*(?:-+|–|—)\s*/g, '–');
  }

  function isRange(p: string): boolean {
    return /[-–—,]/.test(p);
  }

  const MINOR_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to',
    'up', 'via', 'vs', 'vs.', 'from', 'into', 'with', 'over', 'onto', 'upon', 'than', 'like', 'near', 'about', 'among', 'versus'
  ]);

  /** Headline-style capitalization (MLA, Chicago). Only raises lowercase words; never lowers. */
  export function titleCase(title: string): string {
    const words = title.split(' ');
    const lastIdx = words.length - 1;
    return words
      .map((w, i) => {
        const prev = i > 0 ? words[i - 1] : '';
        const forceCap = i === 0 || i === lastIdx || /[:?!—–]$/.test(prev);
        const capPart = (part: string, force: boolean): string => {
          const m = /^([^A-Za-zÀ-ɏ]*)([a-zß-ÿ][\s\S]*)$/.exec(part);
          if (!m) return part;
          const core = m[2];
          if (/[A-Z]/.test(core.slice(1)) || /\d/.test(core) || /^(https?:|www\.)/.test(core)) return part; // iPhone, mRNA, URLs
          if (!force && MINOR_WORDS.has(core.toLowerCase().replace(/[^a-z.]/g, ''))) return part;
          return m[1] + core.charAt(0).toUpperCase() + core.slice(1);
        };
        if (w.includes('-') && !/^-|-$/.test(w)) {
          return w
            .split('-')
            .map((p, j) => capPart(p, forceCap && j === 0))
            .join('-');
        }
        return capPart(w, forceCap);
      })
      .join(' ');
  }

  function quote(title: string, punct = ''): string {
    // Terminal punctuation goes inside the quotes (US style); don't double up "?" or "!".
    if (punct && /[.?!]$/.test(title)) return `“${title}”`;
    return `“${title}${punct}”`;
  }

  function hostname(url?: string): string {
    if (!url) return '';
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  export function doiUrl(doi: string): string {
    return `https://doi.org/${doi}`;
  }

  // ---------------------------------------------------------------------------
  // Dates
  // ---------------------------------------------------------------------------

  type Parts = { y?: number; m?: number; d?: number; literal?: string };

  function parts(date?: CitationLinker.CslDate): Parts {
    if (!date) return {};
    const dp = date['date-parts'] && date['date-parts'][0];
    if (dp && dp.length && Number(dp[0])) {
      return { y: Number(dp[0]), m: dp[1] ? Number(dp[1]) : undefined, d: dp[2] ? Number(dp[2]) : undefined };
    }
    if (date.literal) {
      const parsed = ext().parseDate(date.literal);
      if (parsed) return parts(parsed);
      return { literal: date.literal };
    }
    return {};
  }

  function yearOf(item: Item): string {
    const p = parts(item.issued);
    return p.y ? String(p.y) : p.literal || '';
  }

  /** "May 1, 2020" / "May 2020" / "2020" */
  function mdy(p: Parts, months = MONTHS_FULL): string {
    if (!p.y) return p.literal || '';
    if (p.m && p.d) return `${months[p.m - 1]} ${p.d}, ${p.y}`;
    if (p.m) return `${months[p.m - 1]} ${p.y}`;
    return String(p.y);
  }

  /** "1 May 2020" / "May 2020" / "2020" */
  function dmy(p: Parts, months = MONTHS_FULL): string {
    if (!p.y) return p.literal || '';
    if (p.m && p.d) return `${p.d} ${months[p.m - 1]} ${p.y}`;
    if (p.m) return `${months[p.m - 1]} ${p.y}`;
    return String(p.y);
  }

  // ---------------------------------------------------------------------------
  // Names
  // ---------------------------------------------------------------------------

  function isLiteral(n: Name): boolean {
    return !!n.literal || (!n.family && !n.given);
  }

  function literalOf(n: Name): string {
    return n.literal || n.family || n.given || '';
  }

  /** "John Adam" -> "J. A." (spaced) or "J.A."; "Jean-Paul" -> "J.-P."; keeps existing initials. */
  export function initials(given: string | undefined, spaced = true): string {
    if (!given) return '';
    const tokens = given
      .replace(/\./g, '. ')
      .split(/\s+/)
      .filter(Boolean);
    const out = tokens.map(tok => {
      if (/^[A-Z]{2,3}$/.test(tok) && tokens.length === 1) {
        // "JA" (Vancouver-style initials)
        return tok
          .split('')
          .map(c => c + '.')
          .join(spaced ? ' ' : '');
      }
      return tok
        .split('-')
        .filter(Boolean)
        .map(p => p.charAt(0).toUpperCase() + '.')
        .join('-');
    });
    return out.join(spaced ? ' ' : '');
  }

  function familyWithSuffix(n: Name): string {
    return n.family || '';
  }

  /** "Smith, J. A." (APA) / "Smith, J.A." (Harvard) */
  function invertedInitials(n: Name, spaced: boolean): string {
    if (isLiteral(n)) return literalOf(n);
    const ini = initials(n.given, spaced);
    let s = familyWithSuffix(n);
    if (ini) s += `, ${ini}`;
    if (n.suffix) s += `, ${n.suffix}`;
    return s;
  }

  /** "J. A. Smith" (IEEE, APA editors) */
  function initialsFirst(n: Name, spaced = true): string {
    if (isLiteral(n)) return literalOf(n);
    const ini = initials(n.given, spaced);
    let s = ini ? `${ini} ${n.family}` : n.family || '';
    if (n.suffix) s += `, ${n.suffix}`;
    return s;
  }

  /** "Smith, John A." */
  function invertedFull(n: Name): string {
    if (isLiteral(n)) return literalOf(n);
    let s = n.family || '';
    if (n.given) s += `, ${n.given}`;
    if (n.suffix) s += `, ${n.suffix}`;
    return s;
  }

  /** "John A. Smith" */
  function fullName(n: Name): string {
    if (isLiteral(n)) return literalOf(n);
    let s = [n.given, n.family].filter(Boolean).join(' ');
    if (n.suffix) s += `, ${n.suffix}`;
    return s;
  }

  function familyOrLiteral(n: Name): string {
    return isLiteral(n) ? literalOf(n) : n.family || '';
  }

  function validNames(list?: Name[]): Name[] {
    return (list || []).filter(n => n && (n.family || n.given || n.literal));
  }

  /** Join with commas and a final conjunction: "A, B, & C" / "A and B" */
  function joinList(list: string[], conj: string, serialComma: boolean): string {
    if (list.length <= 1) return list.join('');
    if (list.length === 2) return `${list[0]}${serialComma && conj === '&' ? ',' : ''} ${conj} ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}${serialComma ? ',' : ''} ${conj} ${list[list.length - 1]}`;
  }

  // ---------------------------------------------------------------------------
  // Item classification
  // ---------------------------------------------------------------------------

  type Kind = 'periodical' | 'book' | 'chapter' | 'webpage';

  function kindOf(item: Item): Kind {
    switch (item.type) {
      case 'article-journal':
      case 'article-magazine':
      case 'article-newspaper':
      case 'review':
        return 'periodical';
      case 'article':
        return item['container-title'] ? 'periodical' : 'webpage';
      case 'book':
      case 'report':
      case 'thesis':
      case 'manuscript':
      case 'dataset':
      case 'software':
      case 'patent':
        return 'book';
      case 'chapter':
      case 'paper-conference':
      case 'entry-encyclopedia':
        return 'chapter';
      default:
        return 'webpage';
    }
  }

  const isNewsLike = (item: Item) => ['article-magazine', 'article-newspaper', 'post-weblog', 'webpage'].includes(item.type);

  function link(item: Item): string {
    if (item.DOI) return doiUrl(item.DOI);
    return item.URL || '';
  }

  function ordinalEdition(edition?: string): string {
    if (!edition) return '';
    const n = parseInt(edition, 10);
    if (!n || String(n) !== edition.trim()) return edition.replace(/\s*ed(ition)?\.?$/i, '');
    const sfx = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as any)[n % 10] || 'th';
    return `${n}${sfx}`;
  }

  // ---------------------------------------------------------------------------
  // APA 7
  // ---------------------------------------------------------------------------

  function apaAuthors(names: Name[]): string {
    const f = names.map(n => invertedInitials(n, true));
    if (f.length === 0) return '';
    if (f.length === 1) return f[0];
    if (f.length === 2) return `${f[0]}, & ${f[1]}`;
    if (f.length <= 20) return `${f.slice(0, -1).join(', ')}, & ${f[f.length - 1]}`;
    return `${f.slice(0, 19).join(', ')}, . . . ${f[f.length - 1]}`;
  }

  function apaEditors(names: Name[]): string {
    const f = names.map(n => initialsFirst(n, true));
    const list = f.length <= 2 ? f.join(' & ') : `${f.slice(0, -1).join(', ')}, & ${f[f.length - 1]}`;
    return `${list} (${f.length > 1 ? 'Eds.' : 'Ed.'})`;
  }

  function apaDate(item: Item): string {
    const p = parts(item.issued);
    if (!p.y) return p.literal ? `(${p.literal})` : '(n.d.)';
    if (isNewsLike(item) && p.m) {
      return p.d ? `(${p.y}, ${MONTHS_FULL[p.m - 1]} ${p.d})` : `(${p.y}, ${MONTHS_FULL[p.m - 1]})`;
    }
    return `(${p.y})`;
  }

  function formatApa(item: Item): string {
    const kind = kindOf(item);
    const authors = validNames(item.author);
    const editorsOnly = authors.length === 0 && validNames(item.editor).length > 0 && kind === 'book';
    const title = item.title || '';
    let titlePart: string;
    if (kind === 'book' || kind === 'webpage') {
      let t = it(title);
      const extras: string[] = [];
      if (item.edition) extras.push(`${ordinalEdition(item.edition)} ed.`);
      if (item.type === 'report' && item.number) extras.push(`Report No. ${item.number}`);
      if (extras.length) t += ` (${extras.join(', ')})`;
      if (item.type === 'thesis') t += ` [${item.genre || 'Doctoral dissertation'}${item.publisher ? `, ${item.publisher}` : ''}]`;
      titlePart = end(t);
    } else {
      titlePart = end(title);
    }

    const pieces: string[] = [];
    if (authors.length || editorsOnly) {
      pieces.push(end(editorsOnly ? apaEditors(validNames(item.editor)) : apaAuthors(authors)));
      pieces.push(end(apaDate(item)));
      pieces.push(titlePart);
    } else {
      pieces.push(titlePart);
      pieces.push(end(apaDate(item)));
    }

    const firstAuthor = authors[0] && isLiteral(authors[0]) ? literalOf(authors[0]) : '';
    const container = item['container-title'] || '';

    if (kind === 'periodical') {
      if (item.type === 'article' && !item.volume) {
        // Preprint: "arXiv." (archive name, not italicized)
        if (container) pieces.push(end(container));
      } else if (container) {
        let src = it(container);
        if (item.volume) src += `, ${it(item.volume)}`;
        if (item.issue) src += item.volume ? `(${item.issue})` : `, (${item.issue})`;
        if (item.page) src += `, ${enDash(item.page)}`;
        pieces.push(end(src));
      }
    } else if (kind === 'chapter') {
      const eds = validNames(item.editor);
      let src = 'In ';
      if (eds.length) src += `${apaEditors(eds)}, `;
      src += it(container || '');
      if (item.page) src += ` (${isRange(item.page) ? 'pp.' : 'p.'} ${enDash(item.page)})`;
      pieces.push(end(src));
      if (item.publisher && item.publisher !== firstAuthor) pieces.push(end(item.publisher));
    } else if (kind === 'book') {
      if (item.publisher && item.publisher !== firstAuthor && item.type !== 'thesis') pieces.push(end(item.publisher));
      if (item.type === 'thesis' && item.publisher && !item.URL && !item.DOI) {
        /* institution already in the bracket */
      }
    } else {
      if (container && container !== firstAuthor && container !== title) pieces.push(end(container));
    }

    const url = link(item);
    if (url) {
      if (kind === 'webpage' && !parts(item.issued).y && item.accessed && !item.DOI) {
        pieces.push(`Retrieved ${mdy(parts(item.accessed))}, from ${url}`);
      } else {
        pieces.push(url);
      }
    }
    return pieces.filter(Boolean).join(' ');
  }

  // ---------------------------------------------------------------------------
  // MLA 9
  // ---------------------------------------------------------------------------

  function mlaAuthors(names: Name[]): string {
    if (names.length === 0) return '';
    if (names.length === 1) return invertedFull(names[0]);
    if (names.length === 2) return `${invertedFull(names[0])}, and ${fullName(names[1])}`;
    return `${invertedFull(names[0])}, et al`;
  }

  function mlaDate(d?: CitationLinker.CslDate): string {
    return dmy(parts(d), MONTHS_MLA);
  }

  function formatMla(item: Item): string {
    const kind = kindOf(item);
    const authors = validNames(item.author);
    const title = titleCase(item.title || '');
    const pieces: string[] = [];
    if (authors.length) pieces.push(end(mlaAuthors(authors)));
    pieces.push(kind === 'book' ? end(it(title)) : quote(title, '.'));

    const container = item['container-title'] || '';
    const elems: string[] = [];
    const date = mlaDate(item.issued);
    const firstAuthor = authors[0] && isLiteral(authors[0]) ? literalOf(authors[0]) : '';

    if (kind === 'periodical') {
      if (container) elems.push(it(titleCase(container)));
      if (item.volume) elems.push(`vol. ${item.volume}`);
      if (item.issue) elems.push(`no. ${item.issue}`);
      if (date) elems.push(date);
      if (item.page) elems.push(`${isRange(item.page) ? 'pp.' : 'p.'} ${enDash(item.page)}`);
    } else if (kind === 'chapter') {
      if (container) elems.push(it(titleCase(container)));
      const eds = validNames(item.editor);
      if (eds.length) elems.push(`edited by ${eds.length > 2 ? `${fullName(eds[0])} et al.` : joinList(eds.map(fullName), 'and', false)}`);
      if (item.publisher) elems.push(item.publisher);
      if (date) elems.push(date);
      if (item.page) elems.push(`${isRange(item.page) ? 'pp.' : 'p.'} ${enDash(item.page)}`);
    } else if (kind === 'book') {
      if (item.edition) elems.push(`${ordinalEdition(item.edition)} ed.`);
      if (item.publisher && item.publisher !== firstAuthor) elems.push(item.publisher);
      if (date) elems.push(date);
    } else {
      if (container && container !== item.title && container !== firstAuthor) elems.push(it(container));
      if (item.publisher && item.publisher !== container && item.publisher !== firstAuthor) elems.push(item.publisher);
      if (date) elems.push(date);
    }
    const url = kind === 'book' && !item.DOI ? '' : link(item);
    if (url) elems.push(url);
    if (elems.length) {
      // Bare "ed." ending already supplies the period
      pieces.push(end(elems.join(', ')));
    }
    if (!parts(item.issued).y && item.accessed && (kind === 'webpage' || (!item.DOI && item.URL))) {
      pieces.push(`Accessed ${mlaDate(item.accessed)}.`);
    }
    return pieces.join(' ');
  }

  // ---------------------------------------------------------------------------
  // Chicago 17 (author-date and notes-bibliography)
  // ---------------------------------------------------------------------------

  function chicagoAuthors(names: Name[]): string {
    if (names.length === 0) return '';
    const shown = names.length > 10 ? names.slice(0, 7) : names;
    const f = shown.map((n, i) => (i === 0 ? invertedFull(n) : fullName(n)));
    if (names.length > 10) return `${f.join(', ')}, et al`;
    if (f.length === 1) return f[0];
    if (f.length === 2) return `${f[0]}, and ${f[1]}`;
    return `${f.slice(0, -1).join(', ')}, and ${f[f.length - 1]}`;
  }

  function chicagoEditors(names: Name[]): string {
    return joinList(names.map(fullName), 'and', true);
  }

  function chicagoPlace(item: Item): string {
    if (item['publisher-place'] && item.publisher) return `${item['publisher-place']}: ${item.publisher}`;
    return item.publisher || item['publisher-place'] || '';
  }

  function formatChicago(item: Item, authorDate: boolean): string {
    const kind = kindOf(item);
    const authors = validNames(item.author);
    const p = parts(item.issued);
    const year = p.y ? String(p.y) : p.literal || 'n.d.';
    const title = titleCase(item.title || '');
    const titlePart = kind === 'book' ? end(it(title)) : quote(title, '.');
    const pieces: string[] = [];

    if (authors.length) {
      pieces.push(end(chicagoAuthors(authors)));
      if (authorDate) pieces.push(end(year));
      pieces.push(titlePart);
    } else {
      pieces.push(titlePart);
      if (authorDate) pieces.push(end(year));
    }

    const container = item['container-title'] || '';
    const pages = item.page ? enDash(item.page) : '';
    const yearOrNd = p.y ? String(p.y) : '';

    if (kind === 'periodical') {
      if (isNewsLike(item) || (item.type === 'article' && !item.volume)) {
        const bits = [it(titleCase(container))];
        if (item.type !== 'article' && p.m) bits.push(mdy(p));
        else if (!authorDate && yearOrNd) bits.push(yearOrNd);
        pieces.push(end(bits.filter(Boolean).join(', ')));
      } else {
        let src = it(titleCase(container));
        if (item.volume) src += ` ${item.volume}`;
        if (authorDate) {
          if (item.issue) src += ` (${item.issue})`;
          if (pages) src += `: ${pages}`;
        } else {
          if (item.issue) src += `, no. ${item.issue}`;
          if (yearOrNd) src += ` (${p.m ? `${MONTHS_FULL[p.m - 1]} ${p.y}` : p.y})`;
          if (pages) src += `: ${pages}`;
        }
        pieces.push(end(src));
      }
    } else if (kind === 'chapter') {
      let src = `In ${it(titleCase(container))}`;
      const eds = validNames(item.editor);
      if (eds.length) src += `, edited by ${chicagoEditors(eds)}`;
      if (pages) src += `, ${pages}`;
      pieces.push(end(src));
      const pub = chicagoPlace(item);
      if (authorDate) {
        if (pub) pieces.push(end(pub));
      } else {
        const tail = [pub, yearOrNd].filter(Boolean).join(', ');
        if (tail) pieces.push(end(tail));
      }
    } else if (kind === 'book') {
      if (item.edition) pieces.push(`${ordinalEdition(item.edition)} ed.`);
      if (item.type === 'thesis') pieces.push(end([item.genre || 'PhD diss.', item.publisher].filter(Boolean).join(', ')));
      const pub = item.type === 'thesis' ? '' : chicagoPlace(item);
      if (authorDate) {
        if (pub) pieces.push(end(pub));
      } else {
        const tail = [pub, yearOrNd].filter(Boolean).join(', ');
        if (tail) pieces.push(end(tail));
      }
    } else {
      const firstAuthor = authors[0] && isLiteral(authors[0]) ? literalOf(authors[0]) : '';
      if (container && container !== item.title && container !== firstAuthor) pieces.push(end(container));
      if (p.y && (p.m || !authorDate)) pieces.push(end(mdy(p)));
      else if (!p.y && item.accessed) pieces.push(end(`Accessed ${mdy(parts(item.accessed))}`));
    }

    const url = link(item);
    if (url) pieces.push(end(url));
    return pieces.filter(Boolean).join(' ');
  }

  // ---------------------------------------------------------------------------
  // Harvard (Cite Them Right)
  // ---------------------------------------------------------------------------

  function harvardAuthors(names: Name[]): string {
    const f = names.map(n => invertedInitials(n, false));
    if (f.length === 0) return '';
    if (f.length >= 4) return `${f[0]} et al.`;
    return joinList(f, 'and', false);
  }

  function formatHarvard(item: Item): string {
    const kind = kindOf(item);
    const authors = validNames(item.author);
    const p = parts(item.issued);
    const year = `(${p.y ? p.y : p.literal || 'no date'})`;
    const title = item.title || '';
    const italicTitle = kind === 'book' || kind === 'webpage';
    const t = italicTitle ? it(title) : `‘${title}’`;
    let head: string;
    if (authors.length) head = `${harvardAuthors(authors)} ${year} ${t}`;
    else head = `${t} ${year}`;

    const pieces: string[] = [];
    const container = item['container-title'] || '';
    const pages = item.page ? `${isRange(item.page) ? 'pp.' : 'p.'} ${enDash(item.page)}` : '';
    const place = chicagoPlace(item);

    if (kind === 'periodical') {
      let vi = '';
      if (item.volume) vi = item.volume + (item.issue ? `(${item.issue})` : '');
      else if (item.issue) vi = `(${item.issue})`;
      const bits = [head, it(container), vi, isNewsLike(item) && p.m ? dmy(p) : '', pages].filter(Boolean);
      pieces.push(end(bits.join(', ')));
    } else if (kind === 'chapter') {
      const eds = validNames(item.editor);
      let src = `${head}, in `;
      if (eds.length) src += `${harvardAuthors(eds)} (${eds.length > 1 ? 'eds' : 'ed.'}) `;
      src += it(container);
      pieces.push(end(src));
      const tail = [place, pages].filter(Boolean).join(', ');
      if (tail) pieces.push(end(tail));
    } else if (kind === 'book') {
      pieces.push(end(head));
      if (item.edition) pieces.push(`${ordinalEdition(item.edition)} edn.`);
      if (item.type === 'thesis') pieces.push(end([item.genre || 'PhD thesis', item.publisher].filter(Boolean).join('. ')));
      else if (place) pieces.push(end(place));
    } else {
      pieces.push(end(head));
    }

    const url = link(item);
    if (url) {
      const accessed = !item.DOI && item.accessed ? ` (Accessed: ${dmy(parts(item.accessed))})` : '';
      pieces.push(`Available at: ${url}${accessed}.`);
    }
    return pieces.join(' ');
  }

  // ---------------------------------------------------------------------------
  // IEEE
  // ---------------------------------------------------------------------------

  function ieeeAuthors(names: Name[]): string {
    const f = names.map(n => initialsFirst(n, true));
    if (f.length === 0) return '';
    if (f.length >= 7) return `${f[0]} et al.`;
    return joinList(f, 'and', true);
  }

  function ieeeDate(p: Parts): string {
    if (!p.y) return p.literal || '';
    if (p.m) return `${MONTHS_IEEE[p.m - 1]} ${p.y}`;
    return String(p.y);
  }

  function formatIeee(item: Item): string {
    const kind = kindOf(item);
    const authors = validNames(item.author);
    const p = parts(item.issued);
    const title = item.title || '';
    const container = item['container-title'] || '';
    const pages = item.page ? `${isRange(item.page) ? 'pp.' : 'p.'} ${enDash(item.page)}` : '';
    const doiTail = item.DOI ? `doi: ${item.DOI}` : '';
    const online = !item.DOI && item.URL ? `[Online]. Available: ${item.URL}` : '';
    const lead = authors.length ? `${ieeeAuthors(authors)}, ` : '';

    if (kind === 'book') {
      let s = `${lead}${it(title)}`;
      if (item.edition) s += `, ${ordinalEdition(item.edition)} ed`;
      s += '. ';
      const pub = chicagoPlace(item);
      const tail = [pub, p.y ? String(p.y) : ''].filter(Boolean).join(', ');
      s = tail ? `${s}${tail}` : s.trimEnd();
      if (doiTail) s = `${end(s, ',')} ${doiTail}`;
      s = end(s);
      return online ? `${s} ${online}` : s;
    }

    if (kind === 'webpage') {
      let s = `${lead}${quote(title, ',')}`;
      const site = container && container !== title ? container : '';
      const dateStr = p.y ? mdy(p, MONTHS_IEEE) : '';
      const bits = [site, dateStr].filter(Boolean).join(', ');
      if (bits) s += ` ${end(bits)}`;
      else s = s.replace(/,”$/, '.”');
      if (item.accessed) s += ` Accessed: ${mdy(parts(item.accessed), MONTHS_IEEE)}.`;
      const url = link(item);
      if (url) s += ` [Online]. Available: ${url}`;
      return s;
    }

    // periodical / chapter / conference
    const bits: string[] = [];
    if (kind === 'chapter') {
      let src = `in ${it(container)}`;
      const eds = validNames(item.editor);
      if (eds.length && item.type !== 'paper-conference') {
        src += `, ${joinList(eds.map(n => initialsFirst(n)), 'and', true)}, ${eds.length > 1 ? 'Eds' : 'Ed'}.`;
        const pub = chicagoPlace(item);
        bits.push(src + (pub ? ` ${pub}` : ''));
      } else {
        bits.push(src);
        if (item.type !== 'paper-conference' && chicagoPlace(item)) bits.push(chicagoPlace(item));
      }
      if (p.y) bits.push(String(p.y));
      if (pages) bits.push(pages);
    } else {
      if (container) bits.push(it(container));
      if (item.volume) bits.push(`vol. ${item.volume}`);
      if (item.issue) bits.push(`no. ${item.issue}`);
      if (item.type === 'article' && item.number && !item.volume) bits.push(item.number);
      if (pages) bits.push(pages);
      const d = ieeeDate(p);
      if (d) bits.push(d);
    }
    if (doiTail) bits.push(doiTail);
    let s = `${lead}${quote(title, ',')} ${bits.join(', ')}`;
    s = end(s);
    return online ? `${s} ${online}` : s;
  }

  // ---------------------------------------------------------------------------
  // Public formatting API
  // ---------------------------------------------------------------------------

  /** Format one bibliography entry as a marked string (italics as \u0001..\u0002). */
  export function formatEntryMarked(item: Item, style: StyleId): string {
    const s = (() => {
      switch (style) {
        case 'apa':
          return formatApa(item);
        case 'mla':
          return formatMla(item);
        case 'chicago-ad':
          return formatChicago(item, true);
        case 'chicago-nb':
          return formatChicago(item, false);
        case 'harvard':
          return formatHarvard(item);
        case 'ieee':
          return formatIeee(item);
        default:
          return formatApa(item);
      }
    })();
    return s.replace(/\s+/g, ' ').replace(/\u0001\u0002/g, '').trim();
  }

  export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Marked string -> HTML with <i> and clickable links. */
  export function markedToHtml(s: string): string {
    let html = escapeHtml(s);
    html = html.replace(/https?:\/\/[^\s<\u0001\u0002]*[^\s<.,;)\u0001\u0002]/g, url => `<a href="${url}">${url}</a>`);
    return html.replace(/\u0001/g, '<i>').replace(/\u0002/g, '</i>');
  }

  export function formatEntry(item: Item, style: StyleId, format: 'text' | 'html' = 'text'): string {
    const marked = formatEntryMarked(item, style);
    return format === 'html' ? markedToHtml(marked) : stripMarkers(marked);
  }

  /** Parenthetical in-text citation, e.g. "(Smith & Doe, 2020)"; IEEE uses the reference number. */
  export function formatInText(item: Item, style: StyleId, number = 1): string {
    if (style === 'ieee') return `[${number}]`;
    const names = validNames(item.author).map(familyOrLiteral);
    const y = parts(item.issued).y;
    const year = y ? String(y) : style === 'harvard' ? 'no date' : 'n.d.';
    let who: string;
    if (names.length === 0) {
      const words = (item.title || '').split(' ');
      const short = words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '');
      who = kindOf(item) === 'book' || kindOf(item) === 'webpage' ? short : `“${short}”`;
    } else if (style === 'apa') {
      who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
    } else if (style === 'mla') {
      who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} et al.`;
    } else if (style === 'harvard') {
      who = names.length >= 4 ? `${names[0]} et al.` : joinList(names, 'and', false);
    } else {
      who = names.length >= 4 ? `${names[0]} et al.` : joinList(names, 'and', true);
    }
    switch (style) {
      case 'apa':
      case 'harvard':
        return `(${who}, ${year})`;
      case 'mla':
        return `(${who})`;
      case 'chicago-nb':
        return `${who}, ${kindOf(item) === 'book' ? titleCase(item.title || '') : `“${titleCase(item.title || '')}”`}`;
      default:
        return `(${who} ${year})`;
    }
  }

  // ---------------------------------------------------------------------------
  // Nodes -> items, dedup, sort
  // ---------------------------------------------------------------------------

  /** Citation for a node; falls back to a minimal webpage citation from url/title/timestamp. */
  export function citationFromNode(node: Partial<TreeNode> & { title?: string }): Item {
    const host = hostname(node.url);
    const base: Item = node.citation
      ? JSON.parse(JSON.stringify(node.citation))
      : { type: 'webpage', 'container-title': host || undefined, source: 'fallback' };
    if (!base.type) base.type = 'webpage';
    if (!base.URL && node.url) base.URL = node.url;
    if (!base.title) base.title = (node.title && node.title.trim()) || host || node.url || 'Untitled';
    if (!base.accessed && node.timestamp) {
      const d = ext().dateToCsl(node.timestamp);
      if (d) base.accessed = d;
    }
    if (!base.id) base.id = node.id !== undefined ? `node-${node.id}` : undefined;
    for (const k of Object.keys(base) as Array<keyof Item>) {
      if (base[k] === undefined || base[k] === '') delete base[k];
    }
    return base;
  }

  function normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      u.hash = '';
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(p => u.searchParams.delete(p));
      return (u.host.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  export function dedupeKey(item: Item): string {
    if (item.DOI) return `doi:${item.DOI.toLowerCase()}`;
    if (item.URL) return `url:${normalizeUrl(item.URL)}`;
    return `title:${(item.title || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
  }

  function richness(item: Item): number {
    let n = Object.keys(item).length;
    if (item.source === 'fallback') n -= 10;
    return n + validNames(item.author).length;
  }

  export interface Entry {
    item: Item;
    /** Highlighted passages and annotations from the nodes that cite this source. */
    quotes: string[];
    nodeIds: number[];
  }

  /** Merge items that point to the same source (DOI, then URL); keeps the richest metadata. */
  export function dedupe(items: Item[]): Item[] {
    return dedupeEntries(items.map(item => ({ item, quotes: [], nodeIds: [] }))).map(e => e.item);
  }

  export function dedupeEntries(entries: Entry[]): Entry[] {
    const byKey = new Map<string, Entry>();
    const urlToKey = new Map<string, string>();
    const out: Entry[] = [];
    for (const e of entries) {
      let key = dedupeKey(e.item);
      // An item with a DOI and one without can still share a URL.
      const urlKey = e.item.URL ? `url:${normalizeUrl(e.item.URL)}` : '';
      if (!byKey.has(key) && urlKey && urlToKey.has(urlKey)) key = urlToKey.get(urlKey)!;
      const existing = byKey.get(key);
      if (existing) {
        if (richness(e.item) > richness(existing.item)) existing.item = e.item;
        existing.quotes.push(...e.quotes);
        existing.nodeIds.push(...e.nodeIds);
      } else {
        const copy: Entry = { item: e.item, quotes: e.quotes.slice(), nodeIds: e.nodeIds.slice() };
        byKey.set(key, copy);
        out.push(copy);
      }
      if (urlKey && !urlToKey.has(urlKey)) urlToKey.set(urlKey, key);
    }
    return out;
  }

  function sortKey(entryText: string): string {
    return stripMarkers(entryText)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^[“‘"'\s]+/, '')
      .replace(/^(the|a|an)\s+/i, '')
      .toLowerCase();
  }

  /** Alphabetical for author-based styles; IEEE keeps input (citation) order. */
  export function sortEntries<T extends { item: Item }>(entries: T[], style: StyleId): T[] {
    if (style === 'ieee') return entries.slice();
    const keyed = entries.map(e => ({ e, k: sortKey(formatEntryMarked(e.item, style)) }));
    keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    return keyed.map(x => x.e);
  }

  // ---------------------------------------------------------------------------
  // Bibliographies
  // ---------------------------------------------------------------------------

  export interface BibliographyOptions {
    includeQuotes?: boolean;
  }

  export function formatBibliography(input: Array<Item | Entry>, style: StyleId, format: 'text' | 'html' = 'text', options: BibliographyOptions = {}): string {
    const entries = sortEntries(dedupeEntries(input.map(toEntry)), style);
    if (format === 'html') {
      const rows = entries.map((e, i) => {
        const num = style === 'ieee' ? `<span class="csl-left-margin">[${i + 1}]</span> ` : '';
        let row = `  <div class="csl-entry">${num}${markedToHtml(formatEntryMarked(e.item, style))}</div>`;
        if (options.includeQuotes && e.quotes.length) {
          row += '\n' + e.quotes.map(q => `  <blockquote class="csl-quote">${escapeHtml(q)}</blockquote>`).join('\n');
        }
        return row;
      });
      return `<div class="csl-bib-body">\n${rows.join('\n')}\n</div>`;
    }
    return entries
      .map((e, i) => {
        let row = (style === 'ieee' ? `[${i + 1}] ` : '') + stripMarkers(formatEntryMarked(e.item, style));
        if (options.includeQuotes && e.quotes.length) row += '\n' + e.quotes.map(q => `    > ${q.replace(/\s+/g, ' ')}`).join('\n');
        return row;
      })
      .join('\n\n');
  }

  /** Full standalone HTML document (for .html downloads). */
  export function htmlDocument(bodyHtml: string, title = 'Bibliography'): string {
    return (
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
      `<title>${escapeHtml(title)}</title>\n` +
      '<style>body{font-family:Georgia,serif;max-width:46em;margin:2em auto;line-height:1.6;padding:0 1em}' +
      '.csl-entry{padding-left:2em;text-indent:-2em;margin-bottom:.8em}' +
      '.csl-quote{margin:.2em 0 .8em 2em;color:#555;font-style:italic}</style>\n</head>\n<body>\n' +
      `<h1>${escapeHtml(title)}</h1>\n${bodyHtml}\n</body>\n</html>\n`
    );
  }

  function toEntry(x: Item | Entry): Entry {
    return (x as Entry).item && Array.isArray((x as Entry).quotes) ? (x as Entry) : { item: x as Item, quotes: [], nodeIds: [] };
  }

  // ---------------------------------------------------------------------------
  // BibTeX
  // ---------------------------------------------------------------------------

  export function bibtexEscape(s: string): string {
    return s.replace(/[\\{}&%$#_~^]/g, ch => {
      switch (ch) {
        case '\\':
          return '\\textbackslash{}';
        case '~':
          return '\\textasciitilde{}';
        case '^':
          return '\\textasciicircum{}';
        default:
          return '\\' + ch;
      }
    });
  }

  /** Escape, and protect words with internal capitals / acronyms from BibTeX case changes. */
  function bibtexTitle(s: string): string {
    return s
      .split(' ')
      .map(w => {
        const m = /^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/.exec(w)!;
        const core = m[2];
        if (!/[A-Z]/.test(core.slice(1).replace(/[^A-Za-z]/g, ''))) return bibtexEscape(w);
        return `${bibtexEscape(m[1])}{${bibtexEscape(core)}}${bibtexEscape(m[3])}`;
      })
      .join(' ');
  }

  function bibtexName(n: Name): string {
    if (isLiteral(n)) return `{${bibtexEscape(literalOf(n))}}`;
    const fam = bibtexEscape(n.family || '');
    const giv = n.given ? bibtexEscape(n.given) : '';
    if (n.suffix) return `${fam}, ${bibtexEscape(n.suffix)}, ${giv}`;
    return giv ? `${fam}, ${giv}` : fam;
  }

  const KEY_STOPWORDS = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'from', 'at', 'by']);

  function asciiFold(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[æÆ]/g, 'ae')
      .replace(/[øØ]/g, 'o')
      .replace(/[^A-Za-z0-9]/g, '')
      .toLowerCase();
  }

  export function bibtexKey(item: Item, used?: Set<string>): string {
    const a = validNames(item.author)[0];
    let who = a ? asciiFold(isLiteral(a) ? literalOf(a).split(' ')[0] : a.family || '') : '';
    const word =
      (item.title || '')
        .split(/\s+/)
        .map(asciiFold)
        .find(w => w && !KEY_STOPWORDS.has(w)) || '';
    if (!who) who = word || 'ref';
    const y = parts(item.issued).y;
    let key = `${who}${y || 'nd'}${who === word ? '' : word}`.slice(0, 40) || 'ref';
    if (used) {
      const base = key;
      let i = 0;
      while (used.has(key)) {
        key = base + String.fromCharCode(97 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
        i++;
      }
      used.add(key);
    }
    return key;
  }

  const BIBTEX_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function bibtexType(item: Item): string {
    switch (item.type) {
      case 'article-journal':
      case 'article-magazine':
      case 'article-newspaper':
      case 'review':
        return 'article';
      case 'article':
        return item['container-title'] && item.volume ? 'article' : 'misc';
      case 'book':
        return 'book';
      case 'chapter':
      case 'entry-encyclopedia':
        return 'incollection';
      case 'paper-conference':
        return 'inproceedings';
      case 'report':
        return 'techreport';
      case 'thesis':
        return /master/i.test(item.genre || '') ? 'mastersthesis' : 'phdthesis';
      default:
        return 'misc';
    }
  }

  function isoDate(d?: CitationLinker.CslDate): string {
    const p = parts(d);
    if (!p.y) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return [String(p.y), p.m ? pad(p.m) : '', p.d ? pad(p.d) : ''].filter(Boolean).join('-');
  }

  export function toBibTeX(input: Array<Item | Entry>, options: BibliographyOptions = {}): string {
    const used = new Set<string>();
    return dedupeEntries(input.map(toEntry))
      .map(({ item, quotes }) => {
        const type = bibtexType(item);
        const key = bibtexKey(item, used);
        const f: Array<[string, string]> = [];
        const add = (k: string, v: string | undefined, raw = false) => {
          if (v) f.push([k, raw ? v : bibtexEscape(v)]);
        };
        const authors = validNames(item.author);
        if (authors.length) f.push(['author', authors.map(bibtexName).join(' and ')]);
        const editors = validNames(item.editor);
        if (editors.length) f.push(['editor', editors.map(bibtexName).join(' and ')]);
        if (item.title) f.push(['title', bibtexTitle(item.title)]);
        const container = item['container-title'];
        if (type === 'article') add('journal', container);
        else if (type === 'incollection' || type === 'inproceedings') add('booktitle', container);
        else if (type === 'misc' && container) add('howpublished', container);
        const p = parts(item.issued);
        if (p.y) f.push(['year', String(p.y)]);
        if (p.m) f.push(['month', `@@${BIBTEX_MONTHS[p.m - 1]}`]);
        add('volume', item.volume);
        add('number', item.issue || (type === 'techreport' || type === 'misc' ? item.number : undefined));
        if (item.page) f.push(['pages', bibtexEscape(item.page.replace(/\s*(?:-+|–|—)\s*/g, '--'))]);
        if (type === 'phdthesis' || type === 'mastersthesis') add('school', item.publisher);
        else if (type === 'techreport') add('institution', item.publisher);
        else add('publisher', item.publisher);
        add('address', item['publisher-place']);
        add('edition', item.edition);
        add('doi', item.DOI, true);
        add('isbn', item.ISBN);
        add('issn', item.ISSN);
        add('url', item.URL, true);
        const acc = isoDate(item.accessed);
        if (acc && item.URL) f.push(['urldate', acc]);
        add('keywords', item.keyword);
        add('language', item.language);
        if (options.includeQuotes && quotes.length) add('annote', quotes.join('\n\n'));
        const body = f
          .map(([k, v]) => (v.startsWith('@@') ? `  ${k} = ${v.slice(2)}` : `  ${k} = {${v.replace(/[{}]/g, m => m) /* already escaped */}}`))
          .join(',\n');
        return `@${type}{${key},\n${body}\n}`;
      })
      .join('\n\n')
      .concat('\n');
  }

  // ---------------------------------------------------------------------------
  // RIS
  // ---------------------------------------------------------------------------

  function risType(item: Item): string {
    const map: Record<string, string> = {
      'article-journal': 'JOUR',
      article: 'JOUR',
      review: 'JOUR',
      'article-magazine': 'MGZN',
      'article-newspaper': 'NEWS',
      book: 'BOOK',
      chapter: 'CHAP',
      'entry-encyclopedia': 'ENCYC',
      'paper-conference': 'CPAPER',
      report: 'RPRT',
      thesis: 'THES',
      webpage: 'ELEC',
      'post-weblog': 'BLOG',
      dataset: 'DATA',
      software: 'COMP',
      patent: 'PAT',
      manuscript: 'MANSCPT'
    };
    return map[item.type] || 'GEN';
  }

  export function toRIS(input: Array<Item | Entry>, options: BibliographyOptions = {}): string {
    const out: string[] = [];
    for (const { item, quotes } of dedupeEntries(input.map(toEntry))) {
      const lines: string[] = [];
      const tag = (t: string, v: string | undefined) => {
        if (v) lines.push(`${t}  - ${v.replace(/[\r\n]+/g, ' ')}`);
      };
      tag('TY', risType(item));
      for (const a of validNames(item.author)) tag('AU', invertedFull(a));
      for (const e of validNames(item.editor)) tag('A2', invertedFull(e));
      tag('TI', item.title);
      tag('T2', item['container-title']);
      const p = parts(item.issued);
      if (p.y) {
        tag('PY', String(p.y));
        const pad = (n?: number) => (n ? String(n).padStart(2, '0') : '');
        tag('DA', `${p.y}/${pad(p.m)}/${pad(p.d)}/`);
      }
      tag('VL', item.volume);
      tag('IS', item.issue);
      if (item.page) {
        const [sp, ep] = item.page.split(/\s*(?:-+|–|—)\s*/);
        tag('SP', sp);
        tag('EP', ep);
      }
      tag('ET', item.edition);
      tag('PB', item.publisher);
      tag('CY', item['publisher-place']);
      tag('SN', item.ISBN || item.ISSN);
      tag('DO', item.DOI);
      tag('UR', item.URL);
      const acc = isoDate(item.accessed);
      if (acc && item.URL) tag('Y2', acc);
      tag('LA', item.language);
      tag('AB', item.abstract);
      if (item.keyword) item.keyword.split(/\s*[,;]\s*/).filter(Boolean).forEach(k => tag('KW', k));
      if (options.includeQuotes) quotes.forEach(q => tag('N1', q));
      lines.push('ER  - ');
      out.push(lines.join('\r\n'));
    }
    return out.join('\r\n\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------------------
  // CSL-JSON
  // ---------------------------------------------------------------------------

  export function toCslJson(input: Array<Item | Entry>, options: BibliographyOptions = {}): string {
    const used = new Set<string>();
    const items = dedupeEntries(input.map(toEntry)).map(({ item, quotes }) => {
      const copy: any = JSON.parse(JSON.stringify(item));
      copy.id = bibtexKey(item, used);
      if (copy.source === 'fallback') delete copy.source;
      if (options.includeQuotes && quotes.length) copy.note = [copy.note, ...quotes].filter(Boolean).join('\n\n');
      return copy;
    });
    return JSON.stringify(items, null, 2) + '\n';
  }

  // ---------------------------------------------------------------------------
  // Export entry point + node collection
  // ---------------------------------------------------------------------------

  export interface ExportResult {
    /** Main text (what gets downloaded / copied as text/plain). */
    text: string;
    /** HTML fragment for rich copy / preview, when the format has one. */
    html?: string;
    extension: string;
    mime: string;
  }

  export function exportEntries(
    entries: Array<Item | Entry>,
    format: 'text' | 'html' | 'bibtex' | 'ris' | 'csl-json',
    style: StyleId = 'apa',
    options: BibliographyOptions = {}
  ): ExportResult {
    const meta = FORMATS.find(f => f.id === format) || FORMATS[0];
    switch (format) {
      case 'bibtex':
        return { text: toBibTeX(entries, options), extension: meta.extension, mime: meta.mime };
      case 'ris':
        return { text: toRIS(entries, options), extension: meta.extension, mime: meta.mime };
      case 'csl-json':
        return { text: toCslJson(entries, options), extension: meta.extension, mime: meta.mime };
      case 'html':
      case 'text':
      default: {
        const html = formatBibliography(entries, style, 'html', options);
        const text = formatBibliography(entries, style, 'text', options);
        return format === 'html'
          ? { text: htmlDocument(html), html, extension: 'html', mime: 'text/html' }
          : { text, html, extension: 'txt', mime: 'text/plain' };
      }
    }
  }

  /** Build export entries (citation + highlighted quotes/annotations) from nodes. */
  export function entriesFromNodes(nodes: TreeNode[]): Entry[] {
    return nodes
      .filter(n => n && !n.deleted)
      .map(n => {
        const quotes: string[] = [];
        if (n.text && n.text.trim()) quotes.push(n.text.trim());
        (n.annotations || []).forEach(a => a && a.text && a.text.trim() && quotes.push(`Note: ${a.text.trim()}`));
        return { item: citationFromNode(n), quotes, nodeIds: [n.id] };
      });
  }

  /** Depth-first order (parents before children, siblings in `children` order). */
  function treeOrder(nodes: TreeNode[], rootIds: number[]): TreeNode[] {
    const byId = new Map(nodes.map(n => [n.id, n] as [number, TreeNode]));
    const out: TreeNode[] = [];
    const seen = new Set<number>();
    const visit = (id: number) => {
      const n = byId.get(id);
      if (!n || seen.has(id)) return;
      seen.add(id);
      if (!n.deleted) out.push(n);
      (n.children || []).forEach(visit);
    };
    rootIds.forEach(visit);
    // Orphans (broken parent links) at the end
    nodes.forEach(n => !seen.has(n.id) && !n.deleted && rootIds.length > 1 && out.push(n));
    return out;
  }

  /**
   * Select nodes for an export scope.
   * tabs: CitationLinker.TabState-like ({tabs:[{id, treeData:{nodes}}], activeTabId}).
   */
  export function collectNodes(
    tabsData: { tabs: Array<{ id: string; treeData: { nodes: TreeNode[]; currentNodeId?: number | null } }>; activeTabId?: string | null },
    scope: Scope,
    opts: { nodeId?: number | null; tabId?: string | null } = {}
  ): TreeNode[] {
    const tabs = (tabsData && tabsData.tabs) || [];
    const roots = (nodes: TreeNode[]) => {
      const ids = new Set(nodes.map(n => n.id));
      return nodes.filter(n => n.parentId === null || n.parentId === undefined || !ids.has(n.parentId)).map(n => n.id);
    };
    if (scope === 'all') return tabs.flatMap(t => treeOrder(t.treeData?.nodes || [], roots(t.treeData?.nodes || [])));
    if (scope === 'tab') {
      const tab = tabs.find(t => t.id === (opts.tabId || tabsData.activeTabId)) || tabs[0];
      const nodes = tab?.treeData?.nodes || [];
      return treeOrder(nodes, roots(nodes));
    }
    const tab = tabs.find(t => (t.treeData?.nodes || []).some(n => n.id === opts.nodeId));
    if (!tab || opts.nodeId === undefined || opts.nodeId === null) return [];
    const nodes = tab.treeData.nodes;
    if (scope === 'node') return nodes.filter(n => n.id === opts.nodeId && !n.deleted);
    return treeOrder(nodes, [opts.nodeId]);
  }

  /** Overlay enriched (e.g. DOI-registry) metadata on top of page-extracted metadata. */
  export function mergeCitation(base: Item | undefined, enriched: Partial<Item>): Item {
    const out: any = { ...(base || { type: 'webpage' }) };
    for (const [k, v] of Object.entries(enriched)) {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = v;
    }
    // Keep the page URL the user actually visited if the registry only gave a doi.org URL
    if (base && base.URL && typeof out.URL === 'string' && /doi\.org\//.test(out.URL)) out.URL = base.URL;
    if (base && base.accessed) out.accessed = base.accessed;
    return out as Item;
  }

  /** Short label for a node card: "Smith et al. 2024 · Nature". Empty when there is no metadata. */
  export function shortLabel(item: Item | undefined): string {
    if (!item || item.source === 'fallback') return '';
    const names = validNames(item.author).map(familyOrLiteral);
    let who = '';
    if (names.length === 1) who = names[0];
    else if (names.length === 2) who = `${names[0]} & ${names[1]}`;
    else if (names.length > 2) who = `${names[0]} et al.`;
    const y = yearOf(item);
    const left = [who, y].filter(Boolean).join(' ');
    const container = item['container-title'] && item['container-title'] !== hostname(item.URL) ? item['container-title'] : '';
    return [left, container].filter(Boolean).join(' · ');
  }

  /** Parse "Smith, John; Doe, Jane" or one-per-line author text (citation editor). */
  export function parseAuthorList(text: string): Name[] {
    const pieces = text.includes('\n') || text.includes(';') ? text.split(/[\n;]+/) : [text];
    return pieces.map(p => p.trim()).filter(Boolean).map(p => {
      // {Literal Corp} forces a corporate author
      const m = /^\{(.+)\}$/.exec(p);
      if (m) return { literal: m[1].trim() };
      return ext().parseName(p) || { literal: p };
    });
  }

  /** Inverse of parseAuthorList. */
  export function formatAuthorList(names?: Name[]): string {
    return validNames(names)
      .map(n => (isLiteral(n) ? `{${literalOf(n)}}` : invertedFull(n)))
      .join('\n');
  }

  export function formatDateInput(d?: CitationLinker.CslDate): string {
    const p = parts(d);
    if (!p.y) return p.literal || '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return [String(p.y), p.m ? pad(p.m) : '', p.d ? pad(p.d) : ''].filter(Boolean).join('-');
  }

  export function parseDateInput(text: string): CitationLinker.CslDate | undefined {
    const t = text.trim();
    if (!t) return undefined;
    return ext().parseDate(t) || { literal: t };
  }

  export function normalizeDoi(text: string): string | undefined {
    return ext().normalizeDoi(text);
  }
}

// Attach to global namespace (same pattern as the other services)
(function exposeCitationService() {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : window;
  g.CitationLinker = g.CitationLinker || {};
  g.CitationLinker.citationService = ClinkerCitations;
  g.ClinkerCitations = ClinkerCitations;
  if (typeof window !== 'undefined') {
    (window as any).CitationLinker = (window as any).CitationLinker || g.CitationLinker;
    (window as any).CitationLinker.citationService = ClinkerCitations;
    (window as any).citationService = ClinkerCitations;
  }
})();
