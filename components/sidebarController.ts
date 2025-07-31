// sidebarController.ts - Main controller for sidebar functionality

class SidebarController {
  private initialized: boolean;
  private storageListener: ((changes: any, areaName: string) => void) | null;

  constructor() {
    this.initialized = false;
    this.storageListener = null;
  }

  // Initialize the sidebar
  async initialize(): Promise<void> {
    try {
      console.log('Initializing sidebar controller...');
      
      // Initialize tab service first - this is critical for tab filtering
      const tabService = (window as any).CitationLinker?.tabService || (window as any).tabService;
      if (tabService) {
        console.log('Initializing tab service...');
        await tabService.initialize();
      } else {
        console.error('Tab service not found!');
      }
      
      // Initialize all components with proper namespace fallbacks
      const treeContainer = (window as any).CitationLinker?.treeContainer || (window as any).treeContainer;
      const searchBar = (window as any).CitationLinker?.searchBar || (window as any).searchBar;
      const authStatus = (window as any).CitationLinker?.authStatus || (window as any).authStatus;
      const tabBar = (window as any).CitationLinker?.tabBar || (window as any).tabBar;
      
      if (treeContainer) {
        console.log('Initializing tree container...');
        treeContainer.initialize();
      }
      
      if (searchBar) {
        console.log('Initializing search bar...');
        searchBar.initialize();
      }
      
      if (authStatus) {
        console.log('Initializing auth status...');
        authStatus.initialize();
      }
      
      // Initialize tab bar - this is critical for tab switching
      if (tabBar) {
        console.log('Initializing tab bar...');
        await tabBar.initialize();
      } else {
        console.error('Tab bar not found!');
      }
      
      // Setup storage listener
      this.setupStorageListener();
      
      // Setup message listener for communication with content script
      this.setupMessageListener();
      
      // Initial load
      await this.loadAndDisplay();
      
      // Initialize Firebase auth if available
      if ((window as any).authManager) {
        (window as any).authManager.onAuthStateChanged((user: any) => {
          if (authStatus) {
            authStatus.updateUI(user);
          }
          
          if (user && (window as any).syncManager) {
            (window as any).syncManager.startSync();
          }
        });
        
        // Check initial auth state
        const user = await (window as any).authManager.getCurrentUser();
        if (authStatus) {
          authStatus.updateUI(user);
        }
      }
      
      this.initialized = true;
      console.log('Sidebar controller initialized successfully');
      
    } catch (error) {
      console.error('Error initializing sidebar:', error);
    }
  }

  // Setup storage listener
  private setupStorageListener(): void {
    // Listen for storage changes
    this.storageListener = (changes: any, areaName: string) => {
      if (areaName === 'local') {
        // Handle tab changes - this is critical for tab filtering
        if (changes.tabsData) {
          console.log('SidebarController: Tabs data changed, refreshing components...');
          const tabBar = (window as any).CitationLinker?.tabBar || (window as any).tabBar;
          if (tabBar) {
            tabBar.refresh();
          }
          // Don't call loadAndDisplay here as TreeContainer will handle it via its own listener
        }
        
        // Handle legacy tree changes (for backward compatibility)
        if (changes.citationTree) {
          console.log('SidebarController: Legacy tree data changed, reloading...');
          
          // Check if this is a UI-only change (like highlighting)
          const newValue = changes.citationTree.newValue;
          if (newValue && newValue.uiOnlyChange) {
            // Just update highlighting without full reload
            this.updateHighlighting(newValue.currentNodeId);
            
            // Clear the UI-only flag
            browser.storage.local.get('citationTree').then((result: any) => {
              const tree = result.citationTree;
              if (tree && tree.uiOnlyChange) {
                delete tree.uiOnlyChange;
                browser.storage.local.set({ citationTree: tree });
              }
            });
          } else {
            // Full reload for structural changes
            this.loadAndDisplay();
          }
        }
      }
    };
    
    browser.storage.onChanged.addListener(this.storageListener);
  }

  // Setup message listener
  private setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response: any) => void) => {
      console.log('Sidebar received message:', message);
      
      switch (message.action) {
        case 'reloadTree':
          this.loadAndDisplay();
          sendResponse({ success: true });
          break;
          
        case 'focusSearch':
          (window as any).searchBar.openSearch();
          sendResponse({ success: true });
          break;
          
        case 'navigateToNode':
          if (message.nodeId) {
            this.navigateToNode(message.nodeId);
          }
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
      
      return true; // Keep message channel open for async response
    });
  }

  // Load and display tree
  async loadAndDisplay(): Promise<void> {
    try {
      const treeContainer = (window as any).CitationLinker?.treeContainer || (window as any).treeContainer;
      const searchBar = (window as any).CitationLinker?.searchBar || (window as any).searchBar;
      
      if (treeContainer) {
        await treeContainer.loadAndDisplayTree();
      }
      
      // Re-run search if active
      if (searchBar && searchBar.rerunSearchIfActive) {
        searchBar.rerunSearchIfActive();
      }
      
    } catch (error) {
      console.error('Error loading tree:', error);
    }
  }

  // Update highlighting only
  private updateHighlighting(currentNodeId: number | null): void {
    // Remove previous highlighting
    document.querySelectorAll('.tree-node.current').forEach(node => {
      node.classList.remove('current');
    });
    
    // Add new highlighting
    if (currentNodeId) {
      const nodeElement = document.querySelector(`[data-node-id="${currentNodeId}"]`);
      if (nodeElement) {
        nodeElement.classList.add('current');
      }
    }
  }

  // Navigate to a specific node
  async navigateToNode(nodeId: number): Promise<void> {
    try {
      const treeService = (window as any).CitationLinker?.treeService || (window as any).treeService;
      if (!treeService) {
        console.error('TreeService not available for navigation');
        return;
      }
      
      const tree = await treeService.getTree();
      const node = treeService.findNode(tree.nodes, nodeId);
      
      if (node) {
        // Update current node
        await treeService.setCurrentNode(nodeId);
        
        // Navigate to URL
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0] && tabs[0].id) {
          await browser.tabs.update(tabs[0].id, { url: node.url });
        }
        
        // Scroll to node in sidebar
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (nodeElement) {
          nodeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
    } catch (error) {
      console.error('Error navigating to node:', error);
    }
  }

  // Cleanup
  cleanup(): void {
    if (this.storageListener) {
      browser.storage.onChanged.removeListener(this.storageListener);
    }
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  // Initialize global namespace if it doesn't exist
  (window as any).CitationLinker = (window as any).CitationLinker || {};
  
  // Create singleton instance
  const sidebarControllerInstance = new SidebarController();
  
  // Attach to both namespaces for compatibility
  (window as any).CitationLinker.sidebarController = sidebarControllerInstance;
  (window as any).sidebarController = sidebarControllerInstance; // Legacy support

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      sidebarControllerInstance.initialize();
    });
  } else {
    sidebarControllerInstance.initialize();
  }
}
