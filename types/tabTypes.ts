// tabTypes.ts - Type definitions for tab operations

// Global namespace for Citation Linker tab types
declare global {
  namespace CitationLinker {
    interface Tab {
      id: string;
      title: string;
      url: string;
      isActive: boolean;
      treeData: TreeData;
      lastModified: number;
    }

    interface TabState {
      tabs: Tab[];
      activeTabId: string | null;
    }

    interface TabSearchOptions {
      searchAllTabs: boolean;
      includeHighlighted: boolean;
      includeAnnotations: boolean;
      filterMode: boolean;
    }

    interface TabSearchResult {
      tabId: string;
      tabTitle: string;
      results: SearchResult[];
    }

    interface SearchResult {
      nodeId: number;
      type: 'content' | 'annotation';
      text: string;
      matchText: string;
      url: string;
    }
  }
}

// This export is needed to make this file a module for TypeScript
export {};
