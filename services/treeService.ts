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

type DropPosition = 'before' | 'after' | 'inside';

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

  // Check whether draggedNodeId may be moved relative to targetNodeId.
  // A node cannot be dropped onto/next to itself or into its own subtree.
  canMoveNode(nodes: TreeNode[], draggedNodeId: number, targetNodeId: number | null): boolean {
    if (!this.findNode(nodes, draggedNodeId)) return false;
    if (targetNodeId === null) return true;
    if (draggedNodeId === targetNodeId) return false;
    if (!this.findNode(nodes, targetNodeId)) return false;
    return !this.isDescendant(nodes, targetNodeId, draggedNodeId);
  }

  // Pure tree mutation used by all move operations.
  //   position 'inside' -> dragged becomes the last child of target
  //   position 'before' / 'after' -> dragged becomes a sibling of target,
  //                                  placed immediately before/after it
  //   targetNodeId null -> dragged becomes the last root node
  // Sibling order is the order of nodes in tree.nodes (that is what the
  // renderer uses), and each parent's children[] array is kept in the same order.
  applyMove(tree: TreeData, draggedNodeId: number, targetNodeId: number | null, position: DropPosition): boolean {
    const nodes = tree.nodes;
    if (!this.canMoveNode(nodes, draggedNodeId, targetNodeId)) return false;

    const dragged = this.findNode(nodes, draggedNodeId)!;
    const target = targetNodeId === null ? undefined : this.findNode(nodes, targetNodeId)!;
    const newParentId: number | null =
      !target ? null : position === 'inside' ? target.id : target.parentId;

    // Detach from old parent
    if (dragged.parentId !== null) {
      const oldParent = this.findNode(nodes, dragged.parentId);
      if (oldParent && oldParent.children) {
        oldParent.children = oldParent.children.filter(id => id !== draggedNodeId);
      }
    }

    // Reposition the dragged node within the flat nodes array
    nodes.splice(nodes.indexOf(dragged), 1);
    let insertAt: number;
    if (!target) {
      insertAt = nodes.length;
    } else if (position === 'before') {
      insertAt = nodes.indexOf(target);
    } else if (position === 'after') {
      insertAt = nodes.indexOf(target) + 1;
    } else {
      // inside: after the target's last existing child (or right after target)
      let last = nodes.indexOf(target);
      nodes.forEach((n, i) => {
        if (n.parentId === target.id && i > last) last = i;
      });
      insertAt = last + 1;
    }
    nodes.splice(insertAt, 0, dragged);
    dragged.parentId = newParentId;

    // Rebuild the new parent's children[] in render (array) order
    if (newParentId !== null) {
      const newParent = this.findNode(nodes, newParentId)!;
      const existing = (newParent.children || []).filter(id => id !== draggedNodeId);
      const ordered = nodes
        .filter(n => n.parentId === newParentId && (n.id === draggedNodeId || existing.includes(n.id)))
        .map(n => n.id);
      // keep any ids that reference nodes not found (defensive) at the end
      existing.forEach(id => { if (!ordered.includes(id)) ordered.push(id); });
      newParent.children = ordered;
    }
    return true;
  }

  // Move a node relative to another node (or to root when targetNodeId is null)
  async moveNodeRelative(draggedNodeId: number, targetNodeId: number | null, position: DropPosition): Promise<boolean> {
    try {
      const tree = await this.getTree();
      const nodes = tree.nodes || [];
      if (!this.findNode(nodes, draggedNodeId) || (targetNodeId !== null && !this.findNode(nodes, targetNodeId))) {
        console.error('Could not find dragged or target node');
        return false;
      }
      if (targetNodeId !== null && (draggedNodeId === targetNodeId || this.isDescendant(nodes, targetNodeId, draggedNodeId))) {
        console.warn('Cannot move node to its descendant');
        return false;
      }
      if (!this.applyMove(tree, draggedNodeId, targetNodeId, position)) return false;
      console.log(`Moved node ${draggedNodeId} ${position} ${targetNodeId === null ? 'root' : targetNodeId}`);
      await this.saveTree(tree);
      return true;
    } catch (error) {
      console.error(targetNodeId === null ? 'Error moving node to root:' : 'Error moving node:', error);
      return false;
    }
  }

  // Move a node to a new parent (becomes its last child)
  async moveNode(draggedNodeId: number, targetNodeId: number): Promise<boolean> {
    return this.moveNodeRelative(draggedNodeId, targetNodeId, 'inside');
  }

  // Move a node to root level (becomes the last root node)
  async moveNodeToRoot(nodeId: number): Promise<boolean> {
    return this.moveNodeRelative(nodeId, null, 'inside');
  }

  // Shift a node to its parent's level (placed right after its former parent)
  async shiftNodeToParent(nodeId: number): Promise<boolean> {
    try {
      const tree = await this.getTree();
      const node = this.findNode(tree.nodes, nodeId);
      if (!node || node.parentId === null) {
        console.log('Node has no parent to shift up to');
        return false;
      }
      if (!this.findNode(tree.nodes, node.parentId)) {
        console.error('Current parent not found');
        return false;
      }
      if (!this.applyMove(tree, nodeId, node.parentId, 'after')) return false;
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
