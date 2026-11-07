// exportDialog.ts - "Export references" / "Cite" dialog.
//
// Usage (sidebar):
//   window.CitationLinker.exportDialog.open({ scope: 'tab' })                 // header Export button
//   window.CitationLinker.exportDialog.open({ scope: 'node', nodeId: 12 })    // node "Cite…"
//   window.CitationLinker.exportDialog.open({ scope: 'subtree', nodeId: 12 })
//
// Requires dist/citationMetadata.js and dist/services/citationService.js. Reads tabs via
// CitationLinker.tabService (or storage.local 'tabsData'). Preferences persist in
// storage.local 'citationExportPrefs'.

namespace ClinkerExportDialog {
  type Scope = 'node' | 'subtree' | 'tab' | 'all';
  type FormatId = 'apa' | 'mla' | 'chicago-ad' | 'chicago-nb' | 'harvard' | 'ieee' | 'bibtex' | 'ris' | 'csl-json';

  export interface OpenOptions {
    scope?: Scope;
    nodeId?: number | null;
    tabId?: string | null;
    format?: FormatId;
    /** Test hook: supply tabs data instead of reading storage. */
    getTabsData?: () => Promise<any>;
  }

  interface Prefs {
    format: FormatId;
    fileType: 'txt' | 'html';
    includeQuotes: boolean;
  }

  const PREFS_KEY = 'citationExportPrefs';
  const DEFAULT_PREFS: Prefs = { format: 'apa', fileType: 'txt', includeQuotes: false };
  const FILE_FORMATS: Array<{ id: FormatId; label: string }> = [
    { id: 'bibtex', label: 'BibTeX (.bib)' },
    { id: 'ris', label: 'RIS (.ris) – Zotero, Mendeley, EndNote' },
    { id: 'csl-json', label: 'CSL-JSON (.json)' }
  ];

  const svc = (): any => (window as any).CitationLinker?.citationService;

  export function icon(name: string): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.appendChild(use);
    return svg;
  }

  export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  export async function storageGet(key: string): Promise<any> {
    try {
      const b: any = typeof browser !== 'undefined' ? browser : null;
      if (!b || !b.storage) return undefined;
      const r = await b.storage.local.get(key);
      return r ? r[key] : undefined;
    } catch {
      return undefined;
    }
  }

  export async function storageSet(items: Record<string, any>): Promise<void> {
    try {
      const b: any = typeof browser !== 'undefined' ? browser : null;
      if (b && b.storage) await b.storage.local.set(items);
    } catch {
      /* ignore */
    }
  }

  export async function loadTabsData(): Promise<any> {
    const ts = (window as any).CitationLinker?.tabService;
    if (ts && typeof ts.getTabs === 'function') {
      try {
        return await ts.getTabs();
      } catch {
        /* fall through */
      }
    }
    return (await storageGet('tabsData')) || { tabs: [], activeTabId: null };
  }

  /** Copy rich HTML + plain text. Falls back to plain text, then to execCommand. */
  export async function copyToClipboard(text: string, html?: string): Promise<boolean> {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    const CI: any = (window as any).ClipboardItem;
    if (html && nav && nav.clipboard && typeof nav.clipboard.write === 'function' && CI) {
      try {
        await nav.clipboard.write([
          new CI({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })
        ]);
        return true;
      } catch {
        /* fall through */
      }
    }
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        await nav.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through */
      }
    }
    // Legacy path: select a hidden element and execCommand('copy') (keeps formatting when html given)
    try {
      const holder = document.createElement('div');
      holder.setAttribute('contenteditable', 'true');
      holder.style.position = 'fixed';
      holder.style.left = '-9999px';
      holder.style.whiteSpace = 'pre-wrap';
      if (html) holder.innerHTML = html;
      else holder.textContent = text;
      document.body.appendChild(holder);
      const range = document.createRange();
      range.selectNodeContents(holder);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      sel?.removeAllRanges();
      holder.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  /** Save a file: browser.downloads when the permission exists, else a blob <a download>. */
  export async function downloadFile(filename: string, content: string, mime: string): Promise<void> {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const b: any = typeof browser !== 'undefined' ? browser : null;
    try {
      if (b && b.downloads && typeof b.downloads.download === 'function') {
        await b.downloads.download({ url, filename, saveAs: true });
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
    } catch {
      /* fall back to the anchor */
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function slug(s: string): string {
    return (
      (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'references'
    );
  }

  /** Accessible modal shell shared with the citation editor. */
  export function createModal(titleText: string, className: string, onClose: () => void) {
    const overlay = el('div', `cite-modal ${className}`);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', titleText);
    const panel = el('div', 'cite-modal-content');
    const header = el('div', 'cite-modal-header');
    const h = el('h3', undefined, titleText);
    const close = el('button', 'icon-button modal-close');
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.appendChild(icon('x'));
    close.addEventListener('click', onClose);
    header.append(h, close);
    const body = el('div', 'cite-modal-body');
    const footer = el('div', 'cite-modal-footer');
    panel.append(header, body, footer);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) onClose();
    });
    return { overlay, panel, header, body, footer, title: h };
  }

  export function field(label: string, control: HTMLElement, className = ''): HTMLElement {
    const wrap = el('label', `cite-field ${className}`.trim());
    const span = el('span', 'cite-field-label', label);
    wrap.append(span, control);
    return wrap;
  }

  export class ExportDialog {
    private overlay: HTMLElement | null = null;
    private onKey: ((e: KeyboardEvent) => void) | null = null;

    isOpen(): boolean {
      return !!this.overlay;
    }

    close(): void {
      if (this.onKey) document.removeEventListener('keydown', this.onKey);
      this.onKey = null;
      this.overlay?.remove();
      this.overlay = null;
    }

    async open(options: OpenOptions = {}): Promise<void> {
      this.close();
      const S = svc();
      if (!S) {
        console.error('citationService not loaded');
        return;
      }
      const tabsData = await (options.getTabsData ? options.getTabsData() : loadTabsData());
      const stored = (await storageGet(PREFS_KEY)) || {};
      const prefs: Prefs = { ...DEFAULT_PREFS, ...stored };
      if (options.format) prefs.format = options.format;

      const hasNode = options.nodeId !== undefined && options.nodeId !== null;
      let scope: Scope = options.scope || (hasNode ? 'node' : 'tab');
      if (!hasNode && (scope === 'node' || scope === 'subtree')) scope = 'tab';
      const tabId = options.tabId || tabsData.activeTabId || (tabsData.tabs[0] && tabsData.tabs[0].id);
      const tab = (tabsData.tabs || []).find((t: any) => t.id === tabId);
      const node = hasNode
        ? (tabsData.tabs || []).flatMap((t: any) => t.treeData?.nodes || []).find((n: any) => n.id === options.nodeId)
        : null;
      const hasChildren = !!(node && (node.children || []).length);

      const m = createModal(hasNode && scope !== 'tab' && scope !== 'all' ? 'Cite' : 'Export references', 'export-modal', () => this.close());
      this.overlay = m.overlay;

      // --- Controls ---------------------------------------------------------
      const controls = el('div', 'cite-controls');

      const scopeSel = el('select', 'cite-select');
      scopeSel.id = 'exportScope';
      const addOpt = (sel: HTMLSelectElement | HTMLOptGroupElement, value: string, label: string) => {
        const o = el('option', undefined, label);
        o.value = value;
        sel.appendChild(o);
        return o;
      };
      if (hasNode) {
        addOpt(scopeSel, 'node', 'This citation');
        if (hasChildren) addOpt(scopeSel, 'subtree', 'This citation + nested');
      }
      addOpt(scopeSel, 'tab', `Project: ${tab ? tab.title : 'current'}`);
      if ((tabsData.tabs || []).length > 1) addOpt(scopeSel, 'all', `All projects (${tabsData.tabs.length})`);
      if (scope === 'subtree' && !hasChildren) scope = 'node';
      scopeSel.value = scope;

      const formatSel = el('select', 'cite-select');
      formatSel.id = 'exportFormat';
      const g1 = el('optgroup');
      g1.label = 'Bibliography style';
      S.STYLES.forEach((s: any) => addOpt(g1, s.id, s.label));
      const g2 = el('optgroup');
      g2.label = 'Reference manager file';
      FILE_FORMATS.forEach(f => addOpt(g2, f.id, f.label));
      formatSel.append(g1, g2);
      formatSel.value = prefs.format;
      if (formatSel.value !== prefs.format) formatSel.value = 'apa';

      const quotesBox = el('input') as HTMLInputElement;
      quotesBox.type = 'checkbox';
      quotesBox.id = 'exportIncludeQuotes';
      quotesBox.checked = prefs.includeQuotes;
      const quotesLabel = el('label', 'cite-check');
      quotesLabel.append(quotesBox, document.createTextNode(' Include highlights & notes'));

      controls.append(field('Scope', scopeSel), field('Format', formatSel), quotesLabel);

      // --- Preview ------------------------------------------------------------
      const summary = el('div', 'cite-summary');
      summary.setAttribute('aria-live', 'polite');
      const inText = el('div', 'cite-intext');
      const preview = el('div', 'cite-preview');
      preview.tabIndex = 0;
      preview.setAttribute('aria-label', 'Preview');

      m.body.append(controls, summary, inText, preview);

      // --- Footer -------------------------------------------------------------
      const status = el('span', 'cite-status');
      status.setAttribute('aria-live', 'polite');
      const fileTypeSel = el('select', 'cite-select cite-select-compact');
      fileTypeSel.title = 'File type';
      addOpt(fileTypeSel, 'txt', '.txt');
      addOpt(fileTypeSel, 'html', '.html');
      fileTypeSel.value = prefs.fileType;
      const copyBtn = el('button', 'button button-ghost');
      copyBtn.type = 'button';
      copyBtn.id = 'exportCopyBtn';
      copyBtn.append(icon('copy'), document.createTextNode(' Copy'));
      const dlBtn = el('button', 'button button-primary');
      dlBtn.type = 'button';
      dlBtn.id = 'exportDownloadBtn';
      dlBtn.append(icon('download'), document.createTextNode(' Download'));
      const actions = el('div', 'cite-actions');
      actions.append(fileTypeSel, copyBtn, dlBtn);
      m.footer.append(status, actions);

      // --- Logic --------------------------------------------------------------
      let current: { text: string; plain: string; html?: string; extension: string; mime: string; count: number } | null = null;

      const isStyle = (f: string) => S.STYLES.some((s: any) => s.id === f);

      const render = () => {
        const format = formatSel.value as FormatId;
        const sc = scopeSel.value as Scope;
        const nodes = S.collectNodes(tabsData, sc, { nodeId: options.nodeId, tabId });
        const entries = S.dedupeEntries(S.entriesFromNodes(nodes));
        const opts = { includeQuotes: quotesBox.checked };
        fileTypeSel.style.display = isStyle(format) ? '' : 'none';
        const fallbackCount = entries.filter((e: any) => e.item.source === 'fallback').length;

        if (!entries.length) {
          current = null;
          preview.className = 'cite-preview empty';
          preview.textContent = 'Nothing to export yet — save some highlights first.';
          summary.textContent = '';
          inText.textContent = '';
          copyBtn.disabled = true;
          dlBtn.disabled = true;
          return;
        }
        copyBtn.disabled = false;
        dlBtn.disabled = false;
        const sources = entries.length === 1 ? '1 source' : `${entries.length} sources`;
        const hl = nodes.length === 1 ? '1 highlight' : `${nodes.length} highlights`;
        summary.textContent =
          `${sources} from ${hl}` + (fallbackCount ? ` · ${fallbackCount} without metadata (edit via right-click › Edit citation…)` : '');

        if (isStyle(format)) {
          const res = S.exportEntries(entries, fileTypeSel.value === 'html' ? 'html' : 'text', format, opts);
          const plain = S.formatBibliography(entries, format, 'text', opts);
          current = { text: res.text, plain, html: res.html, extension: res.extension, mime: res.mime, count: entries.length };
          preview.className = 'cite-preview cite-preview-rich';
          preview.innerHTML = res.html || ''; // built from escaped text by citationService
          if (entries.length === 1) {
            inText.textContent = '';
            const label = el('span', 'cite-intext-label', 'In-text: ');
            const code = el('span', 'cite-intext-value', S.formatInText(entries[0].item, format, 1));
            const copyIn = el('button', 'icon-button cite-intext-copy');
            copyIn.type = 'button';
            copyIn.title = 'Copy in-text citation';
            copyIn.setAttribute('aria-label', 'Copy in-text citation');
            copyIn.appendChild(icon('copy'));
            copyIn.addEventListener('click', async () => {
              const ok = await copyToClipboard(code.textContent || '');
              flash(ok ? 'In-text citation copied' : 'Copy failed');
            });
            inText.append(label, code, copyIn);
            inText.style.display = '';
          } else {
            inText.textContent = '';
            inText.style.display = 'none';
          }
        } else {
          const res = S.exportEntries(entries, format, 'apa', opts);
          current = { text: res.text, plain: res.text, extension: res.extension, mime: res.mime, count: entries.length };
          preview.className = 'cite-preview cite-preview-code';
          preview.textContent = res.text.replace(/\r\n/g, '\n');
          inText.textContent = '';
          inText.style.display = 'none';
        }
      };

      let flashTimer: any = null;
      const flash = (msg: string) => {
        status.textContent = msg;
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => (status.textContent = ''), 2500);
      };

      const savePrefs = () => {
        storageSet({
          [PREFS_KEY]: { format: formatSel.value, fileType: fileTypeSel.value, includeQuotes: quotesBox.checked } as Prefs
        });
      };

      [scopeSel, formatSel, fileTypeSel].forEach(s =>
        s.addEventListener('change', () => {
          render();
          savePrefs();
        })
      );
      quotesBox.addEventListener('change', () => {
        render();
        savePrefs();
      });

      copyBtn.addEventListener('click', async () => {
        if (!current) return;
        // Styles: rich HTML + plain text bibliography; files: the file text.
        const ok = await copyToClipboard(current.plain, current.html);
        flash(ok ? `Copied ${current.count === 1 ? '1 reference' : `${current.count} references`}` : 'Copy failed');
      });

      dlBtn.addEventListener('click', async () => {
        if (!current) return;
        const sc = scopeSel.value as Scope;
        const base =
          sc === 'all' ? 'clinker-all-projects' : sc === 'tab' ? `clinker-${slug(tab ? tab.title : 'project')}` : `clinker-${slug(node ? (node.citation?.title || node.title || '') : '')}`;
        const date = new Date().toISOString().slice(0, 10);
        try {
          await downloadFile(`${base}-${date}.${current.extension}`, current.text, current.mime);
          flash('Download started');
        } catch (e) {
          console.error('Download failed', e);
          flash('Download failed');
        }
      });

      this.onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      };
      document.addEventListener('keydown', this.onKey);

      render();
      document.body.appendChild(m.overlay);
      formatSel.focus();
    }
  }
}

(function exposeExportDialog() {
  if (typeof window === 'undefined') return;
  const w: any = window;
  w.CitationLinker = w.CitationLinker || {};
  w.CitationLinker.ExportDialog = ClinkerExportDialog.ExportDialog;
  w.CitationLinker.exportDialog = new ClinkerExportDialog.ExportDialog();
  w.CitationLinker.citeUi = ClinkerExportDialog; // shared helpers (modal shell, clipboard, download)
  w.exportDialog = w.CitationLinker.exportDialog;
})();
