// searchBar.ts - Search bar component for searching through citations
// Search bar is always visible - no toggle functionality needed

interface SearchElements {
  searchInput: HTMLInputElement | null;
  searchContainer: HTMLElement | null;
  searchPrevBtn: HTMLButtonElement | null;
  searchNextBtn: HTMLButtonElement | null;
  searchCounter: HTMLElement | null;
  searchHighlighted: HTMLInputElement | null;
  searchAnnotations: HTMLInputElement | null;
  searchFilterMode: HTMLInputElement | null;
  searchAllTabs: HTMLInputElement | null;
}

class SearchBar {
  private searchTimeout: any;
  private elements: SearchElements;
  private initialized: boolean;

  constructor() {
    this.searchTimeout = null;
    this.elements = {
      searchInput: null,
      searchContainer: null,
      searchPrevBtn: null,
      searchNextBtn: null,
      searchCounter: null,
      searchHighlighted: null,
      searchAnnotations: null,
      searchFilterMode: null,
      searchAllTabs: null
    };
    this.initialized = false;
  }

  // Initialize search bar
  initialize(): void {
    // Get all search-related elements
    this.elements = {
      searchInput: document.getElementById('searchInput') as HTMLInputElement,
      searchContainer: document.getElementById('searchContainer'),
      searchPrevBtn: document.getElementById('searchPrevBtn') as HTMLButtonElement,
      searchNextBtn: document.getElementById('searchNextBtn') as HTMLButtonElement,
      searchCounter: document.getElementById('searchCounter'),
      searchHighlighted: document.getElementById('searchHighlighted') as HTMLInputElement,
      searchAnnotations: document.getElementById('searchAnnotations') as HTMLInputElement,
      searchFilterMode: document.getElementById('searchFilterMode') as HTMLInputElement,
      searchAllTabs: document.getElementById('searchAllTabs') as HTMLInputElement
    };

    // Check for required elements (searchInput is the most important)
    if (!this.elements.searchInput) {
      console.error('Search input element not found');
      return;
    }

    this.setupEventListeners();
    this.initialized = true;
    console.log('SearchBar initialized successfully');
  }

  // Setup event listeners
  private setupEventListeners(): void {
    // Keyboard shortcuts for search navigation
    document.addEventListener('keydown', (e) => {
      // Navigate search results with arrow keys when search has results
      if ((window as any).searchService?.hasResults()) {
        if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey && document.activeElement === this.elements.searchInput)) {
          e.preventDefault();
          this.navigateToNextResult();
        } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey && document.activeElement === this.elements.searchInput)) {
          e.preventDefault();
          this.navigateToPreviousResult();
        }
      }
      
      // Clear search on Escape
      if (e.key === 'Escape' && document.activeElement === this.elements.searchInput) {
        this.clearSearch();
      }
    });

    // Search input with debouncing
    const searchInput = this.elements.searchInput;
    if (searchInput) {
      console.log('SearchBar: Attaching input event listener to search input');
      searchInput.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        console.log('SearchBar: Input event fired, value:', value);
        
        if (this.searchTimeout) {
          clearTimeout(this.searchTimeout);
        }
        this.searchTimeout = setTimeout(() => {
          console.log('SearchBar: Debounce complete, performing search for:', value);
          this.performSearch(value);
        }, 300);
      });
    } else {
      console.error('SearchBar: searchInput element is null, cannot attach listener');
    }

    // Search option changes
    [
      this.elements.searchHighlighted,
      this.elements.searchAnnotations,
      this.elements.searchFilterMode,
      this.elements.searchAllTabs
    ].forEach(checkbox => {
      checkbox?.addEventListener('change', () => {
        if (this.elements.searchInput?.value.trim()) {
          this.performSearch(this.elements.searchInput.value);
        }
      });
    });

    // Navigation buttons
    this.elements.searchPrevBtn?.addEventListener('click', () => this.navigateToPreviousResult());
    this.elements.searchNextBtn?.addEventListener('click', () => this.navigateToNextResult());
  }

  // Clear search input and results
  clearSearch(): void {
    if (this.elements.searchInput) {
      this.elements.searchInput.value = '';
    }
    this.clearSearchResults();
  }

  // Perform search
  async performSearch(query: string): Promise<void> {
    const trimmedQuery = query.trim();
    
    if (!trimmedQuery) {
      this.clearSearchResults();
      return;
    }

    // Get search options
    const options = {
      searchHighlighted: this.elements.searchHighlighted?.checked ?? true,
      searchAnnotations: this.elements.searchAnnotations?.checked ?? true,
      filterMode: this.elements.searchFilterMode?.checked ?? false,
      searchAllTabs: this.elements.searchAllTabs?.checked ?? false
    };

    // Get tree data and perform search
    const treeService = (window as any).treeService || (window as any).CitationLinker?.treeService;
    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    
    if (!treeService || !searchService) {
      console.error('TreeService or SearchService not available');
      return;
    }

    const tree = await treeService.getTree();
    const results = await searchService.performSearch(trimmedQuery, tree.nodes, options);

    // Update display
    this.updateSearchDisplay(options.filterMode);
    this.updateSearchCounter();
    
    if (results.length > 0) {
      this.highlightCurrentResult();
    }
  }

  // Update search display
  private updateSearchDisplay(filterMode: boolean): void {
    const allNodes = document.querySelectorAll('.tree-node');
    const allChildren = document.querySelectorAll('.tree-children');
    
    // Reset all nodes and children visibility
    allNodes.forEach(node => {
      node.classList.remove('search-result', 'current-result', 'search-hidden');
    });
    allChildren.forEach(children => {
      children.classList.remove('search-hidden');
    });

    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    if (!searchService) return;

    if (filterMode) {
      // Filter mode: hide non-matching nodes
      const matchingNodeIds = searchService.getMatchingNodeIds();
      
      allNodes.forEach(node => {
        const nodeId = parseInt((node as HTMLElement).dataset.nodeId || '0');
        if (!matchingNodeIds.has(nodeId)) {
          node.classList.add('search-hidden');
          
          // Also hide children containers if parent is hidden
          const childrenContainer = node.querySelector('.tree-children');
          if (childrenContainer) {
            childrenContainer.classList.add('search-hidden');
          }
        } else {
          node.classList.add('search-result');
        }
      });
    } else {
      // Highlight mode: show all nodes but highlight matches
      const results = searchService.searchResults;
      results.forEach((result: any) => {
        const nodeElement = document.querySelector(`[data-node-id="${result.nodeId}"]`);
        if (nodeElement) {
          nodeElement.classList.add('search-result');
        }
      });
    }

    // Apply text highlighting
    this.applyTextHighlighting();
  }

  // Apply text highlighting
  private applyTextHighlighting(): void {
    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    if (!searchService) return;

    const query = searchService.getQuery();
    if (!query) return;

    // Remove existing highlights
    document.querySelectorAll('.search-highlight').forEach(highlight => {
      const parent = highlight.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
        parent.normalize();
      }
    });

    const results = searchService.searchResults;
    results.forEach((result: any) => {
      const nodeElement = document.querySelector(`[data-node-id="${result.nodeId}"]`);
      if (!nodeElement) return;

      result.matches.forEach((match: any) => {
        if (match.type === 'highlight') {
          // Highlight in main text content
          const contentElement = nodeElement.querySelector('.tree-node-content');
          if (contentElement) {
            this.highlightTextInElement(contentElement as HTMLElement, query);
          }
        } else if (match.type === 'annotation') {
          // Highlight in annotation tooltip if visible
          const tooltips = nodeElement.querySelectorAll('.annotation-text');
          tooltips.forEach(tooltip => {
            if (tooltip.textContent?.toLowerCase().includes(query)) {
              this.highlightTextInElement(tooltip as HTMLElement, query);
            }
          });
        }
      });
    });
  }

  // Highlight text in element
  private highlightTextInElement(element: HTMLElement, query: string): void {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      const lowerText = text.toLowerCase();
      const queryIndex = lowerText.indexOf(query);
      
      if (queryIndex !== -1) {
        const beforeText = text.substring(0, queryIndex);
        const matchText = text.substring(queryIndex, queryIndex + query.length);
        const afterText = text.substring(queryIndex + query.length);
        
        const fragment = document.createDocumentFragment();
        
        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }
        
        const highlight = document.createElement('span');
        highlight.className = 'search-highlight';
        highlight.textContent = matchText;
        fragment.appendChild(highlight);
        
        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText));
        }
        
        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    });
  }

  // Highlight current result
  private highlightCurrentResult(): void {
    // Remove previous current result highlighting
    document.querySelectorAll('.current-result').forEach(el => {
      el.classList.remove('current-result');
    });
    
    document.querySelectorAll('.search-highlight.current').forEach(el => {
      el.classList.remove('current');
    });

    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    if (!searchService) return;

    const currentResult = searchService.getCurrentResult();
    if (!currentResult) return;

    const nodeElement = document.querySelector(`[data-node-id="${currentResult.nodeId}"]`);
    
    if (nodeElement) {
      nodeElement.classList.add('current-result');
      
      // Highlight the first match in this node as current
      const firstHighlight = nodeElement.querySelector('.search-highlight');
      if (firstHighlight) {
        firstHighlight.classList.add('current');
      }
      
      // Scroll to result
      nodeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  // Navigate to next result
  async navigateToNextResult(): Promise<void> {
    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    if (!searchService) return;

    await searchService.navigateToNext();
    this.highlightCurrentResult();
    this.updateSearchCounter();
  }

  // Navigate to previous result
  async navigateToPreviousResult(): Promise<void> {
    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    if (!searchService) return;

    await searchService.navigateToPrevious();
    this.highlightCurrentResult();
    this.updateSearchCounter();
  }

  // Update search counter
  private updateSearchCounter(): void {
    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    if (!searchService) return;

    const counter = searchService.getSearchCounter();
    if (this.elements.searchCounter) {
      this.elements.searchCounter.textContent = counter;
    }
    
    const hasResults = searchService.hasResults();
    if (this.elements.searchPrevBtn) {
      this.elements.searchPrevBtn.disabled = !hasResults;
    }
    if (this.elements.searchNextBtn) {
      this.elements.searchNextBtn.disabled = !hasResults;
    }
  }

  // Clear search results
  clearSearchResults(): void {
    const searchService = (window as any).searchService || (window as any).CitationLinker?.searchService;
    if (searchService) {
      searchService.clearSearchResults();
    }
    
    // Remove all search-related classes
    document.querySelectorAll('.search-result, .current-result, .search-hidden').forEach(el => {
      el.classList.remove('search-result', 'current-result', 'search-hidden');
    });
    
    // Remove text highlights
    document.querySelectorAll('.search-highlight').forEach(highlight => {
      const parent = highlight.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
        parent.normalize();
      }
    });
    
    this.updateSearchCounter();
  }

  // Re-run search if there's a query (for when tree updates)
  rerunSearchIfActive(): void {
    if (this.elements.searchInput?.value.trim()) {
      setTimeout(() => {
        this.performSearch(this.elements.searchInput!.value);
      }, 100);
    }
  }

  // Legacy methods for compatibility (no-ops since search is always visible)
  openSearch(): void {
    this.elements.searchInput?.focus();
  }

  closeSearch(): void {
    this.clearSearch();
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  // Initialize global namespace if it doesn't exist
  (window as any).CitationLinker = (window as any).CitationLinker || {};
  
  // Create singleton instance
  const searchBarInstance = new SearchBar();
  
  // Attach to both namespaces for compatibility
  (window as any).CitationLinker.searchBar = searchBarInstance;
  (window as any).searchBar = searchBarInstance; // Legacy support
}
