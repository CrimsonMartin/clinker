// treeContainer.ts - Tree container component for managing tree rendering

// Type definitions (copied from types/treeTypes.ts to avoid import issues)
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

class TreeContainer {
  private treeRoot: HTMLElement | null;
  private backgroundDropSetup: boolean;

  constructor() {
    this.treeRoot = null;
    this.backgroundDropSetup = false;
  }

  // Initialize the tree container
  initialize(): void {
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
    
    // Listen for tab changes to refresh tree
    this.setupTabChangeListener();
  }

  // Load and display the tree
  async loadAndDisplayTree(): Promise<void> {
    if (!this.treeRoot) {
      this.initialize();
    }
    
    if (!this.treeRoot) return;
    
    try {
      // Get tree service - use the global namespace version for consistency
      const treeService = (window as any).CitationLinker?.treeService || (window as any).treeService;
      const treeValidationService = (window as any).CitationLinker?.treeValidationService || (window as any).treeValidationService;
      
      if (!treeService) {
        console.error('TreeService not available');
        this.showErrorState();
        return;
      }
      
      const tree = await treeService.getTree();
      
      console.log('TreeContainer: Loading tree with nodes:', tree.nodes?.length || 0);
      
      // Validate and repair tree structure before rendering
      let repairedTree = tree;
      if (treeValidationService) {
        repairedTree = await treeValidationService.repairTreeIntegrity(tree);
      }

      console.log('after repair, tree container now has :', repairedTree.nodes?.length || 0);
      
      // Clear existing content
      this.treeRoot.innerHTML = '';

      if (!repairedTree.nodes || repairedTree.nodes.length === 0) {

        console.log('Tree is empty, showing empty state');
        this.showEmptyState();
        return;
      }
      
      console.log('TreeContainer: Rendering tree with nodes:', repairedTree.nodes.length);

      // Render the tree starting from root nodes
      const treeElements = this.renderTree(repairedTree.nodes, repairedTree.currentNodeId);

      
      this.treeRoot.appendChild(treeElements);
      
    } catch (error) {
      console.error('Error loading tree:', error);
      this.showErrorState();
    }
  }

  // Show empty state message
  private showEmptyState(): void {
    if (this.treeRoot) {
      this.treeRoot.innerHTML = '<div class="empty-state">No citations saved yet. Highlight text on any webpage to start building your research tree.</div>';
    }
  }

  // Show error state message
  private showErrorState(): void {
    if (this.treeRoot) {
      this.treeRoot.innerHTML = '<div class="empty-state">Error loading research tree.</div>';
    }
  }

  // Render tree recursively
  private renderTree(nodes: TreeNodeType[], currentNodeId: number | null, parentId: number | null = null): HTMLElement {
    const container = document.createElement('div');
    
    console.log('getting nodes for parentId:', parentId, 'current selected node is ', currentNodeId);
    // Find all nodes with the specified parent
    const childNodes = (window as any).treeService.getChildNodes(nodes, parentId);

    console.log('found child nodes:', childNodes.length, 'for parentId:', parentId);
    
    childNodes.forEach((node: TreeNodeType) => {
      // Ensure node has children array
      if (!node.children) {
        node.children = [];
      }
      
      const isCurrentNode = node.id === currentNodeId;
      
      // Create tree node component
      const TreeNodeClass = (window as any).CitationLinker?.TreeNode || (window as any).TreeNode;
      if (TreeNodeClass) {
        const treeNodeComponent = new TreeNodeClass(node, isCurrentNode);
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
      } else {
        console.error('TreeNode component not available');
      }
      
    });
    
    return container;
  }

  // Setup background drop functionality
  private setupBackgroundDrop(): void {
    const treeContainer = document.querySelector('.tree-container');
    if (!treeContainer) return;
    
    // Allow dropping on the tree container background
    treeContainer.addEventListener('dragover', (e) => {
      // Check if we're dropping on background (not on a tree node)
      const isOnNode = (e.target as Element).closest('.tree-node');
      
      if (!isOnNode) {
        e.preventDefault();
        e.stopPropagation();
        
        if ((window as any).currentDraggedNodeId) {
          treeContainer.classList.add('drag-over-background');
        }
      }
    });
    
    treeContainer.addEventListener('dragleave', (e: Event) => {
      const dragEvent = e as DragEvent;
      // Remove background drag-over if leaving the container
      if (!treeContainer.contains(dragEvent.relatedTarget as Node)) {
        treeContainer.classList.remove('drag-over-background');
      }
    });
    
    treeContainer.addEventListener('drop', async (e: Event) => {
      const dragEvent = e as DragEvent;
      // Check if we're dropping on background (not on a tree node)
      const isOnNode = (dragEvent.target as Element).closest('.tree-node');
      
      if (!isOnNode) {
        dragEvent.preventDefault();
        dragEvent.stopPropagation();
        treeContainer.classList.remove('drag-over-background');
        
        const draggedNodeId = parseInt(dragEvent.dataTransfer!.getData('text/plain')) || (window as any).currentDraggedNodeId;
        
        if (draggedNodeId) {
          console.log(`Moving node ${draggedNodeId} to root level`);
          await (window as any).treeService.moveNodeToRoot(draggedNodeId);
          
          // Mark as modified for sync
          if ((window as any).syncInitialized && (window as any).authManager?.isLoggedIn()) {
            (window as any).syncManager.markAsModified();
          }
        }
      }
    });
  }

  // Setup tab change listener
  private setupTabChangeListener(): void {
    // Listen for storage changes that indicate tab switches or sync updates
    if (typeof browser !== 'undefined' && browser.storage) {
      browser.storage.onChanged.addListener((changes: any, areaName: string) => {
        if (areaName === 'local') {
          // Refresh on tab data changes (tab switches)
          if (changes.tabsData) {
            console.log('TreeContainer: Tab data changed, refreshing tree');
            this.refresh();
          }
          // Refresh on legacy tree data changes (sync updates in old format)
          else if (changes.citationTree) {
            console.log('TreeContainer: Citation tree data changed (sync), refreshing tree');
            this.refresh();
          }
        }
      });
    }
  }

  // Refresh the tree display
  async refresh(): Promise<void> {
    console.log('TreeContainer: Refreshing tree display');
    await this.loadAndDisplayTree();
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  // Initialize global namespace if it doesn't exist
  (window as any).CitationLinker = (window as any).CitationLinker || {};
  
  // Create singleton instance
  const treeContainerInstance = new TreeContainer();
  
  // Attach to both namespaces for compatibility
  (window as any).CitationLinker.treeContainer = treeContainerInstance;
  (window as any).treeContainer = treeContainerInstance; // Legacy support
}
