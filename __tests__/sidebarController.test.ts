/**
 * @jest-environment jsdom
 */

// Load component file that creates window.sidebarController
require('../components/sidebarController');

// Extract class from window object
const SidebarControllerClass = (global as any).window.CitationLinker?.sidebarController?.constructor || (global as any).window.sidebarController?.constructor;

describe('SidebarController', () => {
  let sidebarController: any;
  let mockTreeContainer: any;
  let mockSearchBar: any;
  let mockAuthStatus: any;
  let mockAuthManager: any;
  let mockSyncManager: any;
  let mockTreeService: any;

  beforeEach(() => {
    // Clear document body
    document.body.innerHTML = `
      <div id="tree-root"></div>
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
      runtime: {
        onMessage: {
          addListener: jest.fn()
        }
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 1 }]),
        update: jest.fn().mockResolvedValue(undefined)
      }
    };

    // Mock components
    mockTreeContainer = {
      initialize: jest.fn(),
      loadAndDisplayTree: jest.fn().mockResolvedValue(undefined)
    };

    mockSearchBar = {
      initialize: jest.fn(),
      rerunSearchIfActive: jest.fn(),
      openSearch: jest.fn()
    };

    mockAuthStatus = {
      initialize: jest.fn(),
      updateUI: jest.fn()
    };

    // Mock services
    mockTreeService = {
      getTree: jest.fn().mockResolvedValue({ nodes: [], currentNodeId: null }),
      setCurrentNode: jest.fn().mockResolvedValue(true),
      findNode: jest.fn().mockReturnValue(undefined)
    };

    // Mock authManager
    mockAuthManager = {
      onAuthStateChanged: jest.fn(),
      getCurrentUser: jest.fn().mockResolvedValue(null),
      isLoggedIn: jest.fn().mockReturnValue(false)
    };

    // Mock syncManager
    mockSyncManager = {
      startSync: jest.fn(),
      markAsModified: jest.fn()
    };

    // Attach mocks to window
    (window as any).treeContainer = mockTreeContainer;
    (window as any).searchBar = mockSearchBar;
    (window as any).authStatus = mockAuthStatus;
    (window as any).authManager = mockAuthManager;
    (window as any).syncManager = mockSyncManager;
    (window as any).treeService = mockTreeService;

    // Create new SidebarController instance
    sidebarController = new SidebarControllerClass();
  });

  describe('initialize', () => {
    it('should initialize all components and setup listeners', async () => {
      await sidebarController.initialize();
      
      expect(mockTreeContainer.initialize).toHaveBeenCalled();
      expect(mockSearchBar.initialize).toHaveBeenCalled();
      expect(mockAuthStatus.initialize).toHaveBeenCalled();
      expect(browser.storage.onChanged.addListener).toHaveBeenCalled();
      expect(browser.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(mockTreeContainer.loadAndDisplayTree).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Sidebar controller initialized successfully');
    });

    it('should handle initialization errors gracefully', async () => {
      mockTreeContainer.initialize.mockImplementation(() => {
        throw new Error('Initialization failed');
      });
      
      await sidebarController.initialize();
      
      expect(console.error).toHaveBeenCalledWith('Error initializing sidebar:', expect.any(Error));
    });

    it('should setup auth state listener when authManager exists', async () => {
      const mockUser = { email: 'test@example.com' };
      mockAuthManager.getCurrentUser.mockResolvedValue(mockUser);
      
      await sidebarController.initialize();
      
      expect(mockAuthManager.onAuthStateChanged).toHaveBeenCalled();
      expect(mockAuthStatus.updateUI).toHaveBeenCalledWith(mockUser); // Initial call with user
    });

    it('should start sync when user is logged in', async () => {
      const mockUser = { email: 'test@example.com' };
      mockAuthManager.getCurrentUser.mockResolvedValue(mockUser);
      mockAuthManager.isLoggedIn.mockReturnValue(true);
      
      await sidebarController.initialize();
      
      // Simulate auth state change
      const authCallback = mockAuthManager.onAuthStateChanged.mock.calls[0][0];
      authCallback(mockUser);
      
      expect(mockAuthStatus.updateUI).toHaveBeenCalledWith(mockUser);
      expect(mockSyncManager.startSync).toHaveBeenCalled();
    });
  });

  describe('loadAndDisplay', () => {
    it('should load and display tree with search rerun', async () => {
      await sidebarController.loadAndDisplay();
      
      expect(mockTreeContainer.loadAndDisplayTree).toHaveBeenCalled();
      expect(mockSearchBar.rerunSearchIfActive).toHaveBeenCalled();
    });

    it('should handle load errors gracefully', async () => {
      mockTreeContainer.loadAndDisplayTree.mockRejectedValue(new Error('Load failed'));
      
      await sidebarController.loadAndDisplay();
      
      expect(console.error).toHaveBeenCalledWith('Error loading tree:', expect.any(Error));
    });
  });

  describe('navigateToNode', () => {
    it('should navigate to existing node', async () => {
      const mockTree = {
        nodes: [{ id: 1, url: 'https://example.com', text: 'Test' }]
      };
      mockTreeService.getTree.mockResolvedValue(mockTree);
      mockTreeService.findNode.mockReturnValue(mockTree.nodes[0]);
      
      await sidebarController.navigateToNode(1);
      
      expect(mockTreeService.getTree).toHaveBeenCalled();
      expect(mockTreeService.findNode).toHaveBeenCalledWith(mockTree.nodes, 1);
      expect(mockTreeService.setCurrentNode).toHaveBeenCalledWith(1);
      expect(browser.tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com' });
    });

    it('should handle navigation to non-existent node', async () => {
      mockTreeService.getTree.mockResolvedValue({ nodes: [] });
      mockTreeService.findNode.mockReturnValue(undefined);
      
      await sidebarController.navigateToNode(999);
      
      expect(mockTreeService.getTree).toHaveBeenCalled();
      expect(mockTreeService.findNode).toHaveBeenCalledWith([], 999);
      expect(mockTreeService.setCurrentNode).not.toHaveBeenCalled();
    });

    it('should handle navigation errors gracefully', async () => {
      mockTreeService.getTree.mockRejectedValue(new Error('Navigation failed'));
      
      await sidebarController.navigateToNode(1);
      
      expect(console.error).toHaveBeenCalledWith('Error navigating to node:', expect.any(Error));
    });
  });

  describe('updateHighlighting', () => {
    it('should update highlighting for current node', () => {
      document.body.innerHTML = `
        <div class="tree-node current" data-node-id="1"></div>
        <div class="tree-node" data-node-id="2"></div>
      `;
      
      // Call private method via reflection
      const updateHighlighting = (sidebarController as any)['updateHighlighting'].bind(sidebarController);
      updateHighlighting(2);
      
      const node1 = document.querySelector('[data-node-id="1"]');
      const node2 = document.querySelector('[data-node-id="2"]');
      
      expect(node1?.classList.contains('current')).toBe(false);
      expect(node2?.classList.contains('current')).toBe(true);
    });

    it('should clear highlighting when no current node', () => {
      document.body.innerHTML = `
        <div class="tree-node current" data-node-id="1"></div>
      `;
      
      const updateHighlighting = (sidebarController as any)['updateHighlighting'].bind(sidebarController);
      updateHighlighting(null);
      
      const node1 = document.querySelector('[data-node-id="1"]');
      expect(node1?.classList.contains('current')).toBe(false);
    });
  });

  describe('setupStorageListener', () => {
    it('should handle storage changes for tree data', async () => {
      await sidebarController.initialize();
      
      const storageCallback = browser.storage.onChanged.addListener.mock.calls[0][0];
      const changes = {
        citationTree: {
          newValue: { nodes: [], currentNodeId: 1 }
        }
      };
      
      storageCallback(changes, 'local');
      
      // Should trigger loadAndDisplay for structural changes
      expect(mockTreeContainer.loadAndDisplayTree).toHaveBeenCalled();
    });

    it('should handle UI-only changes', async () => {
      await sidebarController.initialize();
      
      const storageCallback = browser.storage.onChanged.addListener.mock.calls[0][0];
      const changes = {
        citationTree: {
          newValue: { nodes: [], currentNodeId: 1, uiOnlyChange: true }
        }
      };
      
      storageCallback(changes, 'local');
      
      // Should update highlighting only, not full reload
      expect(browser.storage.local.get).toHaveBeenCalled();
    });

    it('should ignore non-tree changes', async () => {
      await sidebarController.initialize();
      
      // Clear the mock call count from initialization
      mockTreeContainer.loadAndDisplayTree.mockClear();
      
      const storageCallback = browser.storage.onChanged.addListener.mock.calls[0][0];
      const changes = {
        otherData: { newValue: 'test' }
      };
      
      storageCallback(changes, 'local');
      
      expect(mockTreeContainer.loadAndDisplayTree).not.toHaveBeenCalled();
    });
  });

  describe('setupMessageListener', () => {
    it('should handle reloadTree message', async () => {
      await sidebarController.initialize();
      
      const messageCallback = browser.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      const result = messageCallback({ action: 'reloadTree' }, null, sendResponse);
      
      expect(result).toBe(true); // Keep channel open
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      expect(mockTreeContainer.loadAndDisplayTree).toHaveBeenCalled();
    });

    it('should handle focusSearch message', async () => {
      await sidebarController.initialize();
      
      const messageCallback = browser.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      const result = messageCallback({ action: 'focusSearch' }, null, sendResponse);
      
      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      expect(mockSearchBar.openSearch).toHaveBeenCalled();
    });

    it('should handle navigateToNode message', async () => {
      await sidebarController.initialize();
      
      const messageCallback = browser.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      // Mock the navigateToNode method
      const navigateToNodeSpy = jest.spyOn(sidebarController as any, 'navigateToNode');
      
      const result = messageCallback({ action: 'navigateToNode', nodeId: 1 }, null, sendResponse);
      
      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      expect(navigateToNodeSpy).toHaveBeenCalledWith(1);
    });

    it('should handle unknown action', async () => {
      await sidebarController.initialize();
      
      const messageCallback = browser.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      const result = messageCallback({ action: 'unknown' }, null, sendResponse);
      
      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({ 
        success: false, 
        error: 'Unknown action' 
      });
    });
  });

  describe('cleanup', () => {
    it('should remove storage listener', async () => {
      await sidebarController.initialize();
      sidebarController.cleanup();
      
      expect(browser.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('should handle cleanup when not initialized', () => {
      sidebarController.cleanup();
      
      expect(browser.storage.onChanged.removeListener).not.toHaveBeenCalled();
    });
  });
});
