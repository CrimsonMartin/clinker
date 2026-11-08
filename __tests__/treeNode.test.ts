/**
 * @jest-environment jsdom
 */

// Import types using ES6 exports (these work in tests)
import { TreeNode as TreeNodeType } from '../types/treeTypes';

// Load component file that creates window.TreeNode
require('../components/treeNode');

// Extract class from window object
const TreeNodeClass = (global as any).window.TreeNode;

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
        update: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(undefined)
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
      shiftNodeToParent: jest.fn().mockResolvedValue(true),
      moveNodeToRoot: jest.fn().mockResolvedValue(true),
      deleteNode: jest.fn().mockResolvedValue(true)
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

  const makeNode = (overrides: Partial<TreeNodeType> = {}): TreeNodeType => ({
    id: 1,
    text: 'Test Node',
    url: 'https://example.com',
    timestamp: '2023-01-01T00:00:00.000Z',
    parentId: null,
    children: [],
    ...overrides
  });

  const render = (node: TreeNodeType, current = false) => {
    const element: HTMLElement = new TreeNodeClass(node, current).createElement();
    document.body.appendChild(element);
    const row = element.querySelector(':scope > .tree-node-row') as HTMLElement;
    return { element, row };
  };

  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  describe('createElement', () => {
    it('should create a wrapper with a draggable row', () => {
      const { element, row } = render(makeNode());

      expect(element.className).toBe('tree-node');
      expect(element.dataset.nodeId).toBe('1');
      expect(element.getAttribute('role')).toBe('treeitem');
      // the wrapper itself is not draggable; the row is (so nested nodes drag independently)
      expect(element.draggable).toBe(false);
      expect(row).not.toBeNull();
      expect(row.draggable).toBe(true);
      expect(row.tabIndex).toBe(0);
    });

    it('should mark current node with current class', () => {
      const { element } = render(makeNode(), true);
      expect(element.className).toBe('tree-node current');
      expect(element.getAttribute('aria-selected')).toBe('true');
    });

    it('should create content element with truncated text and a full-text tooltip', () => {
      mockFormatters.truncateText.mockReturnValue('Very long text...');
      const node = makeNode({ text: 'Very long text that should be truncated' });
      const { row } = render(node);

      expect(row.querySelector('.tree-node-content')?.textContent).toBe('Very long text...');
      expect(mockFormatters.truncateText).toHaveBeenCalledWith(node.text, 300);
      expect(row.title).toBe(node.text);
    });

    it('should create non-draggable image thumbnails', () => {
      const { element } = render(makeNode({ images: ['data:image/png;base64,test1', 'data:image/png;base64,test2'] }));
      const imageElements = element.querySelectorAll('.tree-node-image-thumbnail');

      expect(element.querySelector('.tree-node-images')).not.toBeNull();
      expect(imageElements).toHaveLength(2);
      expect((imageElements[0] as HTMLImageElement).src).toBe('data:image/png;base64,test1');
      expect((imageElements[0] as HTMLImageElement).draggable).toBe(false);
    });

    it('does not render remote image URLs stored by older versions', () => {
      const { element } = render(makeNode({ images: ['https://tracker.example.net/a.png', 'data:image/png;base64,ok'] }));
      const imageElements = element.querySelectorAll('.tree-node-image-thumbnail');
      expect(imageElements).toHaveLength(1);
      expect((imageElements[0] as HTMLImageElement).src).toBe('data:image/png;base64,ok');

      const { element: onlyRemote } = render(makeNode({ images: ['http://example.com/x.png'] }));
      expect(onlyRemote.querySelector('.tree-node-images')).toBeNull();
    });

    it('should create meta element with URL and timestamp', () => {
      mockFormatters.formatTimestamp.mockReturnValue('Jan 1, 12:00 PM');
      const { element } = render(makeNode({ url: 'https://example.com/path' }));
      const urlElement = element.querySelector('.tree-node-url') as HTMLElement;

      expect(urlElement.textContent).toBe('example.com');
      expect(urlElement.title).toBe('https://example.com/path');
      expect(element.querySelector('.tree-node-time')?.textContent).toBe('Jan 1, 12:00 PM');
    });

    it('should not throw on an invalid URL', () => {
      const { element } = render(makeNode({ url: 'not a url' }));
      expect(element.querySelector('.tree-node-url')?.textContent).toBe('not a url');
    });

    it('should create annotation and an accessible delete button', () => {
      const node = makeNode();
      const { element } = render(node);

      expect(mockCreateAnnotationButton).toHaveBeenCalledWith(node);
      const deleteButton = element.querySelector('.node-delete-button') as HTMLButtonElement;
      expect(deleteButton).not.toBeNull();
      expect(deleteButton.tagName).toBe('BUTTON');
      expect(deleteButton.type).toBe('button');
      expect(deleteButton.title).toBe('Delete this node');
      expect(deleteButton.getAttribute('aria-label')).toBe('Delete this citation');
      expect(deleteButton.querySelector('svg use')?.getAttribute('href')).toBe('#i-trash-2');
    });
  });

  describe('event handlers', () => {
    it('should select the node on click without re-rendering', async () => {
      document.body.innerHTML = '<div class="tree-node current" data-node-id="9"></div>';
      const { element, row } = render(makeNode());

      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(mockTreeService.setCurrentNode).toHaveBeenCalledWith(1);
      expect(element.classList.contains('current')).toBe(true);
      expect(document.querySelector('[data-node-id="9"]')?.classList.contains('current')).toBe(false);
    });

    it('should not select the node when a button inside the row is clicked', async () => {
      const { element } = render(makeNode());
      const btn = document.createElement('button');
      element.querySelector('.tree-node-buttons')!.appendChild(btn);

      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(mockTreeService.setCurrentNode).not.toHaveBeenCalled();
    });

    it('clicking a nested child only selects the child', async () => {
      const parent = render(makeNode({ id: 1, children: [2] }));
      const child = new TreeNodeClass(makeNode({ id: 2, parentId: 1 }), false).createElement();
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.appendChild(child);
      parent.element.appendChild(childrenContainer);

      (child.querySelector('.tree-node-row') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(mockTreeService.setCurrentNode).toHaveBeenCalledTimes(1);
      expect(mockTreeService.setCurrentNode).toHaveBeenCalledWith(2);
    });

    it('should navigate on double-click', async () => {
      const { row } = render(makeNode());

      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await flush();

      expect(mockTreeService.setCurrentNode).toHaveBeenCalledWith(1);
      expect(browser.tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com' });
    });

    it('should navigate on Enter', async () => {
      const { row } = render(makeNode());

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flush();

      expect(browser.tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com' });
    });

    it('should open a context menu on right-click', () => {
      const { row } = render(makeNode());
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      expect(document.querySelector('.context-menu')).not.toBeNull();
    });
  });

  describe('delete button', () => {
    it('should delete the node and refresh the tree', async () => {
      const refresh = jest.fn().mockResolvedValue(undefined);
      (window as any).treeContainer = { refresh };
      const { element } = render(makeNode());

      (element.querySelector('.node-delete-button') as HTMLButtonElement).click();
      await flush();
      await flush();

      expect(mockTreeService.deleteNode).toHaveBeenCalledWith(1);
      expect(refresh).toHaveBeenCalled();
      expect(mockTreeService.setCurrentNode).not.toHaveBeenCalled();
    });

    it('should ask for confirmation before deleting a node with children', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      const { element } = render(makeNode({ children: [2] }));

      (element.querySelector('.node-delete-button') as HTMLButtonElement).click();
      await flush();

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockTreeService.deleteNode).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('should re-enable the button when deletion fails', async () => {
      mockTreeService.deleteNode.mockResolvedValue(false);
      const { element } = render(makeNode());
      const button = element.querySelector('.node-delete-button') as HTMLButtonElement;

      button.click();
      await flush();
      await flush();

      expect(button.disabled).toBe(false);
    });
  });

  describe('context menu', () => {
    const openMenu = (node: TreeNodeType) => {
      const { row } = render(node);
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return Array.from(document.querySelectorAll('.context-menu .context-menu-item')) as HTMLElement[];
    };

    it('should show shift option first for nodes with a parent', () => {
      const items = openMenu(makeNode({ id: 2, parentId: 1 }));
      expect(items[0].textContent).toBe('Shift out');
      expect(items.map(i => i.textContent)).toEqual(['Shift out', 'Move to top level', 'Open in new tab', 'Delete']);
    });

    it('should not show shift option for root nodes', () => {
      const items = openMenu(makeNode());
      expect(items.map(i => i.textContent)).toEqual(['Open in new tab', 'Delete']);
    });

    it('should handle shift option click', async () => {
      const items = openMenu(makeNode({ id: 2, parentId: 1 }));
      items[0].dispatchEvent(new Event('click'));
      await flush();

      expect(mockTreeService.shiftNodeToParent).toHaveBeenCalledWith(2);
      expect(mockSyncManager.markAsModified).toHaveBeenCalled();
      expect(document.querySelector('.context-menu')).toBeNull();
    });

    it('should handle move to top level click', async () => {
      const items = openMenu(makeNode({ id: 2, parentId: 1 }));
      items[1].dispatchEvent(new Event('click'));
      await flush();

      expect(mockTreeService.moveNodeToRoot).toHaveBeenCalledWith(2);
    });

    it('should open in a new tab', async () => {
      const items = openMenu(makeNode());
      items[0].dispatchEvent(new Event('click'));
      await flush();

      expect(browser.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('should close on Escape', async () => {
      openMenu(makeNode());
      await flush();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.context-menu')).toBeNull();
    });
  });

  describe('image modal', () => {
    const openModal = () => {
      const { element } = render(makeNode({ images: ['data:image/png;base64,test'] }));
      element.querySelector('.tree-node-image-thumbnail')!.dispatchEvent(new Event('click', { bubbles: true }));
    };

    it('should show image modal when image thumbnail is clicked', () => {
      openModal();
      expect(document.querySelector('.image-modal')).not.toBeNull();
      expect((document.querySelector('.modal-image') as HTMLImageElement).src).toBe('data:image/png;base64,test');
      // clicking a thumbnail must not select the node
      expect(mockTreeService.setCurrentNode).not.toHaveBeenCalled();
    });

    it('should close modal when close button is clicked', () => {
      openModal();
      document.querySelector('.modal-close')!.dispatchEvent(new Event('click'));
      expect(document.querySelector('.image-modal')).toBeNull();
    });

    it('should close modal when background is clicked', () => {
      openModal();
      document.querySelector('.image-modal')!.dispatchEvent(new Event('click'));
      expect(document.querySelector('.image-modal')).toBeNull();
    });

    it('should close modal on Escape', () => {
      openModal();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.image-modal')).toBeNull();
    });
  });
});
