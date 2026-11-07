// tabBar.ts - Tab bar UI component
//
// All listeners are delegated to the persistent tabs wrapper (attached once in
// initialize), so re-rendering never duplicates handlers.
//   click        -> switch tab (no re-render when the tab is already active, so
//                   the second click of a double-click lands on the same element)
//   dblclick     -> inline rename
//   × button     -> close tab (with confirmation); never starts a drag
//   drag a tab   -> reorder; the new order is persisted via tabService.reorderTabs
//   drop a tree node on a tab -> move that citation (and its subtree) to the tab

// Initialize global namespace if it doesn't exist
if (typeof window !== 'undefined') {
  (window as any).CitationLinker = (window as any).CitationLinker || {};
}

const DEFAULT_TAB_ID = 'general-tab';

class TabBar {
  private container: HTMLElement | null;
  private tabsWrapper: HTMLElement | null;
  private initialized: boolean;
  private draggedTab: HTMLElement | null;
  private draggedTabId: string | null;
  private renaming: boolean;
  private lastRenderKey: string | null;
  private pointerDownTarget: Element | null;

  constructor() {
    this.container = null;
    this.tabsWrapper = null;
    this.initialized = false;
    this.draggedTab = null;
    this.draggedTabId = null;
    this.renaming = false;
    this.lastRenderKey = null;
    this.pointerDownTarget = null;
  }

  private getTabService(): any {
    return (window as any).CitationLinker?.tabService;
  }

  private icon(name: string): Element {
    const make = (window as any).clinkerIcon;
    if (typeof make === 'function') return make(name);
    const span = document.createElement('span');
    span.textContent = name === 'plus' ? '+' : name === 'x' ? '×' : '';
    return span;
  }

  // Initialize the tab bar
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.container = document.createElement('div');
    this.container.className = 'tabs-container';
    this.container.id = 'tabsContainer';

    this.tabsWrapper = document.createElement('div');
    this.tabsWrapper.className = 'tabs-wrapper';
    this.tabsWrapper.setAttribute('role', 'tablist');
    this.container.appendChild(this.tabsWrapper);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'icon-button tab-add-button';
    addButton.title = 'Add new tab';
    addButton.setAttribute('aria-label', 'Add new tab');
    addButton.appendChild(this.icon('plus'));
    addButton.addEventListener('click', () => this.handleAddTab());
    this.container.appendChild(addButton);

    this.setupDelegatedListeners(this.tabsWrapper);

    const tabBarContainer = document.getElementById('tab-bar-container');
    if (tabBarContainer) {
      tabBarContainer.appendChild(this.container);
    }

    await this.render(true);
  }

  // Render all tabs
  async render(force: boolean = false): Promise<void> {
    if (!this.tabsWrapper) return;
    // Don't destroy an in-progress rename or an active tab drag
    if (this.renaming || this.draggedTabId) return;

    const tabService = this.getTabService();
    if (!tabService) return;
    const tabs = await tabService.getTabsForDisplay();
    const activeTabId = await tabService.getActiveTabId();

    const key = JSON.stringify([activeTabId, tabs.map((t: CitationLinker.Tab) => [t.id, t.title])]);
    if (!force && key === this.lastRenderKey && this.tabsWrapper.childElementCount > 0) return;
    this.lastRenderKey = key;

    this.tabsWrapper.innerHTML = '';
    tabs.forEach((tab: CitationLinker.Tab) => {
      this.tabsWrapper!.appendChild(this.createTabElement(tab, tab.id === activeTabId, tabs.length > 1));
    });
  }

  // Create a tab element (no listeners: they are delegated)
  private createTabElement(tab: CitationLinker.Tab, isActive: boolean, closable: boolean): HTMLElement {
    const tabElement = document.createElement('div');
    tabElement.className = isActive ? 'tab active' : 'tab';
    tabElement.dataset.tabId = tab.id;
    tabElement.draggable = true;
    tabElement.tabIndex = 0;
    tabElement.setAttribute('role', 'tab');
    tabElement.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tabElement.title = `${tab.title} — double-click to rename`;

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.title;
    tabElement.appendChild(label);

    if (closable && tab.id !== DEFAULT_TAB_ID) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tab-close';
      close.draggable = false;
      close.tabIndex = -1;
      close.title = 'Close tab';
      close.setAttribute('aria-label', `Close tab ${tab.title}`);
      close.appendChild(this.icon('x'));
      tabElement.appendChild(close);
    }

    return tabElement;
  }

  private tabFromEvent(e: Event): HTMLElement | null {
    const t = e.target as Node | null;
    const el = t && (t.nodeType === 1 ? (t as Element) : t.parentElement);
    const tab = el?.closest('.tab') as HTMLElement | null;
    return tab && this.tabsWrapper?.contains(tab) ? tab : null;
  }

  private setupDelegatedListeners(wrapper: HTMLElement): void {
    wrapper.addEventListener('mousedown', (e) => {
      this.pointerDownTarget = e.target as Element;
    }, true);

    wrapper.addEventListener('click', (e) => {
      const tab = this.tabFromEvent(e);
      if (!tab || this.renaming) return;
      const target = e.target as Element;
      if (target.closest('.tab-close')) {
        e.stopPropagation();
        this.handleTabClose(tab.dataset.tabId!);
        return;
      }
      if (target.closest('.tab-rename-input')) return;
      this.handleTabClick(tab.dataset.tabId!);
    });

    wrapper.addEventListener('dblclick', (e) => {
      const tab = this.tabFromEvent(e);
      if (!tab || (e.target as Element).closest('.tab-close, .tab-rename-input')) return;
      e.preventDefault();
      this.handleTabDoubleClick(tab.dataset.tabId!);
    });

    wrapper.addEventListener('keydown', (e) => {
      const tab = this.tabFromEvent(e);
      if (!tab || e.target !== tab) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handleTabClick(tab.dataset.tabId!);
      } else if (e.key === 'F2') {
        e.preventDefault();
        this.handleTabDoubleClick(tab.dataset.tabId!);
      }
    });

    wrapper.addEventListener('contextmenu', async (e) => {
      const tab = this.tabFromEvent(e);
      if (!tab) return;
      e.preventDefault();
      const tabData = await this.getTabService()?.getTab(tab.dataset.tabId!);
      if (tabData) this.handleTabContextMenu(e, tabData);
    });

    wrapper.addEventListener('dragstart', (e) => this.handleTabDragStart(e));
    wrapper.addEventListener('dragover', (e) => this.handleDragOver(e));
    wrapper.addEventListener('dragleave', (e) => {
      const tab = this.tabFromEvent(e);
      if (tab && !tab.contains(e.relatedTarget as Node)) tab.classList.remove('drag-over');
    });
    wrapper.addEventListener('drop', (e) => this.handleDrop(e));
    wrapper.addEventListener('dragend', () => this.handleTabDragEnd());
  }

  // Handle tab click
  private async handleTabClick(tabId: string): Promise<void> {
    const tabService = this.getTabService();
    if (!tabService) {
      console.error('TabService not available');
      return;
    }

    const activeId = await tabService.getActiveTabId();
    if (activeId === tabId) return; // already active: nothing to do

    await tabService.setActiveTab(tabId);
    await this.render();
    await this.refreshTree();
  }

  // Handle tab close
  private async handleTabClose(tabId: string): Promise<void> {
    const tabService = this.getTabService();
    const tab = await tabService.getTab(tabId);
    if (!tab) return;

    const count = (tab.treeData?.nodes || []).filter((n: any) => !n.deleted).length;
    const message = count > 0
      ? `Close the tab "${tab.title}"? Its ${count} citation${count === 1 ? '' : 's'} will be permanently deleted.`
      : `Close the tab "${tab.title}"?`;

    if (confirm(message)) {
      await tabService.deleteTab(tabId);
      await this.render();
      await this.refreshTree();
    }
  }

  // Handle tab double click for rename
  private async handleTabDoubleClick(tabId: string): Promise<void> {
    if (this.renaming) return;
    const tabService = this.getTabService();
    const tab = await tabService.getTab(tabId);
    if (!tab) return;

    const tabElement = this.tabsWrapper?.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement | null;
    if (!tabElement) return;

    const label = tabElement.querySelector('.tab-label') as HTMLElement;
    if (!label) return;

    this.renaming = true;
    tabElement.draggable = false; // allow selecting text in the input

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = tab.title;
    input.setAttribute('aria-label', 'Tab name');
    input.style.width = `${Math.max(label.offsetWidth + 16, 80)}px`;

    label.style.display = 'none';
    tabElement.insertBefore(input, label.nextSibling);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save: boolean) => {
      if (done) return;
      done = true;
      const newTitle = input.value.trim();
      input.remove();
      label.style.display = '';
      tabElement.draggable = true;
      this.renaming = false;
      if (save && newTitle && newTitle !== tab.title) {
        label.textContent = newTitle;
        await tabService.renameTab(tabId, newTitle);
      }
      await this.render(true);
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    // keep clicks inside the input from switching tabs
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // Handle tab context menu
  private handleTabContextMenu(e: MouseEvent, tab: CitationLinker.Tab): void {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu tab-context-menu';
    menu.setAttribute('role', 'menu');

    const addItem = (label: string, action: () => void, danger = false) => {
      const item = document.createElement('div');
      item.className = danger ? 'context-menu-item danger' : 'context-menu-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      item.addEventListener('click', () => {
        menu.remove();
        cleanup();
        action();
      });
      menu.appendChild(item);
    };

    addItem('Rename Tab', () => this.handleTabDoubleClick(tab.id));
    if (tab.id !== DEFAULT_TAB_ID) {
      addItem('Delete Tab', () => this.handleTabClose(tab.id), true);
    }

    document.body.appendChild(menu);
    const x = Math.max(4, Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 4));
    const y = Math.max(4, Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 4));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const removeMenu = (ev: Event) => {
      if (ev.type === 'keydown' && (ev as KeyboardEvent).key !== 'Escape') return;
      if (ev.type === 'click' && menu.contains(ev.target as Node)) return;
      menu.remove();
      cleanup();
    };
    const cleanup = () => {
      document.removeEventListener('click', removeMenu);
      document.removeEventListener('keydown', removeMenu);
    };
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
      document.addEventListener('keydown', removeMenu);
    }, 0);
  }

  // Handle add tab
  private async handleAddTab(): Promise<void> {
    const title = prompt('Name for the new tab:');
    if (!title || !title.trim()) return;

    const tabService = this.getTabService();
    await tabService.createTab(title.trim());
    await this.render(true);
    await this.refreshTree();
  }

  // ---- drag and drop ---------------------------------------------------------

  private handleTabDragStart(e: DragEvent): void {
    const tab = this.tabFromEvent(e);
    if (!tab || this.renaming) {
      e.preventDefault();
      return;
    }
    const downOn = this.pointerDownTarget;
    if (downOn && tab.contains(downOn) && downOn.closest('.tab-close, .tab-rename-input')) {
      e.preventDefault();
      return;
    }
    this.draggedTab = tab;
    this.draggedTabId = tab.dataset.tabId!;
    tab.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `tab:${this.draggedTabId}`);
    }
  }

  private handleTabDragEnd(): void {
    const wasDragging = !!this.draggedTabId;
    if (this.draggedTab) {
      this.draggedTab.classList.remove('dragging');
    }
    this.draggedTab = null;
    this.draggedTabId = null;
    this.tabsWrapper?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    // A cancelled drag leaves the DOM in preview order: restore the real order
    if (wasDragging) this.render(true);
  }

  private handleDragOver(e: DragEvent): void {
    // Reordering tabs
    if (this.draggedTab) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const afterElement = this.getDragAfterElement(e.clientX);
      if (afterElement == null) {
        if (this.tabsWrapper!.lastElementChild !== this.draggedTab) {
          this.tabsWrapper!.appendChild(this.draggedTab);
        }
      } else if (afterElement !== this.draggedTab.nextElementSibling) {
        this.tabsWrapper!.insertBefore(this.draggedTab, afterElement);
      }
      return;
    }

    // A tree node dragged over a (different) tab: offer to move it there
    const nodeId = (window as any).currentDraggedNodeId;
    const tab = this.tabFromEvent(e);
    if (nodeId != null && tab && !tab.classList.contains('active')) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      this.tabsWrapper!.querySelectorAll('.tab.drag-over').forEach(el => { if (el !== tab) el.classList.remove('drag-over'); });
      tab.classList.add('drag-over');
    }
  }

  private async handleDrop(e: DragEvent): Promise<void> {
    if (this.draggedTabId) {
      e.preventDefault();
      const order = Array.from(this.tabsWrapper!.querySelectorAll('.tab'))
        .map(el => (el as HTMLElement).dataset.tabId!)
        .filter(Boolean);
      this.draggedTab?.classList.remove('dragging');
      this.draggedTab = null;
      this.draggedTabId = null;
      await this.getTabService().reorderTabs(order);
      await this.render(true);
      return;
    }

    const tab = this.tabFromEvent(e);
    const dragState = (window as any).currentDragState;
    const nodeId = (window as any).currentDraggedNodeId;
    if (!tab || nodeId == null) return;
    e.preventDefault();
    tab.classList.remove('drag-over');

    const tabService = this.getTabService();
    const sourceTabId = dragState?.sourceTabId || await tabService.getActiveTabId();
    const targetTabId = tab.dataset.tabId!;
    if (sourceTabId === targetTabId) return;

    const moved = await tabService.moveNodeToTab(nodeId, sourceTabId, targetTabId);
    if (moved) {
      if ((window as any).syncInitialized && (window as any).authManager?.isLoggedIn()) {
        (window as any).syncManager.markAsModified();
      }
      await this.refreshTree();
    }
  }

  private getDragAfterElement(x: number): Element | null {
    const draggableElements = Array.from(this.tabsWrapper!.querySelectorAll('.tab:not(.dragging)'));

    return draggableElements.reduce((closest: { offset: number; element: Element | null }, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  // Helper method to refresh tree
  private async refreshTree(): Promise<void> {
    const treeContainer = (window as any).CitationLinker?.treeContainer || (window as any).treeContainer;
    if (treeContainer && treeContainer.refresh) {
      await treeContainer.refresh();
    }
  }

  // Refresh the tab bar
  async refresh(): Promise<void> {
    await this.render();
  }
}

// Attach to global namespace
if (typeof window !== 'undefined') {
  (window as any).CitationLinker.TabBar = TabBar;
  (window as any).CitationLinker.tabBar = new TabBar();
}
