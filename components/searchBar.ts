// searchBar.ts - Search bar component for searching through citations

interface SearchElements {
  searchInput: HTMLInputElement | null;
  searchContainer: HTMLElement | null;
  searchToggleBtn: HTMLElement | null;
  searchCloseBtn: HTMLElement | null;
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
      searchToggleBtn: null,
      searchCloseBtn: null,
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
      searchToggleBtn: document.getElementById('searchToggleBtn'),
      searchCloseBtn: document.getElementById('searchCloseBtn'),
      searchPrevBtn: document.getElementById('searchPrevBtn') as HTMLButtonElement,
      searchNextBtn: document.getElementById('searchNextBtn') as HTMLButtonElement,
      searchCounter: document.getElementById('searchCounter'),
      searchHighlighted: document.getElementById('searchHighlighted') as HTMLInputElement,
      searchAnnotations: document.getElementById('searchAnnotations') as HTMLInputElement,
      searchFilterMode: document.getElementById('searchFilterMode') as HTMLInputElement,
      searchAllTabs: document.getElementById('searchAllTabs') as HTMLInputElement
    };

    // Verify all elements exist
    const missingElements = Object.entries(this.elements)
      .filter(([key, element]) => !element)
      .map(([key]) => key);
    
    if (missingElements.length > 0) {
      console.error('Missing search elements:', missingElements);
      return;
    }

    this.setupEventListeners();
    this.initialized = true;
  }

  // Setup event listeners
  private setupEventListeners(): void {
    // Search toggle button
    this.elements.searchToggleBtn?.addEventListener('click', () => {
      if (this.elements.searchContainer?.style.display === 'none') {
        this.openSearch();
      } else {
        this.closeSearch();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elements.searchContainer?.style.display !== 'none') {
        this.closeSearch();
      }
      
      // Navigate search results with arrow keys
      if (this.elements.searchContainer?.style.display !== 'none' && (window as any).searchService.hasResults()) {
        if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          this.navigateToNextResult();
        } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
          e.preventDefault();
          this.navigateToPreviousResult();
        }
      }
    });

    // Search input with debouncing
    this.elements.searchInput?.addEventListener('input', (e) => {
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }
      this.searchTimeout = setTimeout(() => {
        this.performSearch((e.target as HTMLInputElement).value);
      }, 300);
    });

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
    this.elements.searchCloseBtn?.addEventListener('click', () => this.closeSearch());
  }

  // Open search
  openSearch(): void {
    if (this.elements.searchContainer) {
      this.elements.searchContainer.style.display = 'block';
    }
    this.elements.searchToggleBtn?.classList.add('active');
    this.elements.searchInput?.focus();
    this.elements.searchInput?.select();
  }

  // Close search
  closeSearch(): void {
    if (this.elements.searchContainer) {
      this.elements.searchContainer.style.display = 'none';
    }
    this.elements.searchToggleBtn?.classList.remove('active');
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
      searchHighlighted: this.elements.searchHighlighted?.checked || false,
      searchAnnotations: this.elements.searchAnnotations?.checked || false,
      filterMode: this.elements.searchFilterMode?.checked || false,
      searchAllTabs: this.elements.searchAllTabs?.checked || false
    };

    // Get tree data and perform search
    const tree = await (window as any).treeService.getTree();
    const results = await (window as any).searchService.performSearch(trimmedQuery, tree.nodes, options);

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

    if (filterMode) {
      // Filter mode: hide non-matching nodes
      const matchingNodeIds = (window as any).searchService.getMatchingNodeIds();
      
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
      const results = (window as any).searchService.searchResults;
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
    const query = (window as any).searchService.getQuery();
    if (!query) return;

    // Remove existing highlights
    document.querySelectorAll('.search-highlight').forEach(highlight => {
      const parent = highlight.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
        parent.normalize();
      }
    });

    const results = (window as any).searchService.searchResults;
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

    const currentResult = (window as any).searchService.getCurrentResult();
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
    await (window as any).searchService.navigateToNext();
    this.highlightCurrentResult();
    this.updateSearchCounter();
  }

  // Navigate to previous result
  async navigateToPreviousResult(): Promise<void> {
    await (window as any).searchService.navigateToPrevious();
    this.highlightCurrentResult();
    this.updateSearchCounter();
  }

  // Update search counter
  private updateSearchCounter(): void {
    const counter = (window as any).searchService.getSearchCounter();
    if (this.elements.searchCounter) {
      this.elements.searchCounter.textContent = counter;
    }
    
    const hasResults = (window as any).searchService.hasResults();
    if (this.elements.searchPrevBtn) {
      this.elements.searchPrevBtn.disabled = !hasResults;
    }
    if (this.elements.searchNextBtn) {
      this.elements.searchNextBtn.disabled = !hasResults;
    }
  }

  // Clear search results
  clearSearchResults(): void {
    (window as any).searchService.clearSearchResults();
    
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

  // Re-run search if active (for when tree updates)
  rerunSearchIfActive(): void {
    if (this.elements.searchContainer?.style.display !== 'none' && 
        this.elements.searchInput?.value.trim()) {
      setTimeout(() => {
        this.performSearch(this.elements.searchInput!.value);
      }, 100);
    }
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).searchBar = new SearchBar();
}
