// searchService.js - Search functionality and state management

class SearchService {
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
  performSearch(query, nodes, options = {}) {
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
  findMatches(node) {
    const matches = [];

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
  navigateToNext() {
    if (this.searchResults.length === 0) return null;
    
    this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
    return this.getCurrentResult();
  }

  // Navigate to previous search result
  navigateToPrevious() {
    if (this.searchResults.length === 0) return null;
    
    this.currentSearchIndex = this.currentSearchIndex === 0 
      ? this.searchResults.length - 1 
      : this.currentSearchIndex - 1;
    return this.getCurrentResult();
  }

  // Get current search result
  getCurrentResult() {
    if (this.searchResults.length === 0) return null;
    return this.searchResults[this.currentSearchIndex];
  }

  // Get search counter text
  getSearchCounter() {
    if (this.searchResults.length === 0) {
      return '0 of 0';
    }
    return `${this.currentSearchIndex + 1} of ${this.searchResults.length}`;
  }

  // Clear search results
  clearSearchResults() {
    this.searchResults = [];
    this.currentSearchIndex = 0;
    this.searchQuery = '';
  }

  // Check if search has results
  hasResults() {
    return this.searchResults.length > 0;
  }

  // Get all matching node IDs (for filtering)
  getMatchingNodeIds() {
    return new Set(this.searchResults.map(r => r.nodeId));
  }

  // Update search options
  updateOptions(options) {
    this.searchOptions = { ...this.searchOptions, ...options };
  }

  // Get current search options
  getOptions() {
    return { ...this.searchOptions };
  }

  // Get current search query
  getQuery() {
    return this.searchQuery;
  }
}

// Export as singleton
window.searchService = new SearchService();
