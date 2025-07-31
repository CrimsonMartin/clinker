/**
 * @jest-environment jsdom
 */

import { SearchService } from '../services/searchService';
import { TreeNode } from '../types/treeTypes';

describe('SearchService', () => {
  let searchService: SearchService;

  beforeEach(() => {
    searchService = new SearchService();
  });

  describe('performSearch', () => {
    it('should return empty array for empty query', async () => {
      const nodes: TreeNode[] = [];
      const results = await searchService.performSearch('', nodes);
      
      expect(results).toEqual([]);
      expect(searchService.hasResults()).toBe(false);
    });

    it('should return empty array for whitespace-only query', async () => {
      const nodes: TreeNode[] = [];
      const results = await searchService.performSearch('   ', nodes);
      
      expect(results).toEqual([]);
      expect(searchService.hasResults()).toBe(false);
    });

    it('should find matches in node text', async () => {
      const nodes: TreeNode[] = [
        {
          id: 1,
          text: 'This is a test node',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        }
      ];
      
      const results = await searchService.performSearch('test', nodes);
      
      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe(1);
      expect(results[0].matches).toHaveLength(1);
      expect(results[0].matches[0].type).toBe('highlight');
      expect(results[0].matches[0].text).toBe('This is a test node');
      expect(searchService.hasResults()).toBe(true);
    });

    it('should find matches in node annotations', async () => {
      const nodes: TreeNode[] = [
        {
          id: 1,
          text: 'Test node',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: [],
          annotations: [
            {
              text: 'This is a test annotation',
              timestamp: '2023-01-01T00:00:00.000Z'
            }
          ]
        }
      ];
      
      const results = await searchService.performSearch('annotation', nodes, { searchAnnotations: true });
      
      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe(1);
      expect(results[0].matches).toHaveLength(1);
      expect(results[0].matches[0].type).toBe('annotation');
      expect(results[0].matches[0].text).toBe('This is a test annotation');
    });

    it('should prioritize highlighted content over annotations', async () => {
      const nodes: TreeNode[] = [
        {
          id: 1,
          text: 'Priority test content',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: [],
          annotations: [
            {
              text: 'Annotation with test',
              timestamp: '2023-01-01T00:00:00.000Z'
            }
          ]
        }
      ];
      
      const results = await searchService.performSearch('test', nodes, { searchAnnotations: true });
      
      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe(1); // Highlighted content has priority 1
    });

    it('should exclude deleted nodes from search', async () => {
      const nodes: TreeNode[] = [
        {
          id: 1,
          text: 'Deleted test node',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: [],
          deleted: true,
          deletedAt: '2023-01-02T00:00:00.000Z'
        },
        {
          id: 2,
          text: 'Active test node',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        }
      ];
      
      const results = await searchService.performSearch('test', nodes);
      
      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe(2);
    });

    it('should handle case-insensitive search', async () => {
      const nodes: TreeNode[] = [
        {
          id: 1,
          text: 'TEST NODE',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        }
      ];
      
      const results = await searchService.performSearch('test', nodes);
      
      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe(1);
    });
  });

  describe('findMatches', () => {
    it('should find matches in highlighted content when enabled', () => {
      const node: TreeNode = {
        id: 1,
        text: 'Search for this content',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };
      
      searchService['searchOptions'].searchHighlighted = true;
      const matches = searchService['findMatches'](node);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].type).toBe('highlight');
      expect(matches[0].nodeId).toBe(1);
    });

    it('should not find matches in highlighted content when disabled', () => {
      const node: TreeNode = {
        id: 1,
        text: 'Search for this content',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };
      
      searchService['searchOptions'].searchHighlighted = false;
      const matches = searchService['findMatches'](node);
      
      expect(matches).toHaveLength(0);
    });

    it('should find matches in annotations when enabled', () => {
      const node: TreeNode = {
        id: 1,
        text: 'Test node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: [],
        annotations: [
          {
            text: 'Annotation with search term',
            timestamp: '2023-01-01T00:00:00.000Z'
          }
        ]
      };
      
      searchService['searchOptions'].searchAnnotations = true;
      searchService['searchOptions'].searchHighlighted = false; // Disable highlighted search
      const matches = searchService['findMatches'](node);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].type).toBe('annotation');
      expect(matches[0].nodeId).toBe(1);
      expect(matches[0].annotationIndex).toBe(0);
    });

    it('should not find matches in annotations when disabled', () => {
      const node: TreeNode = {
        id: 1,
        text: 'Test node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: [],
        annotations: [
          {
            text: 'Annotation with search term',
            timestamp: '2023-01-01T00:00:00.000Z'
          }
        ]
      };
      
      searchService['searchOptions'].searchAnnotations = false;
      searchService['searchOptions'].searchHighlighted = false; // Disable highlighted search too
      const matches = searchService['findMatches'](node);
      
      expect(matches).toHaveLength(0);
    });

    it('should handle nodes without text or annotations', () => {
      const node: TreeNode = {
        id: 1,
        text: '',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };
      
      const matches = searchService['findMatches'](node);
      
      expect(matches).toHaveLength(0);
    });
  });

  describe('navigation', () => {
    let testNodes: TreeNode[];

    beforeEach(async () => {
      testNodes = [
        {
          id: 1,
          text: 'First test node',
          url: 'https://example.com/1',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        },
        {
          id: 2,
          text: 'Second test node',
          url: 'https://example.com/2',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        },
        {
          id: 3,
          text: 'Third test node',
          url: 'https://example.com/3',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        }
      ];
      
      await searchService.performSearch('test', testNodes);
    });

    describe('navigateToNext', () => {
      it('should navigate to next result', async () => {
        const firstResult = searchService.getCurrentResult();
        expect(firstResult?.nodeId).toBe(1);
        
        const secondResult = await searchService.navigateToNext();
        expect(secondResult?.nodeId).toBe(2);
        
        const thirdResult = await searchService.navigateToNext();
        expect(thirdResult?.nodeId).toBe(3);
        
        // Should wrap around to first result
        const fourthResult = await searchService.navigateToNext();
        expect(fourthResult?.nodeId).toBe(1);
      });

      it('should return null when no results', async () => {
        searchService.clearSearchResults();
        const result = await searchService.navigateToNext();
        expect(result).toBeNull();
      });
    });

    describe('navigateToPrevious', () => {
      it('should navigate to previous result', async () => {
        // Start at first result
        expect(searchService.getCurrentResult()?.nodeId).toBe(1);
        
        // Go to last result (wraps around)
        const lastResult = await searchService.navigateToPrevious();
        expect(lastResult?.nodeId).toBe(3);
        
        // Go back to second result
        const secondResult = await searchService.navigateToPrevious();
        expect(secondResult?.nodeId).toBe(2);
        
        // Go back to first result
        const firstResult = await searchService.navigateToPrevious();
        expect(firstResult?.nodeId).toBe(1);
      });

      it('should return null when no results', async () => {
        searchService.clearSearchResults();
        const result = await searchService.navigateToPrevious();
        expect(result).toBeNull();
      });
    });
  });

  describe('getSearchCounter', () => {
    it('should return "0 of 0" when no results', () => {
      expect(searchService.getSearchCounter()).toBe('0 of 0');
    });

    it('should return correct counter when results exist', async () => {
      const nodes: TreeNode[] = [
        {
          id: 1,
          text: 'Test node',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        }
      ];
      
      await searchService.performSearch('test', nodes);
      expect(searchService.getSearchCounter()).toBe('1 of 1');
    });

    it('should update counter during navigation', async () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'First test', url: 'https://example.com/1', timestamp: '2023-01-01T00:00:00.000Z', parentId: null, children: [] },
        { id: 2, text: 'Second test', url: 'https://example.com/2', timestamp: '2023-01-01T00:00:00.000Z', parentId: null, children: [] }
      ];
      
      await searchService.performSearch('test', nodes);
      expect(searchService.getSearchCounter()).toBe('1 of 2');
      
      await searchService.navigateToNext();
      expect(searchService.getSearchCounter()).toBe('2 of 2');
    });
  });

  describe('clearSearchResults', () => {
    it('should clear all search results and reset state', async () => {
      const nodes: TreeNode[] = [
        {
          id: 1,
          text: 'Test node',
          url: 'https://example.com',
          timestamp: '2023-01-01T00:00:00.000Z',
          parentId: null,
          children: []
        }
      ];
      
      await searchService.performSearch('test', nodes);
      expect(searchService.hasResults()).toBe(true);
      
      searchService.clearSearchResults();
      expect(searchService.hasResults()).toBe(false);
      expect(searchService.getSearchCounter()).toBe('0 of 0');
      expect(searchService['searchQuery']).toBe('');
    });
  });

  describe('getMatchingNodeIds', () => {
    it('should return set of matching node IDs', async () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Match one', url: 'https://example.com/1', timestamp: '2023-01-01T00:00:00.000Z', parentId: null, children: [] },
        { id: 2, text: 'No result', url: 'https://example.com/2', timestamp: '2023-01-01T00:00:00.000Z', parentId: null, children: [] },
        { id: 3, text: 'Match two', url: 'https://example.com/3', timestamp: '2023-01-01T00:00:00.000Z', parentId: null, children: [] }
      ];
      
      await searchService.performSearch('match', nodes);
      const matchingIds = searchService.getMatchingNodeIds();
      
      expect(matchingIds).toBeInstanceOf(Set);
      expect(matchingIds.size).toBe(2);
      expect(matchingIds.has(1)).toBe(true);
      expect(matchingIds.has(3)).toBe(true);
      expect(matchingIds.has(2)).toBe(false);
    });

    it('should return empty set when no results', () => {
      const matchingIds = searchService.getMatchingNodeIds();
      expect(matchingIds).toBeInstanceOf(Set);
      expect(matchingIds.size).toBe(0);
    });
  });

  describe('updateOptions', () => {
    it('should update search options', () => {
      const newOptions = {
        searchHighlighted: false,
        searchAnnotations: false,
        filterMode: true
      };
      
      searchService.updateOptions(newOptions);
      const options = searchService.getOptions();
      
      expect(options.searchHighlighted).toBe(false);
      expect(options.searchAnnotations).toBe(false);
      expect(options.filterMode).toBe(true);
    });

    it('should merge partial options', () => {
      searchService.updateOptions({ filterMode: true });
      const options = searchService.getOptions();
      
      expect(options.filterMode).toBe(true);
      expect(options.searchHighlighted).toBe(true); // Default value
      expect(options.searchAnnotations).toBe(true); // Default value
    });
  });

  describe('getQuery', () => {
    it('should return current search query', async () => {
      const nodes: TreeNode[] = [];
      await searchService.performSearch('test query', nodes);
      
      expect(searchService.getQuery()).toBe('test query');
    });

    it('should return empty string when no query', () => {
      expect(searchService.getQuery()).toBe('');
    });
  });
});
