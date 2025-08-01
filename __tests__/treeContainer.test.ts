/**
 * @jest-environment jsdom
 */

import { TreeContainer } from '../components/treeContainer';

describe('TreeContainer', () => {
  let treeContainer: TreeContainer;
  let mockTreeService: any;
  let mockTreeValidationService: any;

  beforeEach(() => {
    // Clear document body
    document.body.innerHTML = `
      <div id="tree-root"></div>
      <div class="tree-container"></div>
    `;

    // Clear mocks
    jest.clearAllMocks();

    // Mock console
    global.console = {
      ...global.console,
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock browser storage
    (global as any).browser = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined)
        },
        onChanged: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        }
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 1 }]),
        update: jest.fn().mockResolvedValue(undefined)
      },
      runtime: {
        onMessage: {
          addListener: jest.fn()
        }
      }
    };

    // Mock services
    mockTreeService = {
      getTree: jest.fn().mockResolvedValue({ nodes: [], currentNodeId: null }),
      getVisibleNodes: jest.fn().mockReturnValue([]),
      getChildNodes: jest.fn().mockReturnValue([]),
      moveNodeToRoot: jest.fn().mockResolvedValue(true)
    };

    mockTreeValidationService = {
      repairTreeIntegrity: jest.fn().mockImplementation((tree) => Promise.resolve(tree))
    };

    // Mock sync manager
    const mockSyncManager = {
      markAsModified: jest.fn()
    };

    // Mock formatters
    const mockFormatters = {
      truncateText: jest.fn().mockImplementation((text) => text),
      formatTimestamp: jest.fn().mockImplementation((timestamp) => timestamp)
    };

    // Mock button creation functions
    const mockCreateAnnotationButton = jest.fn().mockReturnValue(document.createElement('div'));
    const mockCreateDeleteButton = jest.fn().mockReturnValue(document.createElement('button'));

    // Mock window functions
    (window as any).treeService = mockTreeService;
    (window as any).treeValidationService = mockTreeValidationService;
    (window as any).syncManager = mockSyncManager;
    (window as any).syncInitialized = true;
    (window as any).authManager = { isLoggedIn: jest.fn().mockReturnValue(true) };
    (window as any).currentDraggedNodeId = null;
    (window as any).formatters = mockFormatters;
    (window as any).createAnnotationButton = mockCreateAnnotationButton;
    (window as any).createDeleteButton = mockCreateDeleteButton;

    // Create new TreeContainer instance
    treeContainer = new TreeContainer();
  });

  describe('initialize', () => {
    it('should initialize successfully with tree root element', () => {
      treeContainer.initialize();
      
      expect(treeContainer['treeRoot']).toBeTruthy();
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle missing tree root element', () => {
      document.body.innerHTML = ''; // Remove tree-root
      
      treeContainer.initialize();
      
      expect(console.error).toHaveBeenCalledWith('Tree root element not found');
    });

    it('should setup background drop only once', () => {
      treeContainer.initialize();
      const firstSetup = treeContainer['backgroundDropSetup'];
      
      treeContainer.initialize(); // Call again
      const secondSetup = treeContainer['backgroundDropSetup'];
      
      expect(firstSetup).toBe(true);
      expect(secondSetup).toBe(true);
    });
  });

  describe('loadAndDisplayTree', () => {
    beforeEach(() => {
      treeContainer.initialize();
    });

    it('should display empty state when no nodes exist', async () => {
      mockTreeService.getTree.mockResolvedValue({ nodes: [], currentNodeId: null });
      mockTreeService.getVisibleNodes.mockReturnValue([]);
      
      await treeContainer.loadAndDisplayTree();
      
      const treeRoot = document.getElementById('tree-root');
      expect(treeRoot?.innerHTML).toContain('No citations saved yet');
    });

    it('should display error state when tree loading fails', async () => {
      mockTreeService.getTree.mockRejectedValue(new Error('Load failed'));
      
      await treeContainer.loadAndDisplayTree();
      
      const treeRoot = document.getElementById('tree-root');
      expect(treeRoot?.innerHTML).toContain('Error loading research tree');
      expect(console.error).toHaveBeenCalledWith('Error loading tree:', expect.any(Error));
    });

    it('should render tree when nodes exist', async () => {
      const mockTree = {
        nodes: [{ id: 1, text: 'Test Node', url: 'https://example.com', timestamp: '2023-01-01' }],
        currentNodeId: 1
      };
      mockTreeService.getTree.mockResolvedValue(mockTree);
      mockTreeService.getVisibleNodes.mockReturnValue(mockTree.nodes);
      mockTreeService.getChildNodes.mockReturnValue(mockTree.nodes);
      
      await treeContainer.loadAndDisplayTree();
      
      const treeRoot = document.getElementById('tree-root');
      expect(treeRoot?.innerHTML).not.toContain('No citations saved yet');
      expect(treeRoot?.innerHTML).not.toContain('Error loading research tree');
    });

    it('should validate and repair tree before rendering', async () => {
      const mockTree = { nodes: [], currentNodeId: null };
      const repairedTree = { nodes: [], currentNodeId: null, repaired: false, repairs: [] };
      mockTreeService.getTree.mockResolvedValue(mockTree);
      mockTreeValidationService.repairTreeIntegrity.mockResolvedValue(repairedTree);
      mockTreeService.getVisibleNodes.mockReturnValue([]);
      
      await treeContainer.loadAndDisplayTree();
      
      expect(mockTreeValidationService.repairTreeIntegrity).toHaveBeenCalledWith(mockTree);
    });
  });

  describe('showEmptyState', () => {
    beforeEach(() => {
      treeContainer.initialize();
    });

    it('should display empty state message', () => {
      const treeRoot = document.getElementById('tree-root');
      treeRoot!.innerHTML = '';
      
      const showEmptyState = (treeContainer as any)['showEmptyState'].bind(treeContainer);
      showEmptyState();
      
      expect(treeRoot?.innerHTML).toContain('No citations saved yet');
    });
  });

  describe('showErrorState', () => {
    beforeEach(() => {
      treeContainer.initialize();
    });

    it('should display error state message', () => {
      const treeRoot = document.getElementById('tree-root');
      treeRoot!.innerHTML = '';
      
      const showErrorState = (treeContainer as any)['showErrorState'].bind(treeContainer);
      showErrorState();
      
      expect(treeRoot?.innerHTML).toContain('Error loading research tree');
    });
  });

  describe('renderTree', () => {
    beforeEach(() => {
      treeContainer.initialize();
    });

    it('should render empty container when no child nodes', () => {
      mockTreeService.getChildNodes.mockReturnValue([]);
      
      const renderTree = (treeContainer as any)['renderTree'].bind(treeContainer);
      const container = renderTree([], 1, null);
      
      expect(container).toBeInstanceOf(HTMLElement);
      expect(container.children).toHaveLength(0);
    });

    it('should render tree nodes with children', () => {
      const mockNodes = [
        { id: 1, text: 'Parent', url: 'https://example.com', timestamp: '2023-01-01', parentId: null, children: [2] },
        { id: 2, text: 'Child', url: 'https://example.com', timestamp: '2023-01-01', parentId: 1, children: [] }
      ];
      
      // Mock getChildNodes to return appropriate children for each parent
      mockTreeService.getChildNodes.mockImplementation((nodes: any, parentId: any) => {
        if (parentId === null) {
          return [mockNodes[0]]; // Return parent node for root level
        } else if (parentId === 1) {
          return [mockNodes[1]]; // Return child node for parent 1
        }
        return [];
      });

      // Mock TreeNode constructor to return a mock element
      const mockTreeNodeElement = document.createElement('div');
      mockTreeNodeElement.className = 'tree-node';
      mockTreeNodeElement.textContent = 'Mock Node';
      
      // Mock the TreeNode class to return a new element each time
      (global as any).TreeNode = jest.fn().mockImplementation(() => ({
        createElement: jest.fn().mockImplementation(() => {
          const element = document.createElement('div');
          element.className = 'tree-node';
          element.textContent = 'Mock Node';
          return element;
        })
      }));
      
      const renderTree = (treeContainer as any)['renderTree'].bind(treeContainer);
      const container = renderTree(mockNodes, 1, null);
      
      expect(container).toBeInstanceOf(HTMLElement);
      expect(container.children).toHaveLength(1);
    });
  });

  describe('setupBackgroundDrop', () => {
    beforeEach(() => {
      treeContainer.initialize();
    });

    it('should handle dragover event on tree container', () => {
      (window as any).currentDraggedNodeId = 1; // Set dragged node
      
      const treeContainerElement = document.querySelector('.tree-container');
      const dragEvent = new Event('dragover');
      Object.defineProperty(dragEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(dragEvent, 'stopPropagation', { value: jest.fn() });
      Object.defineProperty(dragEvent, 'target', { value: treeContainerElement });
      
      treeContainerElement?.dispatchEvent(dragEvent);
      
      // Should prevent default when dragging a node over background
      expect(dragEvent.preventDefault).toHaveBeenCalled();
      expect(dragEvent.stopPropagation).toHaveBeenCalled();
    });

    it('should handle drop event on tree container background', async () => {
      (window as any).currentDraggedNodeId = 1;
      
      const treeContainerElement = document.querySelector('.tree-container');
      const dropEvent = new Event('drop');
      Object.defineProperty(dropEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(dropEvent, 'stopPropagation', { value: jest.fn() });
      Object.defineProperty(dropEvent, 'target', { value: treeContainerElement });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: jest.fn().mockReturnValue('1') }
      });
      
      treeContainerElement?.dispatchEvent(dropEvent);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(dropEvent.preventDefault).toHaveBeenCalled();
      expect(mockTreeService.moveNodeToRoot).toHaveBeenCalledWith(1);
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      treeContainer.initialize();
    });

    it('should call loadAndDisplayTree', async () => {
      const loadAndDisplaySpy = jest.spyOn(treeContainer, 'loadAndDisplayTree');
      
      await treeContainer.refresh();
      
      expect(loadAndDisplaySpy).toHaveBeenCalled();
    });
  });
});
