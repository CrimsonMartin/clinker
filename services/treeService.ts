// treeService.ts - Tree data operations and management

// Type definitions (copied from types/treeTypes.ts to avoid import issues)
interface TreeNode {
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
  tabId?: string;
}

interface TreeData {
  nodes: TreeNode[];
  currentNodeId: number | null;
  uiOnlyChange?: boolean;
}

class TreeService {
  private storageKey: string;

  constructor() {
    this.storageKey = 'citationTree';
  }

  // Get the current tree from storage (now uses active tab)
  async getTree(): Promise<TreeData> {
    // Check if we have the new tab system
    const tabService = (window as any).CitationLinker?.tabService;
    if (tabService) {
      try {
        const activeTab = await tabService.getActiveTab();
        if (activeTab && activeTab.treeData) {
          console.log(`Loading tree for active tab: ${activeTab.title} (${activeTab.id})`);
          
          // If this is the General tab, also check for legacy citations
          if (activeTab.id === 'general-tab') {
            const legacyResult = await browser.storage.local.get(this.storageKey);
            if (legacyResult[this.storageKey] && legacyResult[this.storageKey].nodes) {
              const legacyData = legacyResult[this.storageKey];
              console.log(`Found ${legacyData.nodes.length} legacy citations, merging with General tab`);
              
              // Filter legacy nodes that don't have a tabId (or have general-tab tabId)
              const legacyNodes = legacyData.nodes.filter((node: TreeNode) => 
                !node.tabId || node.tabId === 'general-tab'
              );
              
              // Assign tabId to legacy nodes
              legacyNodes.forEach((node: TreeNode) => {
                if (!node.tabId) {
                  node.tabId = 'general-tab';
                }
              });
              
              // Merge with tab's existing nodes, avoiding duplicates
              const existingNodeIds = new Set(activeTab.treeData.nodes.map((n: TreeNode) => n.id));
              const newLegacyNodes = legacyNodes.filter((node: TreeNode) => !existingNodeIds.has(node.id));
              
              if (newLegacyNodes.length > 0) {
                console.log(`Adding ${newLegacyNodes.length} legacy nodes to General tab`);
                return {
                  nodes: [...activeTab.treeData.nodes, ...newLegacyNodes],
                  currentNodeId: activeTab.treeData.currentNodeId || legacyData.currentNodeId,
                  uiOnlyChange: activeTab.treeData.uiOnlyChange
                };
              }
            }
          }
          
          return activeTab.treeData;
        }
      } catch (error) {
        console.error('Error getting active tab tree data:', error);
      }
    }
    
    // Fallback to old storage format for backward compatibility
    console.log('Falling back to old storage format');
    const result = await browser.storage.local.get({ 
      [this.storageKey]: { nodes: [] as TreeNode[], currentNodeId: null } 
    });
    return result[this.storageKey];
  }

  // Save tree to storage (now updates active tab)
  async saveTree(tree: TreeData): Promise<void> {
    // Check if we have the new tab system
    const tabService = (window as any).CitationLinker?.tabService;
    if (tabService) {
      try {
        const activeTabId = await tabService.getActiveTabId();
        if (activeTabId) {
          console.log(`Saving tree to active tab: ${activeTabId}`);
          await tabService.updateTabTree(activeTabId, tree);
          
          // Mark data as modified for sync (only if not a UI-only change)
          if (!tree.uiOnlyChange && typeof (window as any).syncManager !== 'undefined') {
            await (window as any).syncManager.markAsModified();
          }
          return;
        }
      } catch (error) {
        console.error('Error saving tree to active tab:', error);
      }
    }
    
    // Fallback to old storage format for backward compatibility
    console.log('Falling back to old storage format for save');
    await browser.storage.local.set({ 
      [this.storageKey]: tree,
      lastModified: new Date().toISOString()
    });
    
    // Mark data as modified for sync (only if not a UI-only change)
    if (!tree.uiOnlyChange && typeof (window as any).syncManager !== 'undefined') {
      await (window as any).syncManager.markAsModified();
    }
  }

  // Find a node by ID
  findNode(nodes: TreeNode[], nodeId: number): TreeNode | undefined {
    return nodes.find(node => node.id === nodeId);
  }

  // Get all descendants of a node
  getDescendants(nodes: TreeNode[], nodeId: number): Set<number> {
    const descendants = new Set<number>();
    
    const collectDescendants = (id: number) => {
      descendants.add(id);
      const node = this.findNode(nodes, id);
      if (node && node.children) {
        node.children.forEach(childId => collectDescendants(childId));
      }
    };
    
    collectDescendants(nodeId);
    return descendants;
  }

  // Check if a node is a descendant of another
  isDescendant(nodes: TreeNode[], nodeId: number, potentialAncestorId: number): boolean {
    const node = this.findNode(nodes, nodeId);
    if (!node || node.parentId === null) return false;
    if (node.parentId === potentialAncestorId) return true;
    return this.isDescendant(nodes, node.parentId, potentialAncestorId);
  }

  // Move a node to a new parent
  async moveNode(draggedNodeId: number, targetNodeId: number): Promise<boolean> {
    try {
      const tree = await this.getTree();
      
      const draggedNode = this.findNode(tree.nodes, draggedNodeId);
      const targetNode = this.findNode(tree.nodes, targetNodeId);
      
      if (!draggedNode || !targetNode) {
        console.error('Could not find dragged or target node');
        return false;
      }
      
      // Prevent moving a node to one of its descendants
      if (this.isDescendant(tree.nodes, targetNodeId, draggedNodeId)) {
        console.warn('Cannot move node to its descendant');
        return false;
      }
      
      // Remove from old parent's children
      if (draggedNode.parentId !== null) {
        const oldParent = this.findNode(tree.nodes, draggedNode.parentId);
        if (oldParent) {
          oldParent.children = oldParent.children.filter(childId => childId !== draggedNodeId);
        }
      }
      
      // Ensure target node has children array
      if (!targetNode.children) {
        targetNode.children = [];
      }
      
      // Add to new parent's children if not already there
      if (!targetNode.children.includes(draggedNodeId)) {
        targetNode.children.push(draggedNodeId);
      }
      
      // Update the dragged node's parentId
      draggedNode.parentId = targetNodeId;
      
      console.log(`Moved node ${draggedNodeId} to parent ${targetNodeId}`);
      await this.saveTree(tree);
      
      return true;
    } catch (error) {
      console.error('Error moving node:', error);
      return false;
    }
  }

  // Move a node to root level
  async moveNodeToRoot(nodeId: number): Promise<boolean> {
    try {
      const tree = await this.getTree();
      const node = this.findNode(tree.nodes, nodeId);
      
      if (!node) return false;
      
      // Remove from old parent's children
      if (node.parentId !== null) {
        const oldParent = this.findNode(tree.nodes, node.parentId);
        if (oldParent) {
          oldParent.children = oldParent.children.filter(childId => childId !== nodeId);
        }
      }
      
      // Set as root node
      node.parentId = null;
      
      console.log(`Moved node ${nodeId} to root level`);
      await this.saveTree(tree);
      
      return true;
    } catch (error) {
      console.error('Error moving node to root:', error);
      return false;
    }
  }

  // Shift a node to its parent's level
  async shiftNodeToParent(nodeId: number): Promise<boolean> {
    try {
      const tree = await this.getTree();
      const node = this.findNode(tree.nodes, nodeId);
      
      if (!node || node.parentId === null) {
        console.log('Node has no parent to shift up to');
        return false;
      }
      
      const currentParent = this.findNode(tree.nodes, node.parentId);
      if (!currentParent) {
        console.error('Current parent not found');
        return false;
      }
      
      // Remove from current parent's children
      currentParent.children = currentParent.children.filter(childId => childId !== nodeId);
      
      // Set the node's parent to be its grandparent
      const grandparentId = currentParent.parentId;
      node.parentId = grandparentId;
      
      // If there's a grandparent, add this node to its children
      if (grandparentId !== null) {
        const grandparent = this.findNode(tree.nodes, grandparentId);
        if (grandparent) {
          if (!grandparent.children) {
            grandparent.children = [];
          }
          if (!grandparent.children.includes(nodeId)) {
            grandparent.children.push(nodeId);
          }
        }
      }
      
      console.log(`Shifted node ${nodeId} up to parent level`);
      await this.saveTree(tree);
      
      return true;
    } catch (error) {
      console.error('Error shifting node to parent:', error);
      return false;
    }
  }

  // Delete a node and all its descendants (soft delete)
  async deleteNode(nodeId: number): Promise<boolean> {
    try {
      const tree = await this.getTree();
      const now = new Date().toISOString();
      
      // Find all nodes to soft delete (the node and all its descendants)
      const nodesToDelete = this.getDescendants(tree.nodes, nodeId);
      
      // Mark all collected nodes as deleted (soft delete)
      tree.nodes.forEach(node => {
        if (nodesToDelete.has(node.id)) {
          node.deleted = true;
          node.deletedAt = now;
        }
      });
      
      // If the current node was deleted, clear the current node
      if (tree.currentNodeId && nodesToDelete.has(tree.currentNodeId)) {
        tree.currentNodeId = null;
      }
      
      await this.saveTree(tree);
      console.log(`Successfully deleted node ${nodeId} and ${nodesToDelete.size - 1} descendants`);
      return true;
    } catch (error) {
      console.error('Error deleting node:', error);
      return false;
    }
  }

  // Update current node (for highlighting)
  async setCurrentNode(nodeId: number): Promise<boolean> {
    try {
      const tree = await this.getTree();
      tree.currentNodeId = nodeId;
      tree.uiOnlyChange = true; // Flag to prevent sync
      await this.saveTree(tree);
      return true;
    } catch (error) {
      console.error('Error updating current node:', error);
      return false;
    }
  }

  // Get visible nodes (non-deleted)
  getVisibleNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes.filter(node => !node.deleted);
  }

  // Get root nodes
  getRootNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes.filter(node => node.parentId === null && !node.deleted);
  }

  // Get child nodes of a parent
  getChildNodes(nodes: TreeNode[], parentId?: number | null): TreeNode[] {


    if (parentId === undefined) {
      return this.getVisibleNodes(nodes);
    }
    if (parentId === null){
       return nodes.filter(node => node.parentId === parentId && !node.deleted);
    }
    else{
      return nodes.filter(node => node.parentId === parentId && !node.deleted);
    }

  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  // Initialize global namespace if it doesn't exist
  (window as any).CitationLinker = (window as any).CitationLinker || {};
  
  // Create singleton instance
  const treeServiceInstance = new TreeService();
  
  // Attach to both namespaces for compatibility
  (window as any).CitationLinker.treeService = treeServiceInstance;
  (window as any).treeService = treeServiceInstance; // Legacy support
}

