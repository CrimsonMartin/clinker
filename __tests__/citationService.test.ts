/**
 * @jest-environment jsdom
 */
import type { CitationMetadata, TreeNode } from '../types/treeTypes';

require('../citationMetadata');
require('../services/citationService');

const S = (global as any).CitationLinker.citationService;
const STYLES = ['apa', 'mla', 'chicago-ad', 'chicago-nb', 'harvard', 'ieee'];
const md = (item: CitationMetadata, style: string) =>
  S.formatEntryMarked(item, style).replace(/\u0001/g, '*').replace(/\u0002/g, '*');

const journal: CitationMetadata = {
  type: 'article-journal',
  title: 'A study of things',
  author: [{ family: 'Smith', given: 'John A.' }, { family: 'Doe', given: 'Jane' }],
  'container-title': 'Journal of Studies',
  volume: '12',
  issue: '3',
  page: '45-67',
  issued: { 'date-parts': [[2020]] },
  DOI: '10.1234/jos.2020.123'
};
const journal3: CitationMetadata = {
  type: 'article-journal',
  title: 'Three authors walk into a bar',
  author: [{ family: 'Smith', given: 'John' }, { family: 'Doe', given: 'Jane' }, { family: 'Lee', given: 'Kim' }],
  'container-title': 'Nature',
  volume: '580',
  page: '100',
  issued: { 'date-parts': [[2021, 3, 4]] },
  URL: 'https://nature.com/x'
};
const webpage: CitationMetadata = {
  type: 'webpage',
  title: 'How to cite a website',
  author: [{ literal: 'World Health Organization' }],
  'container-title': 'WHO',
  issued: { 'date-parts': [[2023, 6, 15]] },
  URL: 'https://www.who.int/cite',
  accessed: { 'date-parts': [[2026, 11, 7]] }
};
const noAuthor: CitationMetadata = {
  type: 'webpage',
  title: 'Untitled page: notes on things',
  'container-title': 'example.com',
  URL: 'https://example.com/p',
  accessed: { 'date-parts': [[2026, 11, 7]] }
};
const book: CitationMetadata = {
  type: 'book',
  title: 'The art of research',
  author: [{ family: 'Booth', given: 'Wayne C.' }],
  publisher: 'University of Chicago Press',
  'publisher-place': 'Chicago',
  edition: '4',
  issued: { 'date-parts': [[2016]] }
};
const chapter: CitationMetadata = {
  type: 'chapter',
  title: 'Methods matter',
  author: [{ family: 'Lee', given: 'Ann' }],
  editor: [{ family: 'Ray', given: 'Bob' }, { family: 'Cho', given: 'Mia' }],
  'container-title': 'The big book of methods',
  page: '1-10',
  publisher: 'Book House',
  'publisher-place': 'London',
  issued: { 'date-parts': [[2019]] },
  DOI: '10.5555/ch'
};
const many: CitationMetadata = {
  type: 'article-journal',
  title: 'Big collab',
  author: Array.from({ length: 22 }, (_, i) => ({ family: 'Auth' + String.fromCharCode(65 + i), given: 'Xavier' })),
  'container-title': 'Science',
  volume: '1',
  issue: '2',
  page: '3-4',
  issued: { 'date-parts': [[2022]] }
};

const EXPECTED: Record<string, Record<string, string>> = {
  journal: {
    apa: 'Smith, J. A., & Doe, J. (2020). A study of things. *Journal of Studies*, *12*(3), 45–67. https://doi.org/10.1234/jos.2020.123',
    mla: 'Smith, John A., and Jane Doe. “A Study of Things.” *Journal of Studies*, vol. 12, no. 3, 2020, pp. 45–67, https://doi.org/10.1234/jos.2020.123.',
    'chicago-ad': 'Smith, John A., and Jane Doe. 2020. “A Study of Things.” *Journal of Studies* 12 (3): 45–67. https://doi.org/10.1234/jos.2020.123.',
    'chicago-nb': 'Smith, John A., and Jane Doe. “A Study of Things.” *Journal of Studies* 12, no. 3 (2020): 45–67. https://doi.org/10.1234/jos.2020.123.',
    harvard: 'Smith, J.A. and Doe, J. (2020) ‘A study of things’, *Journal of Studies*, 12(3), pp. 45–67. Available at: https://doi.org/10.1234/jos.2020.123.',
    ieee: 'J. A. Smith and J. Doe, “A study of things,” *Journal of Studies*, vol. 12, no. 3, pp. 45–67, 2020, doi: 10.1234/jos.2020.123.'
  },
  journal3: {
    apa: 'Smith, J., Doe, J., & Lee, K. (2021). Three authors walk into a bar. *Nature*, *580*, 100. https://nature.com/x',
    mla: 'Smith, John, et al. “Three Authors Walk into a Bar.” *Nature*, vol. 580, 4 Mar. 2021, p. 100, https://nature.com/x.',
    'chicago-ad': 'Smith, John, Jane Doe, and Kim Lee. 2021. “Three Authors Walk into a Bar.” *Nature* 580: 100. https://nature.com/x.',
    'chicago-nb': 'Smith, John, Jane Doe, and Kim Lee. “Three Authors Walk into a Bar.” *Nature* 580 (March 2021): 100. https://nature.com/x.',
    harvard: 'Smith, J., Doe, J. and Lee, K. (2021) ‘Three authors walk into a bar’, *Nature*, 580, p. 100. Available at: https://nature.com/x.',
    ieee: 'J. Smith, J. Doe, and K. Lee, “Three authors walk into a bar,” *Nature*, vol. 580, p. 100, Mar. 2021. [Online]. Available: https://nature.com/x'
  },
  webpage: {
    apa: 'World Health Organization. (2023, June 15). *How to cite a website*. WHO. https://www.who.int/cite',
    mla: 'World Health Organization. “How to Cite a Website.” *WHO*, 15 June 2023, https://www.who.int/cite.',
    'chicago-ad': 'World Health Organization. 2023. “How to Cite a Website.” WHO. June 15, 2023. https://www.who.int/cite.',
    'chicago-nb': 'World Health Organization. “How to Cite a Website.” WHO. June 15, 2023. https://www.who.int/cite.',
    harvard: 'World Health Organization (2023) *How to cite a website*. Available at: https://www.who.int/cite (Accessed: 7 November 2026).',
    ieee: 'World Health Organization, “How to cite a website,” WHO, Jun. 15, 2023. Accessed: Nov. 7, 2026. [Online]. Available: https://www.who.int/cite'
  },
  noAuthor: {
    apa: '*Untitled page: notes on things*. (n.d.). example.com. Retrieved November 7, 2026, from https://example.com/p',
    mla: '“Untitled Page: Notes on Things.” *example.com*, https://example.com/p. Accessed 7 Nov. 2026.',
    'chicago-ad': '“Untitled Page: Notes on Things.” n.d. example.com. Accessed November 7, 2026. https://example.com/p.',
    'chicago-nb': '“Untitled Page: Notes on Things.” example.com. Accessed November 7, 2026. https://example.com/p.',
    harvard: '*Untitled page: notes on things* (no date). Available at: https://example.com/p (Accessed: 7 November 2026).',
    ieee: '“Untitled page: notes on things,” example.com. Accessed: Nov. 7, 2026. [Online]. Available: https://example.com/p'
  },
  book: {
    apa: 'Booth, W. C. (2016). *The art of research* (4th ed.). University of Chicago Press.',
    mla: 'Booth, Wayne C. *The Art of Research*. 4th ed., University of Chicago Press, 2016.',
    'chicago-ad': 'Booth, Wayne C. 2016. *The Art of Research*. 4th ed. Chicago: University of Chicago Press.',
    'chicago-nb': 'Booth, Wayne C. *The Art of Research*. 4th ed. Chicago: University of Chicago Press, 2016.',
    harvard: 'Booth, W.C. (2016) *The art of research*. 4th edn. Chicago: University of Chicago Press.',
    ieee: 'W. C. Booth, *The art of research*, 4th ed. Chicago: University of Chicago Press, 2016.'
  },
  chapter: {
    apa: 'Lee, A. (2019). Methods matter. In B. Ray & M. Cho (Eds.), *The big book of methods* (pp. 1–10). Book House. https://doi.org/10.5555/ch',
    mla: 'Lee, Ann. “Methods Matter.” *The Big Book of Methods*, edited by Bob Ray and Mia Cho, Book House, 2019, pp. 1–10, https://doi.org/10.5555/ch.',
    'chicago-ad': 'Lee, Ann. 2019. “Methods Matter.” In *The Big Book of Methods*, edited by Bob Ray and Mia Cho, 1–10. London: Book House. https://doi.org/10.5555/ch.',
    'chicago-nb': 'Lee, Ann. “Methods Matter.” In *The Big Book of Methods*, edited by Bob Ray and Mia Cho, 1–10. London: Book House, 2019. https://doi.org/10.5555/ch.',
    harvard: 'Lee, A. (2019) ‘Methods matter’, in Ray, B. and Cho, M. (eds) *The big book of methods*. London: Book House, pp. 1–10. Available at: https://doi.org/10.5555/ch.',
    ieee: 'A. Lee, “Methods matter,” in *The big book of methods*, B. Ray and M. Cho, Eds. London: Book House, 2019, pp. 1–10, doi: 10.5555/ch.'
  },
  many: {
    apa:
      'AuthA, X., AuthB, X., AuthC, X., AuthD, X., AuthE, X., AuthF, X., AuthG, X., AuthH, X., AuthI, X., AuthJ, X., AuthK, X., AuthL, X., AuthM, X., AuthN, X., AuthO, X., AuthP, X., AuthQ, X., AuthR, X., AuthS, X., . . . AuthV, X. (2022). Big collab. *Science*, *1*(2), 3–4.',
    mla: 'AuthA, Xavier, et al. “Big Collab.” *Science*, vol. 1, no. 2, 2022, pp. 3–4.',
    'chicago-ad':
      'AuthA, Xavier, Xavier AuthB, Xavier AuthC, Xavier AuthD, Xavier AuthE, Xavier AuthF, Xavier AuthG, et al. 2022. “Big Collab.” *Science* 1 (2): 3–4.',
    'chicago-nb':
      'AuthA, Xavier, Xavier AuthB, Xavier AuthC, Xavier AuthD, Xavier AuthE, Xavier AuthF, Xavier AuthG, et al. “Big Collab.” *Science* 1, no. 2 (2022): 3–4.',
    harvard: 'AuthA, X. et al. (2022) ‘Big collab’, *Science*, 1(2), pp. 3–4.',
    ieee: 'X. AuthA et al., “Big collab,” *Science*, vol. 1, no. 2, pp. 3–4, 2022.'
  }
};

const FIXTURES: Record<string, CitationMetadata> = { journal, journal3, webpage, noAuthor, book, chapter, many };

describe('citationService reference outputs', () => {
  for (const [name, item] of Object.entries(FIXTURES)) {
    for (const style of STYLES) {
      it(`${style}: ${name}`, () => {
        expect(md(item, style)).toBe(EXPECTED[name][style]);
      });
    }
  }
});

describe('author list rules', () => {
  const authors = (n: number) => Array.from({ length: n }, (_, i) => ({ family: `F${i + 1}`, given: 'Ann' }));
  const item = (n: number): CitationMetadata => ({ type: 'article-journal', title: 'T', author: authors(n), issued: { 'date-parts': [[2020]] } });

  it('APA lists up to 20 authors, then 19 + ellipsis + last', () => {
    expect(S.formatEntry(item(20), 'apa')).toContain('F19, A., & F20, A. (2020)');
    const s = S.formatEntry(item(21), 'apa');
    expect(s).toContain('F19, A., . . . F21, A. (2020)');
    expect(s).not.toContain('F20');
  });
  it('MLA uses et al. for 3+', () => {
    expect(S.formatEntry(item(3), 'mla')).toMatch(/^F1, Ann, et al\. /);
  });
  it('IEEE lists up to 6 then et al.', () => {
    expect(S.formatEntry(item(6), 'ieee')).toMatch(/^A\. F1, A\. F2, A\. F3, A\. F4, A\. F5, and A\. F6, /);
    expect(S.formatEntry(item(7), 'ieee')).toMatch(/^A\. F1 et al\., /);
  });
  it('Harvard: 3 listed, 4+ et al.', () => {
    expect(S.formatEntry(item(3), 'harvard')).toMatch(/^F1, A\., F2, A\. and F3, A\. \(2020\)/);
    expect(S.formatEntry(item(4), 'harvard')).toMatch(/^F1, A\. et al\. \(2020\)/);
  });
  it('Chicago lists up to 10, then 7 + et al.', () => {
    expect(S.formatEntry(item(10), 'chicago-ad')).toContain('Ann F9, and Ann F10. 2020.');
    expect(S.formatEntry(item(11), 'chicago-ad')).toContain('Ann F7, et al. 2020.');
  });
  it('handles hyphenated given names and suffixes', () => {
    const it2: CitationMetadata = { type: 'book', title: 'X', author: [{ family: 'Sartre', given: 'Jean-Paul' }, { family: 'King', given: 'Martin Luther', suffix: 'Jr.' }] };
    expect(S.formatEntry(it2, 'apa')).toBe('Sartre, J.-P., & King, M. L., Jr. (n.d.). X.');
  });
  it('a question-mark title does not get an extra period', () => {
    const q: CitationMetadata = { type: 'article-journal', title: 'Why now?', author: [{ family: 'A', given: 'B' }], 'container-title': 'J', issued: { 'date-parts': [[2020]] } };
    expect(S.formatEntry(q, 'mla')).toBe('A, B. “Why Now?” J, 2020.');
    expect(S.formatEntry(q, 'apa')).toBe('A, B. (2020). Why now? J.');
  });
});

describe('in-text citations', () => {
  it('formats per style', () => {
    expect(S.formatInText(journal, 'apa')).toBe('(Smith & Doe, 2020)');
    expect(S.formatInText(journal3, 'apa')).toBe('(Smith et al., 2021)');
    expect(S.formatInText(journal, 'mla')).toBe('(Smith and Doe)');
    expect(S.formatInText(journal3, 'chicago-ad')).toBe('(Smith, Doe, and Lee 2021)');
    expect(S.formatInText(journal3, 'harvard')).toBe('(Smith, Doe and Lee, 2021)');
    expect(S.formatInText(journal, 'ieee', 3)).toBe('[3]');
    expect(S.formatInText(noAuthor, 'apa')).toBe('(Untitled page: notes on…, n.d.)');
  });
});

describe('bibliographies', () => {
  it('sorts alphabetically (ignoring leading articles) and numbers IEEE in input order', () => {
    const items = [journal3, book, noAuthor, chapter];
    const apa = S.formatBibliography(items, 'apa', 'text').split('\n\n');
    expect(apa.map((l: string) => l.slice(0, 6))).toEqual(['Booth,', 'Lee, A', 'Smith,', 'Untitl']);
    const ieee = S.formatBibliography(items, 'ieee', 'text').split('\n\n');
    expect(ieee[0]).toMatch(/^\[1\] J\. Smith/);
    expect(ieee[1]).toMatch(/^\[2\] W\. C\. Booth/);
  });
  it('dedupes by DOI and by URL, keeping the richest metadata', () => {
    const thin: CitationMetadata = { type: 'webpage', title: 'x', DOI: '10.1234/JOS.2020.123', source: 'fallback' };
    const sameUrlA: CitationMetadata = { type: 'webpage', title: 'Page', URL: 'https://www.ex.com/a/#frag' };
    const sameUrlB: CitationMetadata = { type: 'webpage', title: 'Page', URL: 'https://ex.com/a?utm_source=x', author: [{ family: 'Z', given: 'Q' }] };
    const out = S.dedupe([thin, journal, sameUrlA, sameUrlB]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(journal);
    expect(out[1]).toBe(sameUrlB);
  });
  it('renders HTML with italics, escaping and links', () => {
    const html = S.formatBibliography([{ ...book, title: 'Cats & <dogs>' }], 'apa', 'html');
    expect(html).toContain('<div class="csl-entry">Booth, W. C. (2016). <i>Cats &amp; &lt;dogs&gt;</i> (4th ed.). University of Chicago Press.</div>');
    const html2 = S.formatBibliography([journal], 'ieee', 'html');
    expect(html2).toContain('<span class="csl-left-margin">[1]</span>');
    const html3 = S.formatBibliography([journal], 'apa', 'html');
    expect(html3).toContain('<a href="https://doi.org/10.1234/jos.2020.123">https://doi.org/10.1234/jos.2020.123</a>');
  });
  it('includes highlighted quotes when asked', () => {
    const nodes = [
      { id: 1, text: 'quote one', url: 'https://ex.com/a', timestamp: '2026-11-07T12:00:00Z', parentId: null, children: [2], annotations: [{ text: 'my note', timestamp: '' }] },
      { id: 2, text: 'quote two', url: 'https://ex.com/a', timestamp: '2026-11-07T12:00:00Z', parentId: 1, children: [] }
    ] as TreeNode[];
    const text = S.formatBibliography(S.entriesFromNodes(nodes), 'apa', 'text', { includeQuotes: true });
    expect(text.split('\n')).toEqual([
      'ex.com. (n.d.). Retrieved November 7, 2026, from https://ex.com/a',
      '    > quote one',
      '    > Note: my note',
      '    > quote two'
    ]);
  });
});

describe('fallback citations from nodes', () => {
  it('builds a minimal webpage citation from url/title/timestamp', () => {
    const node = { id: 7, text: 't', url: 'https://www.example.org/x', title: 'Example page', timestamp: '2024-02-03T12:00:00Z', parentId: null, children: [] } as TreeNode;
    const c = S.citationFromNode(node);
    expect(c).toEqual({
      type: 'webpage',
      'container-title': 'example.org',
      source: 'fallback',
      URL: 'https://www.example.org/x',
      title: 'Example page',
      accessed: { 'date-parts': [[2024, 2, 3]] },
      id: 'node-7'
    });
    expect(S.formatEntry(c, 'apa')).toBe('Example page. (n.d.). example.org. Retrieved February 3, 2024, from https://www.example.org/x');
    expect(S.shortLabel(c)).toBe('');
  });
  it('uses stored metadata and fills URL/accessed', () => {
    const node = { id: 8, text: 't', url: 'https://j.org/a', timestamp: '2024-02-03T12:00:00Z', parentId: null, children: [], citation: { ...journal } } as TreeNode;
    const c = S.citationFromNode(node);
    expect(c.URL).toBe('https://j.org/a');
    expect(c.DOI).toBe(journal.DOI);
    expect(S.shortLabel(c)).toBe('Smith & Doe 2020 · Journal of Studies');
    expect(S.shortLabel(journal3)).toBe('Smith et al. 2021 · Nature');
  });
});

describe('BibTeX', () => {
  it('exports entries with keys, escaping and protected capitals', () => {
    const special: CitationMetadata = {
      type: 'article-journal',
      title: 'DNA & RNA: 100% of {things} in iPhone_s',
      author: [{ family: 'Müller', given: 'Jürgen' }, { literal: 'World Health Organization' }],
      'container-title': 'J. Bio $cience',
      issued: { 'date-parts': [[2021, 5, 2]] },
      page: '1-9',
      DOI: '10.1/a_b',
      URL: 'https://x.org/a_b%20c'
    };
    const bib = S.toBibTeX([journal, special, { ...journal, DOI: '10.9/other' }]);
    expect(bib).toBe(
      [
        '@article{smith2020study,',
        '  author = {Smith, John A. and Doe, Jane},',
        '  title = {A study of things},',
        '  journal = {Journal of Studies},',
        '  year = {2020},',
        '  volume = {12},',
        '  number = {3},',
        '  pages = {45--67},',
        '  doi = {10.1234/jos.2020.123}',
        '}',
        '',
        '@article{muller2021dna,',
        '  author = {Müller, Jürgen and {World Health Organization}},',
        '  title = {{DNA} \\& {RNA}: 100\\% of \\{things\\} in {iPhone\\_s}},',
        '  journal = {J. Bio \\$cience},',
        '  year = {2021},',
        '  month = may,',
        '  pages = {1--9},',
        '  doi = {10.1/a_b},',
        '  url = {https://x.org/a_b%20c}',
        '}',
        '',
        '@article{smith2020studya,',
        '  author = {Smith, John A. and Doe, Jane},',
        '  title = {A study of things},',
        '  journal = {Journal of Studies},',
        '  year = {2020},',
        '  volume = {12},',
        '  number = {3},',
        '  pages = {45--67},',
        '  doi = {10.9/other}',
        '}',
        ''
      ].join('\n')
    );
  });
  it('maps types and handles webpages', () => {
    const bib = S.toBibTeX([webpage, chapter, book, noAuthor]);
    expect(bib).toContain('@misc{world2023how,');
    expect(bib).toContain('  howpublished = {WHO},');
    expect(bib).toContain('  urldate = {2026-11-07}');
    expect(bib).toContain('@incollection{lee2019methods,');
    expect(bib).toContain('  booktitle = {The big book of methods},');
    expect(bib).toContain('  editor = {Ray, Bob and Cho, Mia},');
    expect(bib).toContain('@book{booth2016art,');
    expect(bib).toContain('  address = {Chicago},');
    expect(bib).toContain('@misc{untitlednd,');
  });
  it('escapes special characters', () => {
    expect(S.bibtexEscape('a\\b~c^d#e')).toBe('a\\textbackslash{}b\\textasciitilde{}c\\textasciicircum{}d\\#e');
  });
});

describe('RIS', () => {
  it('exports tagged records', () => {
    const ris = S.toRIS([journal, webpage]);
    expect(ris.split('\r\n')).toEqual([
      'TY  - JOUR',
      'AU  - Smith, John A.',
      'AU  - Doe, Jane',
      'TI  - A study of things',
      'T2  - Journal of Studies',
      'PY  - 2020',
      'DA  - 2020///',
      'VL  - 12',
      'IS  - 3',
      'SP  - 45',
      'EP  - 67',
      'DO  - 10.1234/jos.2020.123',
      'ER  - ',
      '',
      'TY  - ELEC',
      'AU  - World Health Organization',
      'TI  - How to cite a website',
      'T2  - WHO',
      'PY  - 2023',
      'DA  - 2023/06/15/',
      'UR  - https://www.who.int/cite',
      'Y2  - 2026-11-07',
      'ER  - ',
      ''
    ]);
  });
});

describe('CSL-JSON', () => {
  it('exports an array with ids and without the fallback marker', () => {
    const json = JSON.parse(S.toCslJson([journal, { type: 'webpage', title: 'x', URL: 'https://a.b', source: 'fallback' }]));
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ ...journal, id: 'smith2020study' });
    expect(json[1].source).toBeUndefined();
  });
});

describe('exportEntries', () => {
  it('returns extension/mime per format', () => {
    expect(S.exportEntries([journal], 'bibtex').extension).toBe('bib');
    expect(S.exportEntries([journal], 'ris').extension).toBe('ris');
    expect(S.exportEntries([journal], 'csl-json').extension).toBe('json');
    const html = S.exportEntries([journal], 'html', 'mla');
    expect(html.text).toMatch(/^<!DOCTYPE html>/);
    expect(html.html).toContain('<i>Journal of Studies</i>');
    const txt = S.exportEntries([journal], 'text', 'mla');
    expect(txt.text).toBe(S.formatEntry(journal, 'mla'));
  });
});

describe('collectNodes', () => {
  const n = (id: number, parentId: number | null, children: number[], extra: any = {}) => ({ id, text: `t${id}`, url: `https://x/${id}`, timestamp: '', parentId, children, ...extra });
  const tabsData = {
    activeTabId: 'b',
    tabs: [
      { id: 'a', treeData: { nodes: [n(1, null, [2, 3]), n(2, 1, [4]), n(3, 1, [], { deleted: true }), n(4, 2, [])] } },
      { id: 'b', treeData: { nodes: [n(5, null, []), n(6, null, [])] } }
    ]
  };
  it('selects by scope', () => {
    const ids = (xs: any[]) => xs.map(x => x.id);
    expect(ids(S.collectNodes(tabsData, 'node', { nodeId: 2 }))).toEqual([2]);
    expect(ids(S.collectNodes(tabsData, 'subtree', { nodeId: 1 }))).toEqual([1, 2, 4]);
    expect(ids(S.collectNodes(tabsData, 'tab', {}))).toEqual([5, 6]);
    expect(ids(S.collectNodes(tabsData, 'tab', { tabId: 'a' }))).toEqual([1, 2, 4]);
    expect(ids(S.collectNodes(tabsData, 'all'))).toEqual([1, 2, 4, 5, 6]);
    expect(S.collectNodes(tabsData, 'node', { nodeId: 99 })).toEqual([]);
  });
});

describe('editor helpers', () => {
  it('round-trips author lists and dates', () => {
    const names = S.parseAuthorList('Smith, John A.\nJane Doe\n{Acme Labs}');
    expect(names).toEqual([{ family: 'Smith', given: 'John A.' }, { family: 'Doe', given: 'Jane' }, { literal: 'Acme Labs' }]);
    expect(S.formatAuthorList(names)).toBe('Smith, John A.\nDoe, Jane\n{Acme Labs}');
    expect(S.parseDateInput('2020-05')).toEqual({ 'date-parts': [[2020, 5]] });
    expect(S.formatDateInput({ 'date-parts': [[2020, 5, 1]] })).toBe('2020-05-01');
    expect(S.parseDateInput('Spring 2020')).toEqual({ 'date-parts': [[2020]] });
  });
  it('merges enriched metadata but keeps the visited URL and accessed date', () => {
    const merged = S.mergeCitation(
      { type: 'webpage', title: 'Page', URL: 'https://pub.com/a', accessed: { 'date-parts': [[2026, 1, 1]] } },
      { type: 'article-journal', title: 'Real title', URL: 'https://doi.org/10.1/x', DOI: '10.1/x', author: [] }
    );
    expect(merged).toEqual({ type: 'article-journal', title: 'Real title', URL: 'https://pub.com/a', DOI: '10.1/x', accessed: { 'date-parts': [[2026, 1, 1]] } });
  });
  it('title-cases without lowering existing capitals', () => {
    expect(S.titleCase('the role of mRNA in a well-known iPhone study: an overview of things')).toBe('The Role of mRNA in a Well-Known iPhone Study: An Overview of Things');
  });
});
