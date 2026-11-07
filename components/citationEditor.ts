// citationEditor.ts - Edit a node's bibliographic metadata (CSL-JSON shaped `node.citation`).
//
// Usage:  await window.CitationLinker.citationEditor.open(nodeId)
//   -> resolves with the saved CitationMetadata, or null if cancelled.
// Saves into tabsData (via CitationLinker.tabService.updateTabTree, or storage directly) and
// marks the data modified for sync. "Fetch from DOI" calls the Clinker API
// (CitationLinker.citationApi.enrichFromDoi); "Read from page" asks an open tab's content script.
//
// Load after exportDialog.js (reuses its modal/field helpers) and citationService.js.


// Render citationService HTML (already escaped) without innerHTML (keeps AMO's linter quiet).
// Uniquely named: these components are global scripts sharing one scope with exportDialog.ts.
function setEditorPreviewHtml(el: Element, html: string): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  el.replaceChildren(...Array.from(doc.body.childNodes));
}

namespace ClinkerCitationEditor {
  type Item = CitationLinker.CitationMetadata;

  export interface OpenOptions {
    /** Test hook: supply tabs data instead of reading storage. */
    getTabsData?: () => Promise<any>;
    /** Test hook / override: persist instead of writing tabsData. */
    save?: (nodeId: number, citation: Item) => Promise<void>;
  }

  const TYPES: Array<[CitationLinker.CslType, string]> = [
    ['article-journal', 'Journal article'],
    ['article', 'Preprint'],
    ['article-magazine', 'Magazine article'],
    ['article-newspaper', 'Newspaper article'],
    ['webpage', 'Web page'],
    ['post-weblog', 'Blog post'],
    ['book', 'Book'],
    ['chapter', 'Book chapter'],
    ['paper-conference', 'Conference paper'],
    ['report', 'Report'],
    ['thesis', 'Thesis'],
    ['dataset', 'Dataset'],
    ['software', 'Software']
  ];

  const CONTAINER_LABEL: Record<string, string> = {
    'article-journal': 'Journal',
    article: 'Repository (e.g. arXiv)',
    'article-magazine': 'Magazine',
    'article-newspaper': 'Newspaper',
    webpage: 'Website',
    'post-weblog': 'Blog',
    chapter: 'Book title',
    'paper-conference': 'Proceedings',
    report: 'Series',
    book: 'Series',
    thesis: 'Series',
    dataset: 'Repository',
    software: 'Repository'
  };

  // Fields shown per kind (title/authors/date/DOI/URL are always shown)
  const SHOW: Record<string, string[]> = {
    periodical: ['container-title', 'volume', 'issue', 'page'],
    book: ['publisher', 'publisher-place', 'edition', 'ISBN', 'editor'],
    chapter: ['container-title', 'editor', 'page', 'publisher', 'publisher-place', 'ISBN'],
    webpage: ['container-title', 'publisher', 'accessed']
  };

  function kind(type: string): string {
    if (['article-journal', 'article', 'article-magazine', 'article-newspaper'].includes(type)) return 'periodical';
    if (['book', 'report', 'thesis', 'dataset', 'software'].includes(type)) return 'book';
    if (['chapter', 'paper-conference'].includes(type)) return 'chapter';
    return 'webpage';
  }

  const ui = (): any => (window as any).CitationLinker?.citeUi;
  const svc = (): any => (window as any).CitationLinker?.citationService;
  const api = (): any => (window as any).CitationLinker?.citationApi;

  async function defaultSave(nodeId: number, citation: Item): Promise<void> {
    const U = ui();
    const ts = (window as any).CitationLinker?.tabService;
    const tabsData = await U.loadTabsData();
    const tab = (tabsData.tabs || []).find((t: any) => (t.treeData?.nodes || []).some((n: any) => n.id === nodeId));
    if (!tab) throw new Error('Citation not found');
    const node = tab.treeData.nodes.find((n: any) => n.id === nodeId);
    node.citation = citation;
    if (ts && typeof ts.updateTabTree === 'function') {
      await ts.updateTabTree(tab.id, tab.treeData);
    } else {
      tab.lastModified = Date.now();
      await U.storageSet({ tabsData });
    }
    const w: any = window;
    try {
      if (w.syncManager && typeof w.syncManager.markAsModified === 'function' && w.authManager?.isLoggedIn?.()) {
        await w.syncManager.markAsModified();
      }
    } catch {
      /* sync is best-effort */
    }
  }

  export class CitationEditor {
    private overlay: HTMLElement | null = null;
    private onKey: ((e: KeyboardEvent) => void) | null = null;
    private resolver: ((v: Item | null) => void) | null = null;

    isOpen(): boolean {
      return !!this.overlay;
    }

    close(result: Item | null = null): void {
      if (this.onKey) document.removeEventListener('keydown', this.onKey);
      this.onKey = null;
      this.overlay?.remove();
      this.overlay = null;
      const r = this.resolver;
      this.resolver = null;
      if (r) r(result);
    }

    async open(nodeId: number, options: OpenOptions = {}): Promise<Item | null> {
      this.close();
      const U = ui();
      const S = svc();
      if (!U || !S) {
        console.error('exportDialog.js and citationService.js must be loaded before citationEditor.js');
        return null;
      }
      const tabsData = await (options.getTabsData ? options.getTabsData() : U.loadTabsData());
      const node = (tabsData.tabs || []).flatMap((t: any) => t.treeData?.nodes || []).find((n: any) => n.id === nodeId);
      if (!node) return null;

      let item: Item = S.citationFromNode(node);
      const save = options.save || defaultSave;

      return new Promise<Item | null>(resolve => {
        this.resolver = resolve;
        const m = U.createModal('Edit citation', 'citation-editor-modal', () => this.close(null));
        this.overlay = m.overlay;
        const el = U.el;
        const field = U.field;

        const form = el('form', 'cite-form') as HTMLFormElement;
        form.noValidate = true;
        const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {};
        const rows: Record<string, HTMLElement> = {};

        const input = (key: string, label: string, opts: { textarea?: boolean; placeholder?: string; half?: boolean; third?: boolean } = {}) => {
          const c = opts.textarea ? (el('textarea', 'cite-input') as HTMLTextAreaElement) : (el('input', 'cite-input') as HTMLInputElement);
          if (!opts.textarea) (c as HTMLInputElement).type = 'text';
          else (c as HTMLTextAreaElement).rows = 3;
          c.name = key;
          c.id = `citeField-${key}`;
          if (opts.placeholder) c.placeholder = opts.placeholder;
          inputs[key] = c;
          const row = field(label, c, opts.third ? 'cite-field-third' : opts.half ? 'cite-field-half' : '');
          rows[key] = row;
          return row;
        };

        const typeSel = el('select', 'cite-select') as HTMLSelectElement;
        typeSel.id = 'citeField-type';
        TYPES.forEach(([v, l]) => {
          const o = el('option', undefined, l);
          o.value = v;
          typeSel.appendChild(o);
        });
        if (!TYPES.some(([v]) => v === item.type)) {
          const o = el('option', undefined, item.type);
          o.value = item.type;
          typeSel.appendChild(o);
        }
        inputs.type = typeSel;

        // DOI row with Fetch button
        const doiRow = el('div', 'cite-doi-row');
        const doiField = input('DOI', 'DOI', { placeholder: '10.xxxx/…' });
        const fetchBtn = el('button', 'button button-ghost cite-fetch') as HTMLButtonElement;
        fetchBtn.type = 'button';
        fetchBtn.textContent = 'Fetch from DOI';
        fetchBtn.title = 'Fill in the details from the DOI registry (Crossref/DataCite)';
        doiRow.append(doiField, fetchBtn);

        form.append(
          field('Type', typeSel),
          input('title', 'Title'),
          input('author', 'Authors', { textarea: true, placeholder: 'Family, Given — one per line; {Organisation} for groups' }),
          input('issued', 'Published', { placeholder: 'YYYY-MM-DD', half: true }),
          input('accessed', 'Accessed', { placeholder: 'YYYY-MM-DD', half: true }),
          input('container-title', 'Journal'),
          input('volume', 'Volume', { third: true }),
          input('issue', 'Issue', { third: true }),
          input('page', 'Pages', { third: true, placeholder: '12-34' }),
          input('editor', 'Editors', { textarea: true, placeholder: 'Family, Given — one per line' }),
          input('publisher', 'Publisher', { half: true }),
          input('publisher-place', 'Place', { half: true }),
          input('edition', 'Edition', { half: true }),
          input('ISBN', 'ISBN', { half: true }),
          doiRow,
          input('URL', 'URL')
        );
        (inputs.author as HTMLTextAreaElement).rows = 3;
        (inputs.editor as HTMLTextAreaElement).rows = 2;

        const previewLabel = el('div', 'cite-field-label', 'Preview (APA)');
        const preview = el('div', 'cite-preview cite-preview-rich cite-editor-preview');
        const status = el('div', 'cite-status cite-editor-status');
        status.setAttribute('aria-live', 'polite');
        m.body.append(form, previewLabel, preview);

        // Footer
        const readBtn = el('button', 'button button-ghost') as HTMLButtonElement;
        readBtn.type = 'button';
        readBtn.textContent = 'Read from page';
        readBtn.title = 'Re-extract metadata from the page if it is open in a browser tab';
        const cancelBtn = el('button', 'button button-ghost', 'Cancel') as HTMLButtonElement;
        cancelBtn.type = 'button';
        const saveBtn = el('button', 'button button-primary', 'Save') as HTMLButtonElement;
        saveBtn.type = 'button';
        saveBtn.id = 'citeSaveBtn';
        const actions = el('div', 'cite-actions');
        actions.append(cancelBtn, saveBtn);
        const left = el('div', 'cite-footer-left');
        left.append(readBtn, status);
        m.footer.append(left, actions);

        // ---- form <-> item ----------------------------------------------------
        let lastKind = '';
        const fill = (it: Item) => {
          typeSel.value = it.type;
          if (typeSel.value !== it.type) typeSel.value = 'webpage';
          lastKind = kind(typeSel.value);
          const set = (k: string, v: string | undefined) => {
            if (inputs[k]) inputs[k].value = v || '';
          };
          set('title', it.title);
          set('author', S.formatAuthorList(it.author));
          set('editor', S.formatAuthorList(it.editor));
          set('issued', S.formatDateInput(it.issued));
          set('accessed', S.formatDateInput(it.accessed));
          ['container-title', 'volume', 'issue', 'page', 'publisher', 'publisher-place', 'edition', 'ISBN', 'DOI', 'URL'].forEach(k => set(k, (it as any)[k]));
          applyVisibility();
        };

        const read = (): Item => {
          const out: any = { ...item, type: typeSel.value };
          const str = (k: string) => (inputs[k].value || '').trim();
          const setOrDelete = (k: string, v: any) => {
            if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete out[k];
            else out[k] = v;
          };
          setOrDelete('title', str('title'));
          setOrDelete('author', S.parseAuthorList(inputs.author.value));
          setOrDelete('editor', S.parseAuthorList(inputs.editor.value));
          setOrDelete('issued', S.parseDateInput(str('issued')));
          setOrDelete('accessed', S.parseDateInput(str('accessed')));
          ['container-title', 'volume', 'issue', 'page', 'publisher', 'publisher-place', 'edition', 'ISBN', 'URL'].forEach(k => setOrDelete(k, str(k)));
          const doiText = str('DOI');
          setOrDelete('DOI', doiText ? S.normalizeDoi(doiText) || doiText : '');
          return out as Item;
        };

        const applyVisibility = () => {
          const k = kind(typeSel.value);
          const show = new Set(SHOW[k]);
          ['container-title', 'volume', 'issue', 'page', 'editor', 'publisher', 'publisher-place', 'edition', 'ISBN'].forEach(f => {
            if (rows[f]) rows[f].style.display = show.has(f) ? '' : 'none';
          });
          const lbl = rows['container-title']?.querySelector('.cite-field-label');
          if (lbl) lbl.textContent = CONTAINER_LABEL[typeSel.value] || 'Container';
        };

        const updatePreview = () => {
          try {
            const html = S.formatEntry(read(), 'apa', 'html');
            setEditorPreviewHtml(preview, html); // escaped by citationService
          } catch {
            preview.textContent = '';
          }
        };

        let flashTimer: any = null;
        const flash = (msg: string, isError = false) => {
          status.textContent = msg;
          status.classList.toggle('error', isError);
          if (flashTimer) clearTimeout(flashTimer);
          flashTimer = setTimeout(() => (status.textContent = ''), 4000);
        };

        form.addEventListener('input', updatePreview);
        typeSel.addEventListener('change', () => {
          // A website name (hostname) is not a journal/book title: clear it when leaving "web page"
          const newKind = kind(typeSel.value);
          if (lastKind === 'webpage' && newKind !== 'webpage') {
            let host = '';
            try {
              host = new URL(node.url).hostname.replace(/^www\./, '');
            } catch {
              /* ignore */
            }
            const c = inputs['container-title'];
            if (c && host && c.value.trim().replace(/^www\./, '') === host) c.value = '';
          }
          lastKind = newKind;
          applyVisibility();
          updatePreview();
        });
        form.addEventListener('submit', e => e.preventDefault());

        fetchBtn.addEventListener('click', async () => {
          const doi = (inputs.DOI.value || '').trim();
          if (!doi) {
            flash('Enter a DOI first', true);
            inputs.DOI.focus();
            return;
          }
          const A = api();
          if (!A) {
            flash('DOI lookup unavailable', true);
            return;
          }
          fetchBtn.disabled = true;
          const prev = fetchBtn.textContent;
          fetchBtn.textContent = 'Fetching…';
          try {
            const enriched = await A.enrichFromDoi(doi);
            item = S.mergeCitation(read(), enriched);
            fill(item);
            updatePreview();
            flash('Details filled in from DOI');
          } catch (e: any) {
            flash((e && e.message) || 'Lookup failed', true);
          } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = prev;
          }
        });

        readBtn.addEventListener('click', async () => {
          const A = api();
          readBtn.disabled = true;
          try {
            const extracted = A ? await A.extractFromOpenTab(node.url) : null;
            if (!extracted) {
              flash('Open the page in a tab first', true);
              return;
            }
            item = S.mergeCitation(read(), extracted);
            fill(item);
            updatePreview();
            flash('Read from page');
          } finally {
            readBtn.disabled = false;
          }
        });

        cancelBtn.addEventListener('click', () => this.close(null));
        saveBtn.addEventListener('click', async () => {
          const out = read();
          if (!out.title) {
            flash('A title is required', true);
            inputs.title.focus();
            return;
          }
          out.source = 'manual';
          delete (out as any).id;
          saveBtn.disabled = true;
          try {
            await save(nodeId, out);
            this.close(out);
          } catch (e: any) {
            saveBtn.disabled = false;
            flash((e && e.message) || 'Could not save', true);
          }
        });

        this.onKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.close(null);
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveBtn.click();
          }
        };
        document.addEventListener('keydown', this.onKey);

        fill(item);
        updatePreview();
        document.body.appendChild(m.overlay);
        (inputs.title as HTMLInputElement).focus();
      });
    }
  }
}

(function exposeCitationEditor() {
  if (typeof window === 'undefined') return;
  const w: any = window;
  w.CitationLinker = w.CitationLinker || {};
  w.CitationLinker.CitationEditor = ClinkerCitationEditor.CitationEditor;
  w.CitationLinker.citationEditor = new ClinkerCitationEditor.CitationEditor();
  w.citationEditor = w.CitationLinker.citationEditor;
})();
