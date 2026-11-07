/**
 * @jest-environment jsdom
 */

// Load component file that creates window.treeContainer
require('../components/treeContainer');

// Extract class from window object
const TreeContainerClass = (global as any).window.CitationLinker?.treeContainer?.constructor || (global as any).window.treeContainer?.constructor;

describe('TreeContainer', () => {
  let treeContainer: any;
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
    treeContainer = new TreeContainerClass();
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

  describe('drag and drop (delegated on #tree-root)', () => {
    // Real TreeNode + TreeContainer rendering of:
    //   1
    //   ├─ 2
    //   └─ 3
    //   4
    const nodes = () => [
      { id: 1, text: 'One', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2, 3] },
      { id: 2, text: 'Two', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] },
      { id: 3, text: 'Three', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 1, children: [] },
      { id: 4, text: 'Four', url: 'https://example.com/4', timestamp: '2023-01-01', parentId: null, children: [] }
    ];

    let root: HTMLElement;

    const row = (id: number) =>
      root.querySelector(`.tree-node[data-node-id="${id}"] > .tree-node-row`) as HTMLElement;
    const wrapper = (id: number) =>
      root.querySelector(`.tree-node[data-node-id="${id}"]`) as HTMLElement;

    const fire = (target: Element, type: string, props: Record<string, any> = {}) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.entries(props).forEach(([k, v]) => Object.defineProperty(ev, k, { value: v }));
      target.dispatchEvent(ev);
      return ev;
    };
    const dataTransfer = (data: Record<string, string> = {}) => ({
      setData: jest.fn((type: string, value: string) => { data[type] = value; }),
      getData: jest.fn((type: string) => data[type] || ''),
      effectAllowed: '',
      dropEffect: ''
    });
    // rows are 40px tall at y = 100
    const placeRows = () => {
      root.querySelectorAll('.tree-node-row').forEach(r => {
        (r as HTMLElement).getBoundingClientRect = () =>
          ({ top: 100, bottom: 140, height: 40, left: 0, right: 300, width: 300, x: 0, y: 100, toJSON() {} } as DOMRect);
      });
    };

    const startDrag = (id: number) => {
      const dt = dataTransfer();
      fire(row(id), 'mousedown');
      const ev = fire(row(id), 'dragstart', { dataTransfer: dt });
      return { ev, dt };
    };

    beforeEach(async () => {
      require('../components/treeNode');
      (global as any).TreeNode = (window as any).TreeNode;
      const realService = {
        getChildNodes: (all: any[], parentId: number | null) =>
          all.filter(n => n.parentId === parentId && !n.deleted)
      };
      mockTreeService.getChildNodes.mockImplementation(realService.getChildNodes);
      mockTreeService.getTree.mockResolvedValue({ nodes: nodes(), currentNodeId: null });
      mockTreeService.moveNode = jest.fn().mockResolvedValue(true);
      mockTreeService.moveNodeRelative = jest.fn().mockResolvedValue(true);
      mockTreeService.moveNodeToRoot = jest.fn().mockResolvedValue(true);

      treeContainer.initialize();
      await treeContainer.loadAndDisplayTree();
      root = document.getElementById('tree-root')!;
      placeRows();
    });

    it('renders nested children inside the parent wrapper, not inside the row', () => {
      expect(wrapper(1).querySelector(':scope > .tree-children > .tree-node[data-node-id="2"]')).not.toBeNull();
      expect(row(1).querySelector('.tree-node')).toBeNull();
    });

    it('getDropPosition splits a row into before / inside / after zones', () => {
      expect(TreeContainerClass.getDropPosition(2, 40)).toBe('before');
      expect(TreeContainerClass.getDropPosition(20, 40)).toBe('inside');
      expect(TreeContainerClass.getDropPosition(38, 40)).toBe('after');
    });

    it('dragstart sets the drag data synchronously and marks the node', () => {
      const { ev, dt } = startDrag(2);

      expect(ev.defaultPrevented).toBe(false);
      expect(dt.setData).toHaveBeenCalledWith('text/plain', '2');
      expect(dt.effectAllowed).toBe('move');
      expect((window as any).currentDraggedNodeId).toBe(2);
      expect(wrapper(2).classList.contains('dragging')).toBe(true);
      // the parent is not affected by the child's drag
      expect(wrapper(1).classList.contains('dragging')).toBe(false);
    });

    it('a drag that starts on a button inside the row is cancelled', () => {
      const btn = row(4).querySelector('.node-delete-button') as HTMLElement;
      fire(btn, 'mousedown');
      const ev = fire(row(4), 'dragstart', { dataTransfer: dataTransfer() });

      expect(ev.defaultPrevented).toBe(true);
      expect((window as any).currentDraggedNodeId).toBeNull();
    });

    it('dragover shows before / inside / after indicators and allows the drop', () => {
      startDrag(4);

      let ev = fire(row(1), 'dragover', { clientY: 102, dataTransfer: dataTransfer() });
      expect(ev.defaultPrevented).toBe(true);
      expect(wrapper(1).classList.contains('drop-before')).toBe(true);

      ev = fire(row(1), 'dragover', { clientY: 120, dataTransfer: dataTransfer() });
      expect(wrapper(1).classList.contains('drop-before')).toBe(false);
      expect(wrapper(1).classList.contains('drop-inside')).toBe(true);

      // "after" a parent whose children are shown = before its first child
      fire(row(1), 'dragover', { clientY: 138, dataTransfer: dataTransfer() });
      expect(wrapper(1).classList.contains('drop-inside')).toBe(false);
      expect(wrapper(2).classList.contains('drop-before')).toBe(true);
      expect(root.querySelectorAll('.drop-before, .drop-after, .drop-inside')).toHaveLength(1);
    });

    it('refuses to drop a node onto itself or its descendants', () => {
      startDrag(1);

      const onSelf = fire(row(1), 'dragover', { clientY: 120, dataTransfer: dataTransfer() });
      const onChild = fire(row(3), 'dragover', { clientY: 120, dataTransfer: dataTransfer() });

      expect(onSelf.defaultPrevented).toBe(false);
      expect(onChild.defaultPrevented).toBe(false);
      expect(root.querySelector('.drop-inside')).toBeNull();
    });

    it('ignores drags that did not start on a tree node (e.g. tabs or files)', () => {
      const ev = fire(row(1), 'dragover', { clientY: 120, dataTransfer: dataTransfer() });
      expect(ev.defaultPrevented).toBe(false);
    });

    it('dropping in the middle of a node makes the dragged node its child', async () => {
      const { dt } = startDrag(4);
      fire(row(3), 'dragover', { clientY: 120, dataTransfer: dt });
      fire(row(3), 'drop', { clientY: 120, dataTransfer: dt });
      await new Promise(r => setTimeout(r, 0));

      expect(mockTreeService.moveNode).toHaveBeenCalledWith(4, 3);
    });

    it('dropping on the top edge of a node reorders before it', async () => {
      const { dt } = startDrag(3);
      fire(row(2), 'dragover', { clientY: 101, dataTransfer: dt });
      fire(row(2), 'drop', { clientY: 101, dataTransfer: dt });
      await new Promise(r => setTimeout(r, 0));

      expect(mockTreeService.moveNodeRelative).toHaveBeenCalledWith(3, 2, 'before');
    });

    it('dropping on the bottom edge of a leaf reorders after it', async () => {
      const { dt } = startDrag(2);
      fire(row(4), 'dragover', { clientY: 139, dataTransfer: dt });
      fire(row(4), 'drop', { clientY: 139, dataTransfer: dt });
      await new Promise(r => setTimeout(r, 0));

      expect(mockTreeService.moveNodeRelative).toHaveBeenCalledWith(2, 4, 'after');
    });

    it('dropping on empty space moves the node to the top level', async () => {
      const { dt } = startDrag(2);
      const over = fire(root, 'dragover', { clientY: 500, dataTransfer: dt });
      expect(over.defaultPrevented).toBe(true);
      expect(root.classList.contains('drag-over-background')).toBe(true);

      fire(root, 'drop', { clientY: 500, dataTransfer: dt });
      await new Promise(r => setTimeout(r, 0));

      expect(mockTreeService.moveNodeToRoot).toHaveBeenCalledWith(2);
      expect(root.classList.contains('drag-over-background')).toBe(false);
    });

    it('dragend clears every piece of drag state', () => {
      startDrag(4);
      fire(row(1), 'dragover', { clientY: 120, dataTransfer: dataTransfer() });
      fire(row(4), 'dragend');

      expect(root.querySelector('.dragging, .drop-before, .drop-after, .drop-inside')).toBeNull();
      expect(root.classList.contains('is-dragging')).toBe(false);
      expect((window as any).currentDraggedNodeId).toBeNull();
      expect((window as any).currentDragState).toBeNull();
    });

    it('does not duplicate listeners across re-renders and repeated initialize()', async () => {
      treeContainer.initialize();
      treeContainer.initialize();
      mockTreeService.getTree.mockResolvedValue({ nodes: [...nodes(), { id: 5, text: 'Five', url: 'https://example.com/5', timestamp: '2023-01-01', parentId: null, children: [] }], currentNodeId: null });
      await treeContainer.refresh();
      placeRows();

      const { dt } = startDrag(4);
      fire(row(3), 'dragover', { clientY: 120, dataTransfer: dt });
      fire(row(3), 'drop', { clientY: 120, dataTransfer: dt });
      await new Promise(r => setTimeout(r, 0));

      expect(mockTreeService.moveNode).toHaveBeenCalledTimes(1);
      expect((browser.storage.onChanged.addListener as jest.Mock).mock.calls.length).toBe(1);
    });

    it('defers re-rendering while a drag is in progress', async () => {
      startDrag(4);
      const before = row(1);
      mockTreeService.getTree.mockResolvedValue({ nodes: nodes().slice(0, 3), currentNodeId: null });
      await treeContainer.refresh();
      expect(row(1)).toBe(before); // DOM untouched mid-drag

      fire(row(4), 'dragend');
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));
      expect(wrapper(4)).toBeNull(); // pending refresh ran after the drag
    });

    it('only updates the highlight when nothing but currentNodeId changed', async () => {
      const before = row(2);
      mockTreeService.getTree.mockResolvedValue({ nodes: nodes(), currentNodeId: 2 });
      await treeContainer.refresh();

      expect(row(2)).toBe(before);
      expect(wrapper(2).classList.contains('current')).toBe(true);
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
