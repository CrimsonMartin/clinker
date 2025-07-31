// tabService.ts - Tab management service

// Initialize global namespace if it doesn't exist
if (typeof window !== 'undefined') {
  (window as any).CitationLinker = (window as any).CitationLinker || {};
}

class TabService {
  private storageKey: string;
  private defaultTabId: string;

  constructor() {
    this.storageKey = 'tabsData';
    this.defaultTabId = 'general-tab';
  }

  // Initialize tabs system (with migration from old format)
  async initialize(): Promise<void> {
    try {
      // Check if tabs already exist
      const existingTabs = await browser.storage.local.get(this.storageKey);
      if (existingTabs[this.storageKey]) {
        return; // Already initialized
      }

      // Check for old format data
      const oldData = await browser.storage.local.get('citationTree');
      let treeData: CitationLinker.TreeData;

      if (oldData.citationTree) {
        // Migrate from old format
        treeData = oldData.citationTree;
        console.log('Migrating from old citation format to tabs');
      } else {
        // Create empty tree data
        treeData = { nodes: [], currentNodeId: null };
      }

      // Create default General tab
      const generalTab: CitationLinker.Tab = {
        id: this.defaultTabId,
        title: 'General',
        url: '',
        isActive: true,
        treeData: treeData,
        lastModified: Date.now()
      };

      // Save initial tabs data
      const tabsData: CitationLinker.TabState = {
        tabs: [generalTab],
        activeTabId: this.defaultTabId
      };

      await browser.storage.local.set({ [this.storageKey]: tabsData });
      console.log('Tabs system initialized with General tab');
    } catch (error) {
      console.error('Error initializing tabs:', error);
    }
  }

  // Get all tabs data
  async getTabs(): Promise<CitationLinker.TabState> {
    const result = await browser.storage.local.get(this.storageKey);
    if (!result[this.storageKey]) {
      await this.initialize();
      const newResult = await browser.storage.local.get(this.storageKey);
      return newResult[this.storageKey];
    }
    return result[this.storageKey];
  }

  // Get a specific tab by ID
  async getTab(tabId: string): Promise<CitationLinker.Tab | null> {
    const tabsData = await this.getTabs();
    return tabsData.tabs.find(tab => tab.id === tabId) || null;
  }

  // Get the active tab
  async getActiveTab(): Promise<CitationLinker.Tab | null> {
    const tabsData = await this.getTabs();
    return tabsData.tabs.find(tab => tab.id === tabsData.activeTabId) || null;
  }

  // Create a new tab
  async createTab(title: string): Promise<CitationLinker.Tab> {
    const tabsData = await this.getTabs();
    
    // Generate unique ID
    const newId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newTab: CitationLinker.Tab = {
      id: newId,
      title: title,
      url: '',
      isActive: false,
      treeData: { nodes: [], currentNodeId: null },
      lastModified: Date.now()
    };
    
    tabsData.tabs.push(newTab);
    tabsData.activeTabId = newId; // Switch to new tab
    
    // Set all other tabs to inactive
    tabsData.tabs.forEach(tab => {
      tab.isActive = tab.id === newId;
    });
    
    await browser.storage.local.set({ [this.storageKey]: tabsData });
    return newTab;
  }

  // Delete a tab (cannot delete if it's the only tab)
  async deleteTab(tabId: string): Promise<boolean> {
    const tabsData = await this.getTabs();
    
    if (tabsData.tabs.length <= 1) {
      console.warn('Cannot delete the only remaining tab');
      return false;
    }
    
    // Remove the tab
    tabsData.tabs = tabsData.tabs.filter(tab => tab.id !== tabId);
    
    // If deleted tab was active, switch to first tab
    if (tabsData.activeTabId === tabId) {
      tabsData.activeTabId = tabsData.tabs[0].id;
      tabsData.tabs[0].isActive = true;
    }
    
    await browser.storage.local.set({ [this.storageKey]: tabsData });
    return true;
  }

  // Rename a tab
  async renameTab(tabId: string, newTitle: string): Promise<boolean> {
    const tabsData = await this.getTabs();
    const tab = tabsData.tabs.find(t => t.id === tabId);
    
    if (!tab) {
      console.error('Tab not found:', tabId);
      return false;
    }
    
    tab.title = newTitle;
    tab.lastModified = Date.now();
    
    await browser.storage.local.set({ [this.storageKey]: tabsData });
    return true;
  }

  // Set active tab
  async setActiveTab(tabId: string): Promise<void> {
    const tabsData = await this.getTabs();
    const tab = tabsData.tabs.find(t => t.id === tabId);
    
    if (!tab) {
      console.error('Tab not found:', tabId);
      return;
    }
    
    // Set all tabs to inactive, then activate the selected one
    tabsData.tabs.forEach(t => {
      t.isActive = t.id === tabId;
    });
    
    tabsData.activeTabId = tabId;
    await browser.storage.local.set({ [this.storageKey]: tabsData });
  }

  // Get active tab ID
  async getActiveTabId(): Promise<string> {
    const tabsData = await this.getTabs();
    return tabsData.activeTabId || tabsData.tabs[0]?.id || this.defaultTabId;
  }

  // Update a tab's tree data
  async updateTabTree(tabId: string, treeData: CitationLinker.TreeData): Promise<void> {
    const tabsData = await this.getTabs();
    const tab = tabsData.tabs.find(t => t.id === tabId);
    
    if (!tab) {
      console.error('Tab not found:', tabId);
      return;
    }
    
    tab.treeData = treeData;
    tab.lastModified = Date.now();
    
    await browser.storage.local.set({ [this.storageKey]: tabsData });
  }

  // Get all tabs for display
  async getTabsForDisplay(): Promise<CitationLinker.Tab[]> {
    const tabsData = await this.getTabs();
    return tabsData.tabs;
  }

  // Search across all tabs
  async searchAllTabs(query: string, options: CitationLinker.TabSearchOptions): Promise<CitationLinker.TabSearchResult[]> {
    const tabsData = await this.getTabs();
    const results: CitationLinker.TabSearchResult[] = [];
    
    for (const tab of tabsData.tabs) {
      const tabResults: CitationLinker.SearchResult[] = [];
      
      // Search through nodes in this tab
      for (const node of tab.treeData.nodes) {
        // Search highlighted content
        if (options.includeHighlighted && node.text.toLowerCase().includes(query.toLowerCase())) {
          tabResults.push({
            nodeId: node.id,
            type: 'content',
            text: node.text,
            matchText: node.text,
            url: node.url
          });
        }
        
        // Search annotations
        if (options.includeAnnotations && node.annotations) {
          for (const annotation of node.annotations) {
            if (annotation.text.toLowerCase().includes(query.toLowerCase())) {
              tabResults.push({
                nodeId: node.id,
                type: 'annotation',
                text: annotation.text,
                matchText: annotation.text,
                url: node.url
              });
            }
          }
        }
      }
      
      if (tabResults.length > 0) {
        results.push({
          tabId: tab.id,
          tabTitle: tab.title,
          results: tabResults
        });
      }
    }
    
    return results;
  }
}

// Attach to global namespace
if (typeof window !== 'undefined') {
  (window as any).CitationLinker.TabService = TabService;
  (window as any).CitationLinker.tabService = new TabService();
}
