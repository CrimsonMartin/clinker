/**
 * @jest-environment jsdom
 */
require('../citationMetadata');
require('../services/citationService');
require('../components/exportDialog');
require('../components/citationEditor');

const CL = (window as any).CitationLinker;

const journal = {
  type: 'article-journal', title: 'A study of things', author: [{ family: 'Smith', given: 'John A.' }, { family: 'Doe', given: 'Jane' }],
  'container-title': 'Journal of Studies', volume: '12', issue: '3', page: '45-67', issued: { 'date-parts': [[2020]] }, DOI: '10.1234/jos.2020.123'
};
const tabsData = () => ({
  activeTabId: 't1',
  tabs: [
    { id: 't1', title: 'My Project', treeData: { currentNodeId: 1, nodes: [
      { id: 1, text: 'quote one', url: 'https://j.org/a', timestamp: '2026-11-07T12:00:00Z', parentId: null, children: [2], citation: journal },
      { id: 2, text: 'quote two', url: 'https://www.example.org/x', title: 'Example page', timestamp: '2026-11-07T12:00:00Z', parentId: 1, children: [] }
    ] } },
    { id: 't2', title: 'Other', treeData: { currentNodeId: null, nodes: [] } }
  ]
});
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = '';
  (global as any).browser.storage.local.get = jest.fn().mockResolvedValue({});
  (global as any).browser.storage.local.set = jest.fn().mockResolvedValue(undefined);
});

describe('ExportDialog', () => {
  it('opens for a project, previews, switches format and closes on Escape', async () => {
    await CL.exportDialog.open({ scope: 'tab', getTabsData: async () => tabsData() });
    const modal = document.querySelector('.export-modal')!;
    expect(modal).toBeTruthy();
    expect(modal.querySelector('h3')!.textContent).toBe('Export references');
    const entries = modal.querySelectorAll('.csl-entry');
    expect(entries).toHaveLength(2);
    expect(entries[0].innerHTML).toContain('<i>Example page</i>');
    expect(modal.querySelector('.cite-summary')!.textContent).toContain('2 sources from 2 highlights · 1 without metadata');

    const fmt = document.getElementById('exportFormat') as HTMLSelectElement;
    fmt.value = 'bibtex';
    fmt.dispatchEvent(new Event('change'));
    expect(modal.querySelector('.cite-preview')!.textContent).toContain('@article{smith2020study,');
    expect((global as any).browser.storage.local.set).toHaveBeenCalledWith({ citationExportPrefs: { format: 'bibtex', fileType: 'txt', includeQuotes: false } });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.export-modal')).toBeNull();
  });

  it('node scope offers nested option and shows the in-text citation', async () => {
    await CL.exportDialog.open({ scope: 'node', nodeId: 1, getTabsData: async () => tabsData() });
    const scope = document.getElementById('exportScope') as HTMLSelectElement;
    expect(Array.from(scope.options).map(o => o.value)).toEqual(['node', 'subtree', 'tab', 'all']);
    expect(document.querySelector('.export-modal h3')!.textContent).toBe('Cite');
    expect(document.querySelector('.cite-intext-value')!.textContent).toBe('(Smith & Doe, 2020)');
    scope.value = 'subtree';
    scope.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.export-modal .csl-entry')).toHaveLength(2);
    CL.exportDialog.close();
  });

  it('copies plain text (and HTML when supported)', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await CL.exportDialog.open({ scope: 'node', nodeId: 1, getTabsData: async () => tabsData() });
    (document.getElementById('exportCopyBtn') as HTMLButtonElement).click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(CL.citationService.formatEntry(journal, 'apa'));
    expect(document.querySelector('.export-modal .cite-status')!.textContent).toBe('Copied 1 reference');
    CL.exportDialog.close();
  });

  it('downloads via a blob link when browser.downloads is unavailable', async () => {
    (URL as any).createObjectURL = jest.fn(() => 'blob:x');
    (URL as any).revokeObjectURL = jest.fn();
    const clicks: string[] = [];
    const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
    await CL.exportDialog.open({ scope: 'tab', format: 'ris', getTabsData: async () => tabsData() });
    (document.getElementById('exportDownloadBtn') as HTMLButtonElement).click();
    await flush();
    expect(clicks[0]).toMatch(/^clinker-my-project-\d{4}-\d{2}-\d{2}\.ris$/);
    spy.mockRestore();
    CL.exportDialog.close();
  });

  it('shows an empty state', async () => {
    await CL.exportDialog.open({ scope: 'tab', tabId: 't2', getTabsData: async () => tabsData() });
    expect(document.querySelector('.cite-preview')!.textContent).toContain('Nothing to export');
    expect((document.getElementById('exportCopyBtn') as HTMLButtonElement).disabled).toBe(true);
    CL.exportDialog.close();
  });
});

describe('CitationEditor', () => {
  it('prefills from metadata and saves edits', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const p = CL.citationEditor.open(1, { getTabsData: async () => tabsData(), save });
    await flush();
    const title = document.getElementById('citeField-title') as HTMLInputElement;
    expect(title.value).toBe('A study of things');
    expect((document.getElementById('citeField-author') as HTMLTextAreaElement).value).toBe('Smith, John A.\nDoe, Jane');
    expect((document.getElementById('citeField-issued') as HTMLInputElement).value).toBe('2020');
    title.value = 'A better title';
    (document.getElementById('citeField-DOI') as HTMLInputElement).value = 'https://doi.org/10.1000/new';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('.cite-editor-preview')!.innerHTML).toContain('A better title');
    (document.getElementById('citeSaveBtn') as HTMLButtonElement).click();
    const result = await p;
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.title).toBe('A better title');
    expect(result.DOI).toBe('10.1000/new');
    expect(result.source).toBe('manual');
    expect(document.querySelector('.citation-editor-modal')).toBeNull();
  });

  it('starts from the fallback for nodes without metadata and clears the hostname when switching to a journal', async () => {
    const p = CL.citationEditor.open(2, { getTabsData: async () => tabsData(), save: jest.fn() });
    await flush();
    const container = document.getElementById('citeField-container-title') as HTMLInputElement;
    expect(container.value).toBe('example.org');
    const type = document.getElementById('citeField-type') as HTMLSelectElement;
    type.value = 'article-journal';
    type.dispatchEvent(new Event('change'));
    expect(container.value).toBe('');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(p).resolves.toBeNull();
  });

  it('fills fields from a DOI lookup', async () => {
    CL.citationApi = { enrichFromDoi: jest.fn().mockResolvedValue({ type: 'book', title: 'From DOI', author: [{ family: 'Lee', given: 'Ann' }], publisher: 'Pub', DOI: '10.5/x' }) };
    const p = CL.citationEditor.open(2, { getTabsData: async () => tabsData(), save: jest.fn() });
    await flush();
    (document.getElementById('citeField-DOI') as HTMLInputElement).value = '10.5/x';
    (document.querySelector('.cite-fetch') as HTMLButtonElement).click();
    await flush();
    await flush();
    expect(CL.citationApi.enrichFromDoi).toHaveBeenCalledWith('10.5/x');
    expect((document.getElementById('citeField-title') as HTMLInputElement).value).toBe('From DOI');
    expect((document.getElementById('citeField-type') as HTMLSelectElement).value).toBe('book');
    expect((document.getElementById('citeField-URL') as HTMLInputElement).value).toBe('https://www.example.org/x');
    CL.citationEditor.close();
    await p;
  });
});
