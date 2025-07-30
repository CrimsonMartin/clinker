// sidebarController.js - Main controller for sidebar functionality

class SidebarController {
  constructor() {
    this.initialized = false;
    this.storageListener = null;
  }

  // Initialize the sidebar
  async initialize() {
    try {
      console.log('Initializing sidebar controller...');
      
      // Initialize all components
      window.treeContainer.initialize();
      window.searchBar.initialize();
      window.authStatus.initialize();
      
      // Setup storage listener
      this.setupStorageListener();
      
      // Setup message listener for communication with content script
      this.setupMessageListener();
      
      // Initial load
      await this.loadAndDisplay();
      
      // Initialize Firebase auth if available
      if (window.authManager) {
        window.authManager.onAuthStateChanged((user) => {
          window.authStatus.updateUI(user);
          
          if (user && window.syncManager) {
            window.syncManager.startSync();
          }
        });
        
        // Check initial auth state
        const user = await window.authManager.getCurrentUser();
        window.authStatus.updateUI(user);
      }
      
      this.initialized = true;
      console.log('Sidebar controller initialized successfully');
      
    } catch (error) {
      console.error('Error initializing sidebar:', error);
    }
  }

  // Setup storage listener
  setupStorageListener() {
    // Listen for storage changes
    this.storageListener = browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.citationTree) {
        console.log('Tree data changed, reloading...');
        
        // Check if this is a UI-only change (like highlighting)
        const newValue = changes.citationTree.newValue;
        if (newValue && newValue.uiOnlyChange) {
          // Just update highlighting without full reload
          this.updateHighlighting(newValue.currentNodeId);
          
          // Clear the UI-only flag
          browser.storage.local.get('citationTree').then(result => {
            const tree = result.citationTree;
            delete tree.uiOnlyChange;
            browser.storage.local.set({ citationTree: tree });
          });
        } else {
          // Full reload for structural changes
          this.loadAndDisplay();
        }
      }
    });
  }

  // Setup message listener
  setupMessageListener() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Sidebar received message:', message);
      
      switch (message.action) {
        case 'reloadTree':
          this.loadAndDisplay();
          sendResponse({ success: true });
          break;
          
        case 'focusSearch':
          window.searchBar.openSearch();
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
  async loadAndDisplay() {
    try {
      await window.treeContainer.loadAndDisplayTree();
      
      // Re-run search if active
      window.searchBar.rerunSearchIfActive();
      
    } catch (error) {
      console.error('Error loading tree:', error);
    }
  }

  // Update highlighting only
  updateHighlighting(currentNodeId) {
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
  async navigateToNode(nodeId) {
    try {
      const tree = await window.treeService.getTree();
      const node = window.treeService.findNode(tree.nodes, nodeId);
      
      if (node) {
        // Update current node
        await window.treeService.setCurrentNode(nodeId);
        
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
  cleanup() {
    if (this.storageListener) {
      browser.storage.onChanged.removeListener(this.storageListener);
    }
  }
}

// Export as singleton
window.sidebarController = new SidebarController();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.sidebarController.initialize();
  });
} else {
  window.sidebarController.initialize();
}
