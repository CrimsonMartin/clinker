// treeContainer.ts - Tree container component for managing tree rendering
import { TreeNode as TreeNodeType } from '../types/treeTypes';
import { TreeNode } from './treeNode';

export class TreeContainer {
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
  }

  // Load and display the tree
  async loadAndDisplayTree(): Promise<void> {
    if (!this.treeRoot) {
      this.initialize();
    }
    
    if (!this.treeRoot) return;
    
    try {
      const tree = await (window as any).treeService.getTree();
      
      console.log('Loading tree with nodes:', tree.nodes);
      
      // Validate and repair tree structure before rendering
      const repairedTree = await (window as any).treeValidationService.repairTreeIntegrity(tree);
      
      // Clear existing content
      this.treeRoot.innerHTML = '';
      
      // Check if tree is empty
      const visibleNodes = (window as any).treeService.getVisibleNodes(repairedTree.nodes);
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
    
    // Find all nodes with the specified parent
    const childNodes = (window as any).treeService.getChildNodes(nodes, parentId);
    
    childNodes.forEach((node: TreeNodeType) => {
      // Ensure node has children array
      if (!node.children) {
        node.children = [];
      }
      
      const isCurrentNode = node.id === currentNodeId;
      
      // Create tree node component
      const treeNodeComponent = new TreeNode(node, isCurrentNode);
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

  // Refresh the tree display
  async refresh(): Promise<void> {
    await this.loadAndDisplayTree();
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).treeContainer = new TreeContainer();
}
