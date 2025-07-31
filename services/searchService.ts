// searchService.ts - Search functionality and state management

// Initialize global namespace if it doesn't exist
if (typeof window !== 'undefined') {
  (window as any).CitationLinker = (window as any).CitationLinker || {};
}

interface SearchMatch {
  type: 'highlight' | 'annotation';
  text: string;
  nodeId: number;
  annotationIndex?: number;
}

interface SearchResult {
  nodeId: number;
  matches: SearchMatch[];
  priority: number;
  tabId?: string;
  tabName?: string;
}

interface SearchOptions {
  searchHighlighted: boolean;
  searchAnnotations: boolean;
  filterMode: boolean;
  searchAllTabs: boolean;
}

class SearchService {
  private searchResults: SearchResult[];
  private currentSearchIndex: number;
  private searchQuery: string;
  private searchOptions: SearchOptions;

  constructor() {
    this.searchResults = [];
    this.currentSearchIndex = 0;
    this.searchQuery = '';
    this.searchOptions = {
      searchHighlighted: true,
      searchAnnotations: true,
      filterMode: false,
      searchAllTabs: false
    };
  }

  // Perform search across tree nodes
  async performSearch(query: string, nodes: CitationLinker.TreeNode[], options: Partial<SearchOptions> = {}): Promise<SearchResult[]> {
    this.searchQuery = query.trim().toLowerCase();
    this.searchOptions = { ...this.searchOptions, ...options };
    
    if (!this.searchQuery) {
      this.clearSearchResults();
      return [];
    }

    this.searchResults = [];

    // If searching all tabs, get all tabs and search through them
    if (this.searchOptions.searchAllTabs && (window as any).CitationLinker.tabService) {
      const tabService = (window as any).CitationLinker.tabService;
      const tabsData = await tabService.getTabs();
      
      for (const tab of tabsData.tabs) {
        // Search through nodes in each tab
        tab.treeData.nodes.forEach((node: CitationLinker.TreeNode) => {
          if (!node.deleted) {
            const matches = this.findMatches(node);
            if (matches.length > 0) {
              this.searchResults.push({
                nodeId: node.id,
                matches: matches,
                priority: matches.some(m => m.type === 'highlight') ? 1 : 2,
                tabId: tab.id,
                tabName: tab.title
              });
            }
          }
        });
      }
    } else {
      // Search only in current tab (provided nodes)
      nodes.forEach(node => {
        if (!node.deleted) {
          const matches = this.findMatches(node);
          if (matches.length > 0) {
            this.searchResults.push({
              nodeId: node.id,
              matches: matches,
              priority: matches.some(m => m.type === 'highlight') ? 1 : 2
            });
          }
        }
      });
    }

    // Sort results by priority (highlighted content first, then annotations)
    this.searchResults.sort((a, b) => a.priority - b.priority);

    if (this.searchResults.length > 0) {
      this.currentSearchIndex = 0;
    }

    return this.searchResults;
  }

  // Find matches within a node
  findMatches(node: CitationLinker.TreeNode): SearchMatch[] {
    const matches: SearchMatch[] = [];

    // Search in highlighted content
    if (this.searchOptions.searchHighlighted && node.text && 
        node.text.toLowerCase().includes(this.searchQuery)) {
      matches.push({
        type: 'highlight',
        text: node.text,
        nodeId: node.id
      });
    }

    // Search in annotations
    if (this.searchOptions.searchAnnotations && node.annotations) {
      node.annotations.forEach((annotation: any, index: number) => {
        if (annotation.text.toLowerCase().includes(this.searchQuery)) {
          matches.push({
            type: 'annotation',
            text: annotation.text,
            nodeId: node.id,
            annotationIndex: index
          });
        }
      });
    }

    return matches;
  }

  // Navigate to next search result
  async navigateToNext(): Promise<SearchResult | null> {
    if (this.searchResults.length === 0) return null;
    
    this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
    const result = this.getCurrentResult();
    
    // If result is from a different tab, switch to it
    if (result && result.tabId && (window as any).CitationLinker.tabService) {
      await (window as any).CitationLinker.tabService.setActiveTab(result.tabId);
      // Wait a bit for the tab to load
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return result;
  }

  // Navigate to previous search result
  async navigateToPrevious(): Promise<SearchResult | null> {
    if (this.searchResults.length === 0) return null;
    
    this.currentSearchIndex = this.currentSearchIndex === 0 
      ? this.searchResults.length - 1 
      : this.currentSearchIndex - 1;
    const result = this.getCurrentResult();
    
    // If result is from a different tab, switch to it
    if (result && result.tabId && (window as any).CitationLinker.tabService) {
      await (window as any).CitationLinker.tabService.setActiveTab(result.tabId);
      // Wait a bit for the tab to load
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return result;
  }

  // Get current search result
  getCurrentResult(): SearchResult | null {
    if (this.searchResults.length === 0) return null;
    return this.searchResults[this.currentSearchIndex];
  }

  // Get search counter text
  getSearchCounter(): string {
    if (this.searchResults.length === 0) {
      return '0 of 0';
    }
    return `${this.currentSearchIndex + 1} of ${this.searchResults.length}`;
  }

  // Clear search results
  clearSearchResults(): void {
    this.searchResults = [];
    this.currentSearchIndex = 0;
    this.searchQuery = '';
  }

  // Check if search has results
  hasResults(): boolean {
    return this.searchResults.length > 0;
  }

  // Get all matching node IDs (for filtering)
  getMatchingNodeIds(): Set<number> {
    return new Set(this.searchResults.map(r => r.nodeId));
  }

  // Update search options
  updateOptions(options: Partial<SearchOptions>): void {
    this.searchOptions = { ...this.searchOptions, ...options };
  }

  // Get current search options
  getOptions(): SearchOptions {
    return { ...this.searchOptions };
  }

  // Get current search query
  getQuery(): string {
    return this.searchQuery;
  }
}

// Attach to global namespace
if (typeof window !== 'undefined') {
  (window as any).CitationLinker.SearchService = SearchService;
  (window as any).CitationLinker.searchService = new SearchService();
  
  // Export as singleton for backward compatibility
  (window as any).searchService = (window as any).CitationLinker.searchService;
}

// ES6 module exports for test compatibility
export { SearchService };
export default SearchService;
