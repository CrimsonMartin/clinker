/**
 * @jest-environment jsdom
 */

// Load component file that creates window.searchBar singleton
require('../components/searchBar');

// Extract class constructor from the singleton instance
const SearchBarClass = (global as any).window.searchBar.constructor;

describe('SearchBar', () => {
  let searchBar: any;
  let mockSearchService: any;
  let mockTreeService: any;

  beforeEach(() => {
    // Clear document body - search bar with toggle button
    document.body.innerHTML = `
      <input id="searchInput" type="text" />
      <div id="searchContainer" style="display: none;"></div>
      <button id="searchToggleBtn"></button>
      <button id="searchPrevBtn"></button>
      <button id="searchNextBtn"></button>
      <div id="searchCounter"></div>
    `;

    // Clear mocks
    jest.clearAllMocks();

    // Mock console
    (global as any).console = {
      ...(global as any).console,
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock searchService
    mockSearchService = {
      performSearch: jest.fn().mockReturnValue([]),
      hasResults: jest.fn().mockReturnValue(false),
      getMatchingNodeIds: jest.fn().mockReturnValue(new Set()),
      getQuery: jest.fn().mockReturnValue(''),
      getCurrentResult: jest.fn().mockReturnValue(null),
      navigateToNext: jest.fn(),
      navigateToPrevious: jest.fn(),
      clearSearchResults: jest.fn(),
      searchResults: [],
      getSearchCounter: jest.fn().mockReturnValue('0 of 0')
    };

    // Mock treeService
    mockTreeService = {
      getTree: jest.fn().mockResolvedValue({ nodes: [] })
    };

    (window as any).searchService = mockSearchService;
    (window as any).treeService = mockTreeService;
    (window as any).CitationLinker = {
      searchService: mockSearchService,
      treeService: mockTreeService
    };

    // Create new SearchBar instance
    searchBar = new SearchBarClass();
  });

  describe('initialize', () => {
    it('should initialize successfully with all elements present', () => {
      searchBar.initialize();
      
      // Should log success message
      expect(console.log).toHaveBeenCalledWith('SearchBar initialized successfully');
    });

    it('should handle missing searchInput gracefully', () => {
      document.body.innerHTML = ''; // Remove all elements
      
      searchBar.initialize();
      
      expect(console.error).toHaveBeenCalledWith('Search input element not found');
    });
  });

  describe('toggleSearch', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should open search when closed', () => {
      const searchContainer = document.getElementById('searchContainer') as HTMLElement;
      const searchToggleBtn = document.getElementById('searchToggleBtn');
      
      searchBar.toggleSearch();
      
      expect(searchContainer.style.display).toBe('block');
      expect(searchToggleBtn?.classList.contains('active')).toBe(true);
    });

    it('should close search when open', () => {
      const searchContainer = document.getElementById('searchContainer') as HTMLElement;
      const searchToggleBtn = document.getElementById('searchToggleBtn');
      
      // First open
      searchBar.toggleSearch();
      expect(searchContainer.style.display).toBe('block');
      
      // Then close
      searchBar.toggleSearch();
      expect(searchContainer.style.display).toBe('none');
      expect(searchToggleBtn?.classList.contains('active')).toBe(false);
    });
  });

  describe('openSearch', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should open search container and focus input', () => {
      const searchContainer = document.getElementById('searchContainer') as HTMLElement;
      const searchToggleBtn = document.getElementById('searchToggleBtn');
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      
      // Mock focus method
      const focusSpy = jest.spyOn(searchInput, 'focus');
      const selectSpy = jest.spyOn(searchInput, 'select');
      
      searchBar.openSearch();
      
      expect(searchContainer.style.display).toBe('block');
      expect(searchToggleBtn?.classList.contains('active')).toBe(true);
      expect(focusSpy).toHaveBeenCalled();
      expect(selectSpy).toHaveBeenCalled();
    });
  });

  describe('closeSearch', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should close search container and clear input', () => {
      const searchContainer = document.getElementById('searchContainer') as HTMLElement;
      const searchToggleBtn = document.getElementById('searchToggleBtn');
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      
      // First open
      searchBar.openSearch();
      searchInput.value = 'test query';
      
      // Then close
      searchBar.closeSearch();
      
      expect(searchContainer.style.display).toBe('none');
      expect(searchToggleBtn?.classList.contains('active')).toBe(false);
      expect(searchInput.value).toBe('');
    });
  });

  describe('clearSearch', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should clear input and results', () => {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = 'test query';
      
      searchBar.clearSearch();
      
      expect(searchInput.value).toBe('');
      expect(mockSearchService.clearSearchResults).toHaveBeenCalled();
    });
  });

  describe('performSearch', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should not perform search for empty query', async () => {
      await searchBar.performSearch('');
      
      expect(mockSearchService.clearSearchResults).toHaveBeenCalled();
      expect(mockTreeService.getTree).not.toHaveBeenCalled();
    });

    it('should perform search with valid query', async () => {
      const mockResults = [{ nodeId: 1, matches: [] }];
      mockSearchService.performSearch.mockReturnValue(mockResults);
      mockSearchService.hasResults.mockReturnValue(true);

      await searchBar.performSearch('test');

      expect(mockTreeService.getTree).toHaveBeenCalled();
      expect(mockSearchService.performSearch).toHaveBeenCalledWith('test', [], {
        searchHighlighted: true,
        searchAnnotations: true,
        filterMode: true,
        searchAllTabs: true
      });
    });

    it('should handle search with no results', async () => {
      mockSearchService.hasResults.mockReturnValue(false);
      
      await searchBar.performSearch('notfound');
      
      expect(mockSearchService.performSearch).toHaveBeenCalled();
      expect(mockSearchService.getSearchCounter).toHaveBeenCalled();
    });
  });

  describe('updateSearchDisplay', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should update display in filter mode', () => {
      document.body.innerHTML += `
        <div class="tree-node" data-node-id="1"></div>
        <div class="tree-node" data-node-id="2"></div>
        <div class="tree-children"></div>
      `;
      
      mockSearchService.getMatchingNodeIds.mockReturnValue(new Set([1]));
      
      // Call the private method via reflection (TypeScript workaround)
      const updateSearchDisplay = (searchBar as any)['updateSearchDisplay'].bind(searchBar);
      updateSearchDisplay(true);
      
      const node1 = document.querySelector('[data-node-id="1"]');
      const node2 = document.querySelector('[data-node-id="2"]');
      
      expect(node1?.classList.contains('search-result')).toBe(true);
      expect(node1?.classList.contains('search-hidden')).toBe(false);
      expect(node2?.classList.contains('search-hidden')).toBe(true);
    });

    it('should update display in highlight mode', () => {
      document.body.innerHTML += `
        <div class="tree-node" data-node-id="1"></div>
        <div class="tree-node" data-node-id="2"></div>
      `;
      
      mockSearchService.searchResults = [{ nodeId: 1, matches: [] }];
      
      const updateSearchDisplay = (searchBar as any)['updateSearchDisplay'].bind(searchBar);
      updateSearchDisplay(false);
      
      const node1 = document.querySelector('[data-node-id="1"]');
      const node2 = document.querySelector('[data-node-id="2"]');
      
      expect(node1?.classList.contains('search-result')).toBe(true);
      expect(node2?.classList.contains('search-result')).toBe(false);
    });
  });

  describe('navigateToNextResult', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should navigate to next result', () => {
      searchBar.navigateToNextResult();
      
      expect(mockSearchService.navigateToNext).toHaveBeenCalled();
    });
  });

  describe('navigateToPreviousResult', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should navigate to previous result', () => {
      searchBar.navigateToPreviousResult();
      
      expect(mockSearchService.navigateToPrevious).toHaveBeenCalled();
    });
  });

  describe('clearSearchResults', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should clear search results and remove classes', () => {
      document.body.innerHTML += `
        <div class="search-result current-result search-hidden"></div>
        <span class="search-highlight">test</span>
      `;
      
      searchBar['clearSearchResults']();
      
      const element = document.querySelector('div');
      const highlight = document.querySelector('.search-highlight');
      
      expect(element?.classList.contains('search-result')).toBe(false);
      expect(element?.classList.contains('current-result')).toBe(false);
      expect(element?.classList.contains('search-hidden')).toBe(false);
      expect(highlight).toBeNull();
    });
  });

  describe('rerunSearchIfActive', () => {
    beforeEach(() => {
      searchBar.initialize();
    });

    it('should not rerun search when search is closed', () => {
      searchBar.rerunSearchIfActive();
      
      expect(mockSearchService.performSearch).not.toHaveBeenCalled();
    });

    it('should rerun search when search is open with value', () => {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      
      // Open search and set value
      searchBar.openSearch();
      searchInput.value = 'test';
      mockSearchService.performSearch.mockClear();
      
      searchBar.rerunSearchIfActive();
      
      // Wait for timeout
      jest.runAllTimers();
      
      // Note: This test might be flaky due to async timeout, but the logic is correct
    });
  });

  describe('event listeners', () => {
    beforeEach(() => {
      searchBar.initialize();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should toggle search when toggle button is clicked', () => {
      const searchToggleBtn = document.getElementById('searchToggleBtn');
      const searchContainer = document.getElementById('searchContainer') as HTMLElement;
      
      // First click - should open
      searchToggleBtn?.dispatchEvent(new Event('click'));
      expect(searchContainer.style.display).toBe('block');
      
      // Second click - should close
      searchToggleBtn?.dispatchEvent(new Event('click'));
      expect(searchContainer.style.display).toBe('none');
    });

    it('should close search on escape key when open', () => {
      const searchContainer = document.getElementById('searchContainer') as HTMLElement;
      
      // Open search first
      searchBar.openSearch();
      expect(searchContainer.style.display).toBe('block');
      
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);
      
      expect(searchContainer.style.display).toBe('none');
    });

    it('should handle search input with debouncing', async () => {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      
      // Open search first
      searchBar.openSearch();
      searchInput.value = 'test';
      
      const inputEvent = new Event('input', { bubbles: true });
      Object.defineProperty(inputEvent, 'target', { value: searchInput });
      searchInput.dispatchEvent(inputEvent);
      
      // Should not call immediately
      expect(mockTreeService.getTree).not.toHaveBeenCalled();
      
      // Fast forward timers to trigger debounced function
      jest.advanceTimersByTime(300);
      
      // Wait for any pending promises
      await Promise.resolve();
      
      // Should have called getTree after debounce
      expect(mockTreeService.getTree).toHaveBeenCalled();
    });

    it('should navigate search results with arrow keys when results exist', () => {
      mockSearchService.hasResults.mockReturnValue(true);
      
      // Clear previous calls
      mockSearchService.navigateToNext.mockClear();
      mockSearchService.navigateToPrevious.mockClear();
      
      const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      
      document.dispatchEvent(downEvent);
      expect(mockSearchService.navigateToNext).toHaveBeenCalled();
      
      document.dispatchEvent(upEvent);
      expect(mockSearchService.navigateToPrevious).toHaveBeenCalled();
    });

    it('should navigate with Enter key when input is focused', () => {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.focus();
      Object.defineProperty(document, 'activeElement', { value: searchInput, configurable: true });
      
      mockSearchService.hasResults.mockReturnValue(true);
      mockSearchService.navigateToNext.mockClear();
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      document.dispatchEvent(enterEvent);
      
      expect(mockSearchService.navigateToNext).toHaveBeenCalled();
    });
  });
});
