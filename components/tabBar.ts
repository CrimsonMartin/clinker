// tabBar.ts - Tab bar UI component

// Initialize global namespace if it doesn't exist
if (typeof window !== 'undefined') {
  (window as any).CitationLinker = (window as any).CitationLinker || {};
}

class TabBar {
  private container: HTMLElement | null;
  private tabsWrapper: HTMLElement | null;
  private initialized: boolean;
  private draggedTab: HTMLElement | null;
  private draggedTabId: string | null;

  constructor() {
    this.container = null;
    this.tabsWrapper = null;
    this.initialized = false;
    this.draggedTab = null;
    this.draggedTabId = null;
  }

  // Initialize the tab bar
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create tab bar container
    this.container = document.createElement('div');
    this.container.className = 'tabs-container';
    this.container.id = 'tabsContainer';

    // Create tabs wrapper
    this.tabsWrapper = document.createElement('div');
    this.tabsWrapper.className = 'tabs-wrapper';
    this.container.appendChild(this.tabsWrapper);

    // Create add button
    const addButton = document.createElement('button');
    addButton.className = 'tab-add-button';
    addButton.innerHTML = '+';
    addButton.title = 'Add new tab';
    addButton.addEventListener('click', () => this.handleAddTab());
    this.container.appendChild(addButton);

    // Insert into the tab bar container in the HTML
    const tabBarContainer = document.getElementById('tab-bar-container');
    if (tabBarContainer) {
      tabBarContainer.appendChild(this.container);
    }

    this.initialized = true;
    await this.render();
  }

  // Render all tabs
  async render(): Promise<void> {
    if (!this.tabsWrapper) return;

    const tabService = (window as any).CitationLinker.tabService;
    const tabs = await tabService.getTabsForDisplay();
    const activeTabId = await tabService.getActiveTabId();

    // Clear existing tabs
    this.tabsWrapper.innerHTML = '';

    // Render each tab
    tabs.forEach((tab: CitationLinker.Tab, index: number) => {
      const tabElement = this.createTabElement(tab, tab.id === activeTabId);
      this.tabsWrapper!.appendChild(tabElement);
    });
  }

  // Create a tab element
  private createTabElement(tab: CitationLinker.Tab, isActive: boolean): HTMLElement {
    const tabElement = document.createElement('div');
    tabElement.className = `tab ${isActive ? 'active' : ''}`;
    tabElement.dataset.tabId = tab.id;
    tabElement.draggable = true;

    // Tab label
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.title;
    tabElement.appendChild(label);

    // Event listeners
    tabElement.addEventListener('click', () => this.handleTabClick(tab.id));
    tabElement.addEventListener('dblclick', () => this.handleTabDoubleClick(tab.id));
    tabElement.addEventListener('contextmenu', (e) => this.handleTabContextMenu(e, tab));

    // Drag and drop for reordering
    tabElement.addEventListener('dragstart', (e) => this.handleTabDragStart(e, tab.id));
    tabElement.addEventListener('dragend', () => this.handleTabDragEnd());
    tabElement.addEventListener('dragover', (e) => this.handleTabDragOver(e));
    tabElement.addEventListener('drop', (e) => this.handleTabDrop(e));

    return tabElement;
  }

  // Handle tab click
  private async handleTabClick(tabId: string): Promise<void> {
    const tabService = (window as any).CitationLinker.tabService;
    await tabService.setActiveTab(tabId);
    await this.render();
    
    // Trigger tree reload
    const treeContainer = (window as any).CitationLinker.treeContainer;
    if (treeContainer && treeContainer.refresh) {
      await treeContainer.refresh();
    }
    
    // Also trigger the legacy tree reload if it exists
    if (typeof (window as any).loadTree === 'function') {
      const activeTab = await tabService.getActiveTab();
      if (activeTab) {
        (window as any).loadTree(activeTab.treeData.nodes);
      }
    }
  }

  // Handle tab close
  private async handleTabClose(tabId: string): Promise<void> {
    const tabService = (window as any).CitationLinker.tabService;
    const tab = await tabService.getTab(tabId);
    if (!tab) return;

    if (confirm(`Are you sure you want to close the tab "${tab.title}"? All citations in this tab will be permanently deleted.`)) {
      await tabService.deleteTab(tabId);
      await this.render();
      
      // Refresh tree
      await this.refreshTree();
    }
  }

  // Handle tab double click for rename
  private async handleTabDoubleClick(tabId: string): Promise<void> {
    const tabService = (window as any).CitationLinker.tabService;
    const tab = await tabService.getTab(tabId);
    if (!tab) return;

    const tabElement = this.tabsWrapper?.querySelector(`[data-tab-id="${tabId}"]`);
    if (!tabElement) return;

    const label = tabElement.querySelector('.tab-label') as HTMLElement;
    if (!label) return;

    // Create input for inline editing
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = tab.title;
    input.style.width = `${Math.max(label.offsetWidth, 100)}px`;

    // Replace label with input
    label.style.display = 'none';
    tabElement.appendChild(input);
    input.focus();
    input.select();

    // Handle save
    const saveRename = async () => {
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== tab.title) {
        await tabService.renameTab(tabId, newTitle);
        await this.render();
      } else {
        label.style.display = '';
        input.remove();
      }
    };

    // Event listeners
    input.addEventListener('blur', saveRename);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRename();
      } else if (e.key === 'Escape') {
        label.style.display = '';
        input.remove();
      }
    });
  }

  // Handle tab context menu
  private handleTabContextMenu(e: MouseEvent, tab: CitationLinker.Tab): void {
    e.preventDefault();

    // Remove any existing context menu
    const existingMenu = document.querySelector('.tab-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'context-menu tab-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.zIndex = '10000';

    // Rename option
    const renameItem = document.createElement('div');
    renameItem.className = 'context-menu-item';
    renameItem.textContent = 'Rename Tab';
    renameItem.addEventListener('click', () => {
      menu.remove();
      this.handleTabDoubleClick(tab.id);
    });
    menu.appendChild(renameItem);

    // Delete option (not for default tab)
    if (tab.id !== 'general-tab') {
      const deleteItem = document.createElement('div');
      deleteItem.className = 'context-menu-item';
      deleteItem.textContent = 'Delete Tab';
      deleteItem.addEventListener('click', async () => {
        menu.remove();
        await this.handleTabClose(tab.id);
      });
      menu.appendChild(deleteItem);
    }

    document.body.appendChild(menu);

    // Remove menu on click outside
    const removeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', removeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', removeMenu), 0);
  }

  // Handle add tab
  private async handleAddTab(): Promise<void> {
    const title = prompt('Enter name for new tab:');
    if (!title || !title.trim()) return;

    const tabService = (window as any).CitationLinker.tabService;
    await tabService.createTab(title.trim());
    await this.render();

    // Refresh tree
    await this.refreshTree();
  }

  // Tab drag and drop for reordering
  private handleTabDragStart(e: DragEvent, tabId: string): void {
    this.draggedTab = e.target as HTMLElement;
    this.draggedTabId = tabId;
    this.draggedTab.classList.add('dragging');
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', tabId);
  }

  private handleTabDragEnd(): void {
    if (this.draggedTab) {
      this.draggedTab.classList.remove('dragging');
      this.draggedTab = null;
      this.draggedTabId = null;
    }
  }

  private handleTabDragOver(e: DragEvent): void {
    if (!this.draggedTab) return;
    e.preventDefault();
    
    const afterElement = this.getDragAfterElement(e.clientX);
    if (afterElement == null) {
      this.tabsWrapper!.appendChild(this.draggedTab);
    } else {
      this.tabsWrapper!.insertBefore(this.draggedTab, afterElement);
    }
  }

  private async handleTabDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    if (!this.draggedTabId) return;

    // Just re-render to restore proper order
    await this.render();
  }

  private getDragAfterElement(x: number): Element | null {
    const draggableElements = Array.from(this.tabsWrapper!.querySelectorAll('.tab:not(.dragging)'));
    
    return draggableElements.reduce((closest: { offset: number; element: Element | null }, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  // Helper method to refresh tree
  private async refreshTree(): Promise<void> {
    const treeContainer = (window as any).CitationLinker.treeContainer;
    if (treeContainer && treeContainer.refresh) {
      await treeContainer.refresh();
    }
    
    // Also trigger the legacy tree reload if it exists
    if (typeof (window as any).loadTree === 'function') {
      const tabService = (window as any).CitationLinker.tabService;
      const activeTab = await tabService.getActiveTab();
      if (activeTab) {
        (window as any).loadTree(activeTab.treeData.nodes);
      }
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
