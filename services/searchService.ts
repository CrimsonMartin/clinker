// searchService.ts - Search functionality and state management
import { TreeNode } from '../types/treeTypes';

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
}

interface SearchOptions {
  searchHighlighted: boolean;
  searchAnnotations: boolean;
  filterMode: boolean;
}

export class SearchService {
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
      filterMode: false
    };
  }

  // Perform search across tree nodes
  performSearch(query: string, nodes: TreeNode[], options: Partial<SearchOptions> = {}): SearchResult[] {
    this.searchQuery = query.trim().toLowerCase();
    this.searchOptions = { ...this.searchOptions, ...options };
    
    if (!this.searchQuery) {
      this.clearSearchResults();
      return [];
    }

    this.searchResults = [];

    // Search through nodes, excluding deleted nodes
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

    // Sort results by priority (highlighted content first, then annotations)
    this.searchResults.sort((a, b) => a.priority - b.priority);

    if (this.searchResults.length > 0) {
      this.currentSearchIndex = 0;
    }

    return this.searchResults;
  }

  // Find matches within a node
  findMatches(node: TreeNode): SearchMatch[] {
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
      node.annotations.forEach((annotation, index) => {
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
  navigateToNext(): SearchResult | null {
    if (this.searchResults.length === 0) return null;
    
    this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
    return this.getCurrentResult();
  }

  // Navigate to previous search result
  navigateToPrevious(): SearchResult | null {
    if (this.searchResults.length === 0) return null;
    
    this.currentSearchIndex = this.currentSearchIndex === 0 
      ? this.searchResults.length - 1 
      : this.currentSearchIndex - 1;
    return this.getCurrentResult();
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

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).searchService = new SearchService();
}
