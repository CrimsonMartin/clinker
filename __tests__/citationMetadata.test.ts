/**
 * @jest-environment jsdom
 */
require('../citationMetadata');

const X = (global as any).ClinkerCitationExtraction;
const NOW = new Date(2026, 10, 7, 12, 0, 0);

function doc(html: string): Document {
  return new DOMParser().parseFromString(`<!DOCTYPE html><html lang="en"><head>${html}</head><body></body></html>`, 'text/html');
}
function docWithBody(head: string, body: string): Document {
  return new DOMParser().parseFromString(`<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`, 'text/html');
}

describe('extractCitationMetadata', () => {
  it('reads Highwire citation_* tags (journal article)', () => {
    const d = doc(`
      <title>A study of things | Journal of Studies</title>
      <meta name="citation_title" content="A study of things">
      <meta name="citation_author" content="Smith, John A.">
      <meta name="citation_author" content="Jane Doe">
      <meta name="citation_journal_title" content="Journal of Studies">
      <meta name="citation_publication_date" content="2020/05/01">
      <meta name="citation_volume" content="12">
      <meta name="citation_issue" content="3">
      <meta name="citation_firstpage" content="45">
      <meta name="citation_lastpage" content="67">
      <meta name="citation_doi" content="doi:10.1234/jos.2020.123">
      <meta name="citation_issn" content="1234-5678">
      <meta name="citation_publisher" content="Study Press">
      <meta property="og:site_name" content="Study Press Online">
      <link rel="canonical" href="https://journal.example/article/123">`);
    const c = X.extractCitationMetadata(d, 'https://journal.example/article/123?utm=1', NOW);
    expect(c).toEqual({
      type: 'article-journal',
      title: 'A study of things',
      author: [{ family: 'Smith', given: 'John A.' }, { family: 'Doe', given: 'Jane' }],
      issued: { 'date-parts': [[2020, 5, 1]] },
      'container-title': 'Journal of Studies',
      volume: '12',
      issue: '3',
      page: '45-67',
      DOI: '10.1234/jos.2020.123',
      ISSN: '1234-5678',
      publisher: 'Study Press',
      language: 'en',
      URL: 'https://journal.example/article/123',
      accessed: { 'date-parts': [[2026, 11, 7]] },
      source: 'highwire'
    });
  });

  it('reads JSON-LD ScholarlyArticle with isPartOf chain', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Pub' },
        {
          '@type': 'ScholarlyArticle',
          headline: 'Deep things',
          author: [{ '@type': 'Person', givenName: 'Ann', familyName: 'Lee' }, { '@type': 'Organization', name: 'The Consortium' }],
          datePublished: '2021-07-09T10:00:00Z',
          identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5555/deep.1' },
          pageStart: '10',
          pageEnd: '20',
          publisher: { '@type': 'Organization', name: 'Pub Inc' },
          isPartOf: {
            '@type': 'PublicationIssue',
            issueNumber: '4',
            isPartOf: { '@type': 'PublicationVolume', volumeNumber: '7', isPartOf: { '@type': 'Periodical', name: 'Deep Journal' } }
          }
        }
      ]
    };
    const d = doc(`<title>Deep things</title><script type="application/ld+json">${JSON.stringify(ld)}</script>`);
    const c = X.extractCitationMetadata(d, 'https://pub.example/a', NOW);
    expect(c.type).toBe('article-journal');
    expect(c.title).toBe('Deep things');
    expect(c.author).toEqual([{ family: 'Lee', given: 'Ann' }, { literal: 'The Consortium' }]);
    expect(c.issued).toEqual({ 'date-parts': [[2021, 7, 9]] });
    expect(c.DOI).toBe('10.5555/deep.1');
    expect(c['container-title']).toBe('Deep Journal');
    expect(c.volume).toBe('7');
    expect(c.issue).toBe('4');
    expect(c.page).toBe('10-20');
    expect(c.publisher).toBe('Pub Inc');
    expect(c.source).toBe('json-ld');
  });

  it('reads Dublin Core and PRISM', () => {
    const d = doc(`
      <meta name="DC.title" content="Old paper">
      <meta name="DC.creator" content="Ludwig van Beethoven">
      <meta name="DC.creator" content="Smith JA">
      <meta name="DCTERMS.issued" content="1999-12">
      <meta name="DC.identifier" content="https://doi.org/10.1000/old.99">
      <meta name="DC.type" content="Text.Serial.Journal">
      <meta name="prism.publicationName" content="Old Journal">
      <meta name="prism.volume" content="3">
      <meta name="prism.startingPage" content="5">
      <meta name="prism.endingPage" content="9">`);
    const c = X.extractCitationMetadata(d, 'https://old.example/p', NOW);
    expect(c.type).toBe('article-journal');
    expect(c.title).toBe('Old paper');
    expect(c.author).toEqual([{ family: 'van Beethoven', given: 'Ludwig' }, { family: 'Smith', given: 'J. A.' }]);
    expect(c.issued).toEqual({ 'date-parts': [[1999, 12]] });
    expect(c.DOI).toBe('10.1000/old.99');
    expect(c['container-title']).toBe('Old Journal');
    expect(c.volume).toBe('3');
    expect(c.page).toBe('5-9');
    expect(c.source).toBe('dublin-core+prism');
  });

  it('falls back to OpenGraph / generic meta for news-like webpages', () => {
    const d = doc(`
      <title>Big news happened - The Daily</title>
      <meta property="og:site_name" content="The Daily">
      <meta property="og:type" content="article">
      <meta name="author" content="Pat Writer">
      <meta property="article:author" content="https://facebook.com/pat">
      <meta property="article:published_time" content="2024-03-02T08:00:00-05:00">`);
    const c = X.extractCitationMetadata(d, 'https://daily.example/news/1', NOW);
    expect(c).toMatchObject({
      type: 'webpage',
      title: 'Big news happened',
      author: [{ family: 'Writer', given: 'Pat' }],
      issued: { 'date-parts': [[2024, 3, 2]] },
      'container-title': 'The Daily',
      URL: 'https://daily.example/news/1',
      source: 'page'
    });
  });

  it('uses the hostname and <title> when nothing else exists', () => {
    const c = X.extractCitationMetadata(doc('<title>Hello</title>'), 'https://www.plain.example/x', NOW);
    expect(c).toEqual({
      type: 'webpage',
      title: 'Hello',
      'container-title': 'plain.example',
      language: 'en',
      URL: 'https://www.plain.example/x',
      accessed: { 'date-parts': [[2026, 11, 7]] },
      source: 'page'
    });
  });

  it('detects a DOI in the URL', () => {
    const c = X.extractCitationMetadata(doc('<title>x</title>'), 'https://onlinelibrary.wiley.com/doi/full/10.1002/abc.123', NOW);
    expect(c.DOI).toBe('10.1002/abc.123');
  });

  it('detects a DOI from a single doi.org link, but not from a reference list', () => {
    const one = docWithBody('<title>x</title>', '<a href="https://doi.org/10.7777/one">doi</a><a href="https://doi.org/10.7777/one">again</a>');
    expect(X.extractCitationMetadata(one, 'https://a.example/', NOW).DOI).toBe('10.7777/one');
    const many = docWithBody('<title>x</title>', '<a href="https://doi.org/10.7777/one">1</a><a href="https://doi.org/10.7777/two">2</a>');
    expect(X.extractCitationMetadata(many, 'https://a.example/', NOW).DOI).toBeUndefined();
  });

  it('recognises arXiv abstract pages', () => {
    const d = doc(`
      <meta name="citation_title" content="Attention is all you need">
      <meta name="citation_author" content="Vaswani, Ashish">
      <meta name="citation_date" content="2017/06/12">
      <meta name="citation_arxiv_id" content="1706.03762">`);
    const c = X.extractCitationMetadata(d, 'https://arxiv.org/abs/1706.03762v7', NOW);
    expect(c.type).toBe('article');
    expect(c['container-title']).toBe('arXiv');
    expect(c.number).toBe('arXiv:1706.03762');
    expect(c.DOI).toBe('10.48550/arXiv.1706.03762');
  });

  it('classifies books and chapters', () => {
    const b = X.extractCitationMetadata(doc('<meta name="citation_title" content="A Book"><meta name="citation_isbn" content="978-0-226-23973-7">'), 'https://b.example', NOW);
    expect(b.type).toBe('book');
    expect(b.ISBN).toBe('978-0-226-23973-7');
    const ch = X.extractCitationMetadata(doc('<meta name="citation_title" content="Ch 1"><meta name="citation_inbook_title" content="Big Book">'), 'https://b.example', NOW);
    expect(ch.type).toBe('chapter');
    expect(ch['container-title']).toBe('Big Book');
  });

  it('survives malformed JSON-LD', () => {
    const d = doc('<title>T</title><script type="application/ld+json">{not json</script>');
    expect(() => X.extractCitationMetadata(d, 'https://a.example', NOW)).not.toThrow();
  });
});

describe('helpers', () => {
  it('parseName handles common shapes', () => {
    expect(X.parseName('Smith, John A.')).toEqual({ family: 'Smith', given: 'John A.' });
    expect(X.parseName('John A. Smith')).toEqual({ family: 'Smith', given: 'John A.' });
    expect(X.parseName('Martin Luther King Jr.')).toEqual({ family: 'King', given: 'Martin Luther', suffix: 'Jr.' });
    expect(X.parseName('By Jane Doe')).toEqual({ family: 'Doe', given: 'Jane' });
    expect(X.parseName('World Health Organization')).toEqual({ literal: 'World Health Organization' });
    expect(X.parseName('Plato')).toEqual({ family: 'Plato' });
    expect(X.parseName('https://twitter.com/x')).toBeNull();
    expect(X.parseName('  ')).toBeNull();
  });
  it('parseDate handles common shapes', () => {
    expect(X.parseDate('2020-05-01T10:00:00Z')).toEqual({ 'date-parts': [[2020, 5, 1]] });
    expect(X.parseDate('2020/5')).toEqual({ 'date-parts': [[2020, 5]] });
    expect(X.parseDate('May 1, 2020')).toEqual({ 'date-parts': [[2020, 5, 1]] });
    expect(X.parseDate('1 Sept. 2020')).toEqual({ 'date-parts': [[2020, 9, 1]] });
    expect(X.parseDate('20200501')).toEqual({ 'date-parts': [[2020, 5, 1]] });
    expect(X.parseDate('Published in 1998')).toEqual({ 'date-parts': [[1998]] });
    expect(X.parseDate('garbage')).toBeUndefined();
  });
  it('normalizeDoi strips prefixes, suffixes and punctuation', () => {
    expect(X.normalizeDoi('https://doi.org/10.1000/xyz123.')).toBe('10.1000/xyz123');
    expect(X.normalizeDoi('doi: 10.1000/a(b)c')).toBe('10.1000/a(b)c');
    expect(X.normalizeDoi('(see 10.1000/abc)')).toBe('10.1000/abc');
    expect(X.normalizeDoi('https://x.org/doi/10.1000/abc/full')).toBe('10.1000/abc');
    expect(X.normalizeDoi('10.1000%2Fabc')).toBe('10.1000/abc');
    expect(X.normalizeDoi('nope')).toBeUndefined();
  });
});
