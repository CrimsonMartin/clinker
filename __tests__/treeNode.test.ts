/**
 * @jest-environment jsdom
 */

import { TreeNode } from '../components/treeNode';

// Define the TreeNodeType interface inline to avoid import conflicts
interface TreeNodeType {
  id: number;
  text: string;
  url: string;
  timestamp: string;
  parentId: number | null;
  children: number[];
  deleted?: boolean;
  deletedAt?: string;
  annotations?: Array<{
    id: string;
    text: string;
    timestamp: string;
    audioUrl?: string;
  }>;
  images?: string[];
}

describe('TreeNode', () => {
  let mockFormatters: any;
  let mockCreateAnnotationButton: jest.Mock;
  let mockCreateDeleteButton: jest.Mock;
  let mockTreeService: any;
  let mockSyncManager: any;

  beforeEach(() => {
    // Clear document body
    document.body.innerHTML = '';

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
      }
    };

    // Mock formatters
    mockFormatters = {
      truncateText: jest.fn().mockImplementation((text) => text),
      formatTimestamp: jest.fn().mockImplementation((timestamp) => timestamp)
    };

    // Mock button creation functions
    mockCreateAnnotationButton = jest.fn().mockReturnValue(document.createElement('div'));
    mockCreateDeleteButton = jest.fn().mockReturnValue(document.createElement('button'));

    // Mock treeService
    mockTreeService = {
      setCurrentNode: jest.fn().mockResolvedValue(true),
      moveNode: jest.fn().mockResolvedValue(true),
      shiftNodeToParent: jest.fn().mockResolvedValue(true)
    };

    // Mock syncManager
    mockSyncManager = {
      markAsModified: jest.fn()
    };

    // Mock window functions
    (window as any).formatters = mockFormatters;
    (window as any).createAnnotationButton = mockCreateAnnotationButton;
    (window as any).createDeleteButton = mockCreateDeleteButton;
    (window as any).treeService = mockTreeService;
    (window as any).syncManager = mockSyncManager;
    (window as any).syncInitialized = true;
    (window as any).authManager = { isLoggedIn: jest.fn().mockReturnValue(true) };
    (window as any).currentDraggedNodeId = null;
  });

  describe('createElement', () => {
    it('should create tree node element with correct structure', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Test Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();

      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('tree-node ');
      expect(element.dataset.nodeId).toBe('1');
      expect(element.draggable).toBe(true);
    });

    it('should mark current node with current class', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Current Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };

      const treeNode = new TreeNode(node, true);
      const element = treeNode.createElement();

      expect(element.className).toBe('tree-node current');
    });

    it('should create content element with truncated text', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Very long text that should be truncated',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };

      mockFormatters.truncateText.mockReturnValue('Very long text...');

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      const contentElement = element.querySelector('.tree-node-content');

      expect(contentElement?.textContent).toBe('Very long text...');
      expect(mockFormatters.truncateText).toHaveBeenCalledWith(node.text);
    });

    it('should create images container when node has images', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Node with images',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: [],
        images: ['data:image/png;base64,test1', 'data:image/png;base64,test2']
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      const imagesContainer = element.querySelector('.tree-node-images');
      const imageElements = element.querySelectorAll('.tree-node-image-thumbnail');

      expect(imagesContainer).not.toBeNull();
      expect(imageElements).toHaveLength(2);
      expect((imageElements[0] as HTMLImageElement).src).toBe('data:image/png;base64,test1');
      expect((imageElements[1] as HTMLImageElement).src).toBe('data:image/png;base64,test2');
    });

    it('should create meta element with URL and timestamp', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Test Node',
        url: 'https://example.com/path',
        timestamp: '2023-01-01T12:00:00.000Z',
        parentId: null,
        children: []
      };

      mockFormatters.formatTimestamp.mockReturnValue('Jan 1, 12:00 PM');

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      const urlElement = element.querySelector('.tree-node-url');
      const timeElement = element.querySelector('.tree-node-info span:last-child');

      expect(urlElement?.textContent).toBe('example.com');
      expect((urlElement as HTMLElement)?.title).toBe('https://example.com/path');
      expect(timeElement?.textContent).toBe('Jan 1, 12:00 PM');
    });

    it('should create annotation and delete buttons', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Test Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();

      // Check that annotation button was created via global function
      expect(mockCreateAnnotationButton).toHaveBeenCalledWith(node);
      
      // Check that delete button was created (TreeNode creates its own delete button)
      const deleteButton = element.querySelector('.node-delete-button') as HTMLElement;
      expect(deleteButton).not.toBeNull();
      expect(deleteButton?.textContent).toBe('X');
      expect(deleteButton?.title).toBe('Delete this node');
    });
  });

  describe('drag and drop', () => {
    let node: TreeNodeType;
    let treeNode: TreeNode;
    let element: HTMLElement;

    beforeEach(() => {
      node = {
        id: 1,
        text: 'Draggable Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };

      treeNode = new TreeNode(node, false);
      element = treeNode.createElement();
      document.body.appendChild(element);
    });

    it('should handle dragstart event', () => {
      const dragStartEvent = new Event('dragstart');
      Object.defineProperty(dragStartEvent, 'dataTransfer', {
        value: {
          setData: jest.fn(),
          effectAllowed: ''
        }
      });

      element.dispatchEvent(dragStartEvent);

      expect((window as any).currentDraggedNodeId).toBe(1);
      expect((dragStartEvent as any).dataTransfer.setData).toHaveBeenCalledWith('text/plain', '1');
      expect((dragStartEvent as any).dataTransfer.effectAllowed).toBe('move');
      expect(element.classList.contains('dragging')).toBe(true);
    });

    it('should handle dragend event', () => {
      // First trigger dragstart to set up state
      const dragStartEvent = new Event('dragstart');
      Object.defineProperty(dragStartEvent, 'dataTransfer', {
        value: { setData: jest.fn(), effectAllowed: '' }
      });
      element.dispatchEvent(dragStartEvent);

      const dragEndEvent = new Event('dragend');
      element.dispatchEvent(dragEndEvent);

      expect((window as any).currentDraggedNodeId).toBeNull();
      expect(element.classList.contains('dragging')).toBe(false);
    });

    it('should handle dragover event', () => {
      (window as any).currentDraggedNodeId = 2; // Different node being dragged
      
      const dragOverEvent = new Event('dragover');
      Object.defineProperty(dragOverEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(dragOverEvent, 'stopPropagation', { value: jest.fn() });

      element.dispatchEvent(dragOverEvent);

      expect(dragOverEvent.preventDefault).toHaveBeenCalled();
      expect(dragOverEvent.stopPropagation).toHaveBeenCalled();
      expect(element.classList.contains('drag-over')).toBe(true);
    });

    it('should handle drop event', async () => {
      (window as any).currentDraggedNodeId = 2; // Different node being dragged
      
      const dropEvent = new Event('drop');
      Object.defineProperty(dropEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(dropEvent, 'stopPropagation', { value: jest.fn() });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: jest.fn().mockReturnValue('2') }
      });

      element.dispatchEvent(dropEvent);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(dropEvent.preventDefault).toHaveBeenCalled();
      expect(dropEvent.stopPropagation).toHaveBeenCalled();
      expect(mockTreeService.moveNode).toHaveBeenCalledWith(2, 1);
      expect(mockSyncManager.markAsModified).toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    let node: TreeNodeType;
    let treeNode: TreeNode;
    let element: HTMLElement;

    beforeEach(() => {
      node = {
        id: 1,
        text: 'Test Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };

      treeNode = new TreeNode(node, false);
      element = treeNode.createElement();
      document.body.appendChild(element);
    });

    it('should handle click event to update current node', async () => {
      const clickEvent = new Event('click');
      element.dispatchEvent(clickEvent);

      expect(mockTreeService.setCurrentNode).toHaveBeenCalledWith(1);
    });

    it('should handle double-click event for navigation', async () => {
      const dblClickEvent = new Event('dblclick');
      Object.defineProperty(dblClickEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(dblClickEvent, 'stopPropagation', { value: jest.fn() });

      element.dispatchEvent(dblClickEvent);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockTreeService.setCurrentNode).toHaveBeenCalledWith(1);
      expect(browser.tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com' });
    });

    it('should handle context menu event', () => {
      const contextMenuEvent = new MouseEvent('contextmenu');
      Object.defineProperty(contextMenuEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(contextMenuEvent, 'stopPropagation', { value: jest.fn() });

      element.dispatchEvent(contextMenuEvent);

      const contextMenu = document.querySelector('.context-menu');
      expect(contextMenu).not.toBeNull();
    });
  });

  describe('context menu', () => {
    it('should show context menu with shift option for nodes with parent', () => {
      const node: TreeNodeType = {
        id: 2,
        text: 'Child Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: 1,
        children: []
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      document.body.appendChild(element);

      const contextMenuEvent = new MouseEvent('contextmenu');
      Object.defineProperty(contextMenuEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(contextMenuEvent, 'stopPropagation', { value: jest.fn() });

      element.dispatchEvent(contextMenuEvent);

      const contextMenu = document.querySelector('.context-menu');
      const shiftOption = document.querySelector('.context-menu-item');
      
      expect(contextMenu).not.toBeNull();
      expect(shiftOption?.textContent).toBe('Shift out');
    });

    it('should not show shift option for root nodes', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Root Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: []
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      document.body.appendChild(element);

      const contextMenuEvent = new MouseEvent('contextmenu');
      Object.defineProperty(contextMenuEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(contextMenuEvent, 'stopPropagation', { value: jest.fn() });

      element.dispatchEvent(contextMenuEvent);

      const contextMenu = document.querySelector('.context-menu');
      const shiftOption = document.querySelector('.context-menu-item');
      
      expect(contextMenu).not.toBeNull();
      expect(shiftOption).toBeNull();
    });

    it('should handle shift option click', async () => {
      const node: TreeNodeType = {
        id: 2,
        text: 'Child Node',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: 1,
        children: []
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      document.body.appendChild(element);

      const contextMenuEvent = new MouseEvent('contextmenu');
      Object.defineProperty(contextMenuEvent, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(contextMenuEvent, 'stopPropagation', { value: jest.fn() });

      element.dispatchEvent(contextMenuEvent);

      const shiftOption = document.querySelector('.context-menu-item');
      shiftOption?.dispatchEvent(new Event('click'));

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockTreeService.shiftNodeToParent).toHaveBeenCalledWith(2);
      expect(mockSyncManager.markAsModified).toHaveBeenCalled();
    });
  });

  describe('image modal', () => {
    it('should show image modal when image thumbnail is clicked', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Node with images',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: [],
        images: ['data:image/png;base64,test']
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      document.body.appendChild(element);

      const imageThumbnail = element.querySelector('.tree-node-image-thumbnail');
      imageThumbnail?.dispatchEvent(new Event('click', { bubbles: true }));

      const modal = document.querySelector('.image-modal');
      const modalImage = document.querySelector('.modal-image');
      
      expect(modal).not.toBeNull();
      expect((modalImage as HTMLImageElement)?.src).toBe('data:image/png;base64,test');
    });

    it('should close modal when close button is clicked', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Node with images',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: [],
        images: ['data:image/png;base64,test']
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      document.body.appendChild(element);

      const imageThumbnail = element.querySelector('.tree-node-image-thumbnail');
      imageThumbnail?.dispatchEvent(new Event('click', { bubbles: true }));

      const closeButton = document.querySelector('.modal-close');
      closeButton?.dispatchEvent(new Event('click'));

      const modal = document.querySelector('.image-modal');
      expect(modal).toBeNull();
    });

    it('should close modal when background is clicked', () => {
      const node: TreeNodeType = {
        id: 1,
        text: 'Node with images',
        url: 'https://example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        parentId: null,
        children: [],
        images: ['data:image/png;base64,test']
      };

      const treeNode = new TreeNode(node, false);
      const element = treeNode.createElement();
      document.body.appendChild(element);

      const imageThumbnail = element.querySelector('.tree-node-image-thumbnail');
      imageThumbnail?.dispatchEvent(new Event('click', { bubbles: true }));

      const modal = document.querySelector('.image-modal');
      modal?.dispatchEvent(new Event('click'));

      expect(document.querySelector('.image-modal')).toBeNull();
    });
  });
});
