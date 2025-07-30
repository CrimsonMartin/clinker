// sidebarController.ts - Main controller for sidebar functionality

export class SidebarController {
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
      
      // Initialize all components
      (window as any).treeContainer.initialize();
      (window as any).searchBar.initialize();
      (window as any).authStatus.initialize();
      
      // Setup storage listener
      this.setupStorageListener();
      
      // Setup message listener for communication with content script
      this.setupMessageListener();
      
      // Initial load
      await this.loadAndDisplay();
      
      // Initialize Firebase auth if available
      if ((window as any).authManager) {
        (window as any).authManager.onAuthStateChanged((user: any) => {
          (window as any).authStatus.updateUI(user);
          
          if (user && (window as any).syncManager) {
            (window as any).syncManager.startSync();
          }
        });
        
        // Check initial auth state
        const user = await (window as any).authManager.getCurrentUser();
        (window as any).authStatus.updateUI(user);
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
      if (areaName === 'local' && changes.citationTree) {
        console.log('Tree data changed, reloading...');
        
        // Check if this is a UI-only change (like highlighting)
        const newValue = changes.citationTree.newValue;
        if (newValue && newValue.uiOnlyChange) {
          // Just update highlighting without full reload
          this.updateHighlighting(newValue.currentNodeId);
          
          // Clear the UI-only flag
          browser.storage.local.get('citationTree').then((result: any) => {
            const tree = result.citationTree;
            delete tree.uiOnlyChange;
            browser.storage.local.set({ citationTree: tree });
          });
        } else {
          // Full reload for structural changes
          this.loadAndDisplay();
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
      await (window as any).treeContainer.loadAndDisplayTree();
      
      // Re-run search if active
      (window as any).searchBar.rerunSearchIfActive();
      
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
      const tree = await (window as any).treeService.getTree();
      const node = (window as any).treeService.findNode(tree.nodes, nodeId);
      
      if (node) {
        // Update current node
        await (window as any).treeService.setCurrentNode(nodeId);
        
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
  (window as any).sidebarController = new SidebarController();

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      (window as any).sidebarController.initialize();
    });
  } else {
    (window as any).sidebarController.initialize();
  }
}
