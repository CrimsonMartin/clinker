// treeContainer.js - Tree container component for managing tree rendering

class TreeContainer {
  constructor() {
    this.treeRoot = null;
    this.backgroundDropSetup = false;
  }

  // Initialize the tree container
  initialize() {
    this.treeRoot = document.getElementById('tree-root');
    if (!this.treeRoot) {
      console.error('Tree root element not found');
      return;
    }
    
    // Setup background drop functionality once
    if (!this.backgroundDropSetup) {
      this.setupBackgroundDrop();
      this.backgroundDropSetup = true;
    }
  }

  // Load and display the tree
  async loadAndDisplayTree() {
    if (!this.treeRoot) {
      this.initialize();
    }
    
    if (!this.treeRoot) return;
    
    try {
      const tree = await window.treeService.getTree();
      
      console.log('Loading tree with nodes:', tree.nodes);
      
      // Validate and repair tree structure before rendering
      const repairedTree = await window.treeValidationService.repairTreeIntegrity(tree);
      
      // Clear existing content
      this.treeRoot.innerHTML = '';
      
      // Check if tree is empty
      const visibleNodes = window.treeService.getVisibleNodes(repairedTree.nodes);
      if (!repairedTree.nodes || repairedTree.nodes.length === 0 || visibleNodes.length === 0) {
        this.showEmptyState();
        return;
      }
      
      // Render the tree starting from root nodes
      const treeElements = this.renderTree(repairedTree.nodes, repairedTree.currentNodeId);
      this.treeRoot.appendChild(treeElements);
      
    } catch (error) {
      console.error('Error loading tree:', error);
      this.showErrorState();
    }
  }

  // Show empty state message
  showEmptyState() {
    this.treeRoot.innerHTML = '<div class="empty-state">No citations saved yet. Highlight text on any webpage to start building your research tree.</div>';
  }

  // Show error state message
  showErrorState() {
    this.treeRoot.innerHTML = '<div class="empty-state">Error loading research tree.</div>';
  }

  // Render tree recursively
  renderTree(nodes, currentNodeId, parentId = null) {
    const container = document.createElement('div');
    
    // Find all nodes with the specified parent
    const childNodes = window.treeService.getChildNodes(nodes, parentId);
    
    childNodes.forEach(node => {
      // Ensure node has children array
      if (!node.children) {
        node.children = [];
      }
      
      const isCurrentNode = node.id === currentNodeId;
      
      // Create tree node component
      const treeNodeComponent = new window.TreeNode(node, isCurrentNode);
      const nodeElement = treeNodeComponent.createElement();
      
      // Recursively render children
      if (node.children && node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        const childrenElements = this.renderTree(nodes, currentNodeId, node.id);
        childrenContainer.appendChild(childrenElements);
        nodeElement.appendChild(childrenContainer);
      }
      
      container.appendChild(nodeElement);
    });
    
    return container;
  }

  // Setup background drop functionality
  setupBackgroundDrop() {
    const treeContainer = document.querySelector('.tree-container');
    if (!treeContainer) return;
    
    // Allow dropping on the tree container background
    treeContainer.addEventListener('dragover', (e) => {
      // Check if we're dropping on background (not on a tree node)
      const isOnNode = e.target.closest('.tree-node');
      
      if (!isOnNode) {
        e.preventDefault();
        e.stopPropagation();
        
        if (window.currentDraggedNodeId) {
          treeContainer.classList.add('drag-over-background');
        }
      }
    });
    
    treeContainer.addEventListener('dragleave', (e) => {
      // Remove background drag-over if leaving the container
      if (!treeContainer.contains(e.relatedTarget)) {
        treeContainer.classList.remove('drag-over-background');
      }
    });
    
    treeContainer.addEventListener('drop', async (e) => {
      // Check if we're dropping on background (not on a tree node)
      const isOnNode = e.target.closest('.tree-node');
      
      if (!isOnNode) {
        e.preventDefault();
        e.stopPropagation();
        treeContainer.classList.remove('drag-over-background');
        
        const draggedNodeId = parseInt(e.dataTransfer.getData('text/plain')) || window.currentDraggedNodeId;
        
        if (draggedNodeId) {
          console.log(`Moving node ${draggedNodeId} to root level`);
          await window.treeService.moveNodeToRoot(draggedNodeId);
          
          // Mark as modified for sync
          if (window.syncInitialized && window.authManager?.isLoggedIn()) {
            window.syncManager.markAsModified();
          }
        }
      }
    });
  }

  // Refresh the tree display
  async refresh() {
    await this.loadAndDisplayTree();
  }
}

// Export as singleton
window.treeContainer = new TreeContainer();
