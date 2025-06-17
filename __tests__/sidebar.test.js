/**
 * @jest-environment jsdom
 */

let formatTimestamp, truncateText, createTreeNodeElement, renderTree, loadAndDisplayTree, 
    setupBackgroundDrop, moveNodeToRoot, moveNode, showContextMenu, shiftNodeToParent,
    showImageModal;

beforeEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  
  // Mock browser APIs
  global.browser = {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({
          citationTree: { nodes: [], currentNodeId: null }
        }),
        set: jest.fn().mockResolvedValue()
      },
      onChanged: {
        addListener: jest.fn()
      }
    },
    tabs: {
      query: jest.fn().mockResolvedValue([{ id: 1, active: true }]),
      update: jest.fn().mockResolvedValue()
    },
    runtime: {
      onMessage: {
        addListener: jest.fn()
      },
      sendMessage: jest.fn().mockResolvedValue({ success: true })
    }
  };
  
  global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };
  
  // Mock required global functions
  global.createDeleteButton = jest.fn().mockReturnValue(document.createElement('button'));
  global.createAnnotationButton = jest.fn().mockReturnValue(document.createElement('div'));
  
  const fs = require('fs');
  const path = require('path');
  const scriptContent = fs.readFileSync(path.join(__dirname, '../sidebar.js'), 'utf8');
  
  // Execute the script in the global context using vm
  const vm = require('vm');
  const context = {
    window: global.window || {},
    document: global.document,
    console: global.console,
    browser: global.browser,
    Date: global.Date,
    URL: global.URL,
    Event: global.Event,
    setTimeout: global.setTimeout,
    createDeleteButton: global.createDeleteButton,
    createAnnotationButton: global.createAnnotationButton
  };
  vm.createContext(context);
  vm.runInContext(scriptContent, context);
  
  formatTimestamp = context.formatTimestamp;
  truncateText = context.truncateText;
  createTreeNodeElement = context.createTreeNodeElement;
  renderTree = context.renderTree;
  loadAndDisplayTree = context.loadAndDisplayTree;
  setupBackgroundDrop = context.setupBackgroundDrop;
  moveNodeToRoot = context.moveNodeToRoot;
  moveNode = context.moveNode;
  showContextMenu = context.showContextMenu;
  shiftNodeToParent = context.shiftNodeToParent;
  showImageModal = context.showImageModal;
});

describe('Sidebar', () => {
  describe('formatTimestamp', () => {
    it('should format timestamp correctly', () => {
      const timestamp = '2023-01-15T14:30:00.000Z';
      const formatted = formatTimestamp(timestamp);
      expect(typeof formatted).toBe('string');
      expect(formatted).toMatch(/Jan 15/);
    });
  });

  describe('truncateText', () => {
    it('should truncate text longer than maxLength', () => {
      const longText = 'a'.repeat(150);
      const truncated = truncateText(longText, 100);
      expect(truncated).toHaveLength(103); // 100 + '...'
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('should not truncate text shorter than maxLength', () => {
      const shortText = 'Short text';
      const result = truncateText(shortText, 100);
      expect(result).toBe(shortText);
    });

    it('should use default maxLength of 100', () => {
      const longText = 'a'.repeat(150);
      const truncated = truncateText(longText);
      expect(truncated).toHaveLength(103);
    });
  });

  describe('createTreeNodeElement', () => {
    it('should create tree node element with correct structure', () => {
      const node = {
        id: 1,
        text: 'Test node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        children: []
      };
      
      const element = createTreeNodeElement(node, false);
      
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('tree-node ');
      expect(element.dataset.nodeId).toBe('1');
      expect(element.draggable).toBe(true);
    });

    it('should mark current node with current class', () => {
      const node = {
        id: 1,
        text: 'Current node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        children: []
      };
      
      const element = createTreeNodeElement(node, true);
      
      expect(element.className).toBe('tree-node current');
    });

    it('should include node text content', () => {
      const node = {
        id: 1,
        text: 'Test node content',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        children: []
      };
      
      const element = createTreeNodeElement(node, false);
      const contentElement = element.querySelector('.tree-node-content');
      
      expect(contentElement.textContent).toBe('Test node content');
    });

    it('should include meta information', () => {
      const node = {
        id: 1,
        text: 'Test node',
        url: 'https://example.com/path',
        timestamp: '2023-01-15T14:30:00.000Z',
        children: []
      };
      
      const element = createTreeNodeElement(node, false);
      const metaElement = element.querySelector('.tree-node-meta');
      
      const urlElement = metaElement.querySelector('.tree-node-url');
      expect(urlElement.textContent).toBe('example.com');
      expect(urlElement.title).toBe('https://example.com/path');
    });

    it('should include images if node has images', () => {
      const node = {
        id: 1,
        text: 'Node with images',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        images: ['data:image/png;base64,test1', 'data:image/png;base64,test2'],
        children: []
      };
      
      const element = createTreeNodeElement(node, false);
      const imagesContainer = element.querySelector('.tree-node-images');
      
      expect(imagesContainer).not.toBeNull();
      const images = imagesContainer.querySelectorAll('.tree-node-image-thumbnail');
      expect(images).toHaveLength(2);
      expect(images[0].src).toBe('data:image/png;base64,test1');
      expect(images[1].src).toBe('data:image/png;base64,test2');
    });

    it('should include delete and annotation buttons', () => {
      const node = {
        id: 1,
        text: 'Test node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        children: []
      };
      
      createTreeNodeElement(node, false);
      
      expect(global.createDeleteButton).toHaveBeenCalledWith(node);
      expect(global.createAnnotationButton).toHaveBeenCalledWith(node);
    });

    it('should handle drag events', () => {
      const node = {
        id: 1,
        text: 'Draggable node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        children: []
      };
      
      const element = createTreeNodeElement(node, false);
      
      // Mock dataTransfer
      const mockDataTransfer = {
        setData: jest.fn(),
        effectAllowed: ''
      };
      
      const dragStartEvent = new Event('dragstart');
      Object.defineProperty(dragStartEvent, 'dataTransfer', {
        value: mockDataTransfer
      });
      
      element.dispatchEvent(dragStartEvent);
      
      expect(mockDataTransfer.setData).toHaveBeenCalledWith('text/plain', '1');
      expect(mockDataTransfer.effectAllowed).toBe('move');
      expect(element.classList.contains('dragging')).toBe(true);
      expect(window.currentDraggedNodeId).toBe(1);
    });

    it('should handle navigation on double-click', async () => {
      const node = {
        id: 1,
        text: 'Clickable node',
        url: 'https://example.com/target',
        timestamp: '2023-01-01T00:00:00.000Z',
        children: []
      };
      
      const element = createTreeNodeElement(node, false);
      
      const dblClickEvent = new Event('dblclick');
      Object.defineProperty(dblClickEvent, 'preventDefault', {
        value: jest.fn()
      });
      Object.defineProperty(dblClickEvent, 'stopPropagation', {
        value: jest.fn()
      });
      
      element.dispatchEvent(dblClickEvent);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(browser.tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com/target' });
      expect(browser.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('renderTree', () => {
    it('should render tree structure correctly', () => {
      const nodes = [
        { id: 1, text: 'Root', parentId: null, children: [2], url: 'https://example.com/root', timestamp: '2023-01-01T00:00:00.000Z' },
        { id: 2, text: 'Child', parentId: 1, children: [], url: 'https://example.com/child', timestamp: '2023-01-01T00:00:00.000Z' }
      ];
      
      const container = renderTree(nodes, 1);
      
      expect(container).toBeInstanceOf(HTMLElement);
      const rootNodes = container.querySelectorAll('.tree-node');
      expect(rootNodes.length).toBeGreaterThan(0);
    });

    it('should handle empty node list', () => {
      const container = renderTree([], null);
      
      expect(container).toBeInstanceOf(HTMLElement);
      expect(container.children).toHaveLength(0);
    });

    it('should render nested children', () => {
      const nodes = [
        { id: 1, text: 'Root', parentId: null, children: [2], url: 'https://example.com/root', timestamp: '2023-01-01T00:00:00.000Z' },
        { id: 2, text: 'Child', parentId: 1, children: [3], url: 'https://example.com/child', timestamp: '2023-01-01T00:00:00.000Z' },
        { id: 3, text: 'Grandchild', parentId: 2, children: [], url: 'https://example.com/grandchild', timestamp: '2023-01-01T00:00:00.000Z' }
      ];
      
      const container = renderTree(nodes, 1);
      
      const childrenContainer = container.querySelector('.tree-children');
      expect(childrenContainer).not.toBeNull();
    });
  });

  describe('loadAndDisplayTree', () => {
    it('should display empty state when no nodes exist', async () => {
      document.body.innerHTML = '<div id="tree-root"></div>';
      
      browser.storage.local.get.mockResolvedValue({
        citationTree: { nodes: [], currentNodeId: null }
      });
      
      await loadAndDisplayTree();
      
      const treeRoot = document.getElementById('tree-root');
      expect(treeRoot.innerHTML).toContain('No citations saved yet');
    });

    it('should render tree when nodes exist', async () => {
      document.body.innerHTML = '<div id="tree-root"></div>';
      
      const mockTree = {
        nodes: [
          { id: 1, text: 'Test node', parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await loadAndDisplayTree();
      
      const treeRoot = document.getElementById('tree-root');
      expect(treeRoot.innerHTML).not.toContain('No citations saved yet');
    });

    it('should handle storage errors', async () => {
      document.body.innerHTML = '<div id="tree-root"></div>';
      
      browser.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      await loadAndDisplayTree();
      
      const treeRoot = document.getElementById('tree-root');
      expect(treeRoot.innerHTML).toContain('Error loading research tree');
      expect(console.error).toHaveBeenCalledWith('Error loading tree:', expect.any(Error));
    });

    it('should return early if tree-root element not found', async () => {
      // No tree-root element in DOM
      
      await loadAndDisplayTree();
      
      // Should not call storage or throw errors
      expect(browser.storage.local.get).not.toHaveBeenCalled();
    });
  });

  describe('moveNode', () => {
    it('should move node to new parent', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Parent 1', children: [2], parentId: null },
          { id: 2, text: 'Child to move', children: [], parentId: 1 },
          { id: 3, text: 'Parent 2', children: [], parentId: null }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await moveNode(2, 3);
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, children: [] }),
            expect.objectContaining({ id: 2, parentId: 3 }),
            expect.objectContaining({ id: 3, children: [2] })
          ])
        })
      });
    });

    it('should prevent moving node to its descendant', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Parent', children: [2], parentId: null },
          { id: 2, text: 'Child', children: [3], parentId: 1 },
          { id: 3, text: 'Grandchild', children: [], parentId: 2 }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await moveNode(1, 3); // Try to move parent to its grandchild
      
      expect(console.warn).toHaveBeenCalledWith('Cannot move node to its descendant');
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle missing nodes gracefully', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Node', children: [], parentId: null }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await moveNode(999, 888); // Non-existent nodes
      
      expect(console.error).toHaveBeenCalledWith('Could not find dragged or target node');
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('moveNodeToRoot', () => {
    it('should move node to root level', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Parent', children: [2], parentId: null },
          { id: 2, text: 'Child to move', children: [], parentId: 1 }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await moveNodeToRoot(2);
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, children: [] }),
            expect.objectContaining({ id: 2, parentId: null })
          ])
        })
      });
    });

    it('should handle node not found', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Node', children: [], parentId: null }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await moveNodeToRoot(999);
      
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('shiftNodeToParent', () => {
    it('should shift node up to parent level', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Grandparent', children: [2], parentId: null },
          { id: 2, text: 'Parent', children: [3], parentId: 1 },
          { id: 3, text: 'Child to shift', children: [], parentId: 2 }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await shiftNodeToParent(3);
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, children: [2, 3] }),
            expect.objectContaining({ id: 2, children: [] }),
            expect.objectContaining({ id: 3, parentId: 1 })
          ])
        })
      });
    });

    it('should handle node with no parent', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Root node', children: [], parentId: null }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });
      
      await shiftNodeToParent(1);
      
      expect(console.log).toHaveBeenCalledWith('Node has no parent to shift up to');
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('showImageModal', () => {
    it('should create and display image modal', () => {
      const imageData = 'data:image/png;base64,test';
      
      showImageModal(imageData);
      
      const modal = document.querySelector('.image-modal');
      expect(modal).not.toBeNull();
      
      const modalContent = modal.querySelector('.image-modal-content');
      expect(modalContent).not.toBeNull();
      
      const image = modalContent.querySelector('.modal-image');
      expect(image.src).toBe(imageData);
      
      const closeButton = modalContent.querySelector('.modal-close');
      expect(closeButton.textContent).toBe('×');
    });

    it('should close modal when clicking close button', () => {
      const imageData = 'data:image/png;base64,test';
      
      showImageModal(imageData);
      
      const closeButton = document.querySelector('.modal-close');
      closeButton.click();
      
      const modal = document.querySelector('.image-modal');
      expect(modal).toBeNull();
    });

    it('should close modal when clicking background', () => {
      const imageData = 'data:image/png;base64,test';
      
      showImageModal(imageData);
      
      const modal = document.querySelector('.image-modal');
      modal.click();
      
      expect(document.querySelector('.image-modal')).toBeNull();
    });
  });

  describe('showContextMenu', () => {
    it('should show context menu for node with parent', () => {
      const node = { id: 2, text: 'Child node', parentId: 1 };
      const event = { clientX: 100, clientY: 200 };
      
      showContextMenu(event, node);
      
      const contextMenu = document.querySelector('.context-menu');
      expect(contextMenu).not.toBeNull();
      expect(contextMenu.style.left).toBe('100px');
      expect(contextMenu.style.top).toBe('200px');
      
      const shiftUpOption = contextMenu.querySelector('.context-menu-item');
      expect(shiftUpOption.textContent).toBe('Shift out');
    });

    it('should not show shift up option for root node', () => {
      const node = { id: 1, text: 'Root node', parentId: null };
      const event = { clientX: 100, clientY: 200 };
      
      showContextMenu(event, node);
      
      const contextMenu = document.querySelector('.context-menu');
      expect(contextMenu).not.toBeNull();
      
      const shiftUpOption = contextMenu.querySelector('.context-menu-item');
      expect(shiftUpOption).toBeNull();
    });

    it('should remove existing context menu before showing new one', () => {
      const node = { id: 1, text: 'Node', parentId: null };
      const event = { clientX: 100, clientY: 200 };
      
      // Create existing context menu
      const existingMenu = document.createElement('div');
      existingMenu.className = 'context-menu';
      document.body.appendChild(existingMenu);
      
      showContextMenu(event, node);
      
      const contextMenus = document.querySelectorAll('.context-menu');
      expect(contextMenus).toHaveLength(1);
    });
  });

  describe('Event listeners', () => {
    it('should register storage change listener', () => {
      expect(browser.storage.onChanged.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle storage changes', () => {
      const callback = browser.storage.onChanged.addListener.mock.calls[0][0];
      const changes = { citationTree: { newValue: { nodes: [] } } };
      
      // Just test that the callback exists and can be called without errors
      expect(() => callback(changes, 'local')).not.toThrow();
    });
  });
});
