// treeValidationService.ts - Tree validation and repair functionality
import { TreeNode, TreeData, TreeRepairResult } from '../types/treeTypes';

interface RepairRecord {
  type: string;
  nodeId?: number;
  invalidNodeId?: number | null;
  originalParentId?: number | null;
  chainLength?: number;
  removedChildren?: number[];
  addedChildren?: number[];
}

export class TreeValidationService {
  private repairs: RepairRecord[];

  constructor() {
    this.repairs = [];
  }

  // Main validation and repair function
  validateAndRepairTree(tree: TreeData): TreeRepairResult {
    if (!tree || !tree.nodes || !Array.isArray(tree.nodes)) {
      console.warn('Invalid tree structure, initializing empty tree');
      return {
        nodes: [],
        currentNodeId: null,
        repaired: false,
        repairs: []
      };
    }

    this.repairs = [];
    const nodeIds = new Set(tree.nodes.map(node => node.id));
    let modified = false;

    // Find and fix orphaned nodes
    const orphanedNodes = this.findOrphanedNodes(tree.nodes, nodeIds);
    if (orphanedNodes.length > 0) {
      modified = this.repairOrphanedNodes(tree.nodes, orphanedNodes) || modified;
    }

    // Validate and repair children arrays
    modified = this.repairChildrenArrays(tree.nodes) || modified;

    // Validate currentNodeId
    modified = this.validateCurrentNodeId(tree) || modified;

    if (this.repairs.length > 0) {
      console.log('Tree repair completed:', this.repairs);
    }

    return {
      ...tree,
      repaired: modified,
      repairs: this.repairs
    };
  }

  // Find orphaned nodes (nodes whose parent doesn't exist)
  findOrphanedNodes(nodes: TreeNode[], nodeIds: Set<number>): TreeNode[] {
    return nodes.filter(node => 
      node.parentId !== null && !nodeIds.has(node.parentId)
    );
  }

  // Repair orphaned nodes by promoting them to root
  repairOrphanedNodes(nodes: TreeNode[], orphanedNodes: TreeNode[]): boolean {
    if (orphanedNodes.length === 0) return false;

    console.log('Found orphaned nodes:', orphanedNodes.map(n => ({ 
      id: n.id, 
      missingParent: n.parentId 
    })));

    // Group orphaned nodes into chains
    const orphanedChains = this.groupOrphanedNodesIntoChains(nodes, orphanedNodes);
    
    orphanedChains.forEach(chain => {
      const rootNode = chain[0]; // First node in chain becomes root
      const originalParentId = rootNode.parentId;
      
      console.log(`Promoting orphaned node ${rootNode.id} to root (was child of missing node ${originalParentId})`);
      
      rootNode.parentId = null;
      
      this.repairs.push({
        type: 'promoted_to_root',
        nodeId: rootNode.id,
        originalParentId: originalParentId,
        chainLength: chain.length
      });
    });

    return true;
  }

  // Group orphaned nodes into chains
  groupOrphanedNodesIntoChains(allNodes: TreeNode[], orphanedNodes: TreeNode[]): TreeNode[][] {
    const chains: TreeNode[][] = [];
    const processed = new Set<number>();

    orphanedNodes.forEach(orphanedNode => {
      if (processed.has(orphanedNode.id)) return;

      // Find the chain starting from this orphaned node
      const chain: TreeNode[] = [orphanedNode];
      processed.add(orphanedNode.id);

      // Follow the chain downward (children of this orphaned node)
      let currentNode = orphanedNode;
      while (true) {
        const child = allNodes.find(node => node.parentId === currentNode.id);
        if (!child) break;
        
        chain.push(child);
        processed.add(child.id);
        currentNode = child;
      }

      chains.push(chain);
    });

    return chains;
  }

  // Repair children arrays to match parent-child relationships
  repairChildrenArrays(nodes: TreeNode[]): boolean {
    let modified = false;

    nodes.forEach(node => {
      if (!node.children) {
        node.children = [];
      }

      // Find actual children based on parentId references
      const actualChildren = nodes
        .filter(child => child.parentId === node.id)
        .map(child => child.id);

      // Check if children array matches actual parent-child relationships
      const currentChildren = new Set(node.children);
      const expectedChildren = new Set(actualChildren);
      
      // Remove invalid children
      const invalidChildren = node.children.filter(childId => !expectedChildren.has(childId));
      if (invalidChildren.length > 0) {
        console.log(`Removing invalid children from node ${node.id}:`, invalidChildren);
        node.children = node.children.filter(childId => expectedChildren.has(childId));
        modified = true;
        
        this.repairs.push({
          type: 'removed_invalid_children',
          nodeId: node.id,
          removedChildren: invalidChildren
        });
      }

      // Add missing children
      const missingChildren = actualChildren.filter(childId => !currentChildren.has(childId));
      if (missingChildren.length > 0) {
        console.log(`Adding missing children to node ${node.id}:`, missingChildren);
        node.children.push(...missingChildren);
        modified = true;
        
        this.repairs.push({
          type: 'added_missing_children',
          nodeId: node.id,
          addedChildren: missingChildren
        });
      }
    });

    return modified;
  }

  // Validate currentNodeId
  validateCurrentNodeId(tree: TreeData): boolean {
    if (tree.currentNodeId === null) return false;

    const currentNode = tree.nodes.find(node => node.id === tree.currentNodeId);
    
    if (!currentNode) {
      console.log(`Current node ${tree.currentNodeId} doesn't exist, clearing currentNodeId`);
      tree.currentNodeId = null;
      
      this.repairs.push({
        type: 'cleared_invalid_current_node',
        invalidNodeId: tree.currentNodeId
      });
      
      return true;
    }
    
    if (currentNode.deleted) {
      console.log(`Current node ${tree.currentNodeId} is deleted, clearing currentNodeId`);
      tree.currentNodeId = null;
      
      this.repairs.push({
        type: 'cleared_deleted_current_node',
        invalidNodeId: tree.currentNodeId
      });
      
      return true;
    }

    return false;
  }

  // Repair tree and save if needed
  async repairTreeIntegrity(tree: TreeData): Promise<TreeRepairResult> {
    const repairResult = this.validateAndRepairTree(tree);
    
    if (repairResult.repaired) {
      console.log('Tree structure repaired, saving changes...');
      
      // Save the repaired tree back to storage
      await browser.storage.local.set({ 
        citationTree: {
          nodes: repairResult.nodes,
          currentNodeId: repairResult.currentNodeId,
          fromRepair: true // Flag to prevent sync conflicts
        },
        lastModified: new Date().toISOString()
      });
      
      console.log('Repaired tree saved to local storage');
      
      // Trigger sync if needed
      if (typeof window !== 'undefined' && (window as any).syncInitialized && (window as any).authManager?.isLoggedIn()) {
        (window as any).syncManager.markAsModified();
      }
    }

    return repairResult;
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).treeValidationService = new TreeValidationService();
}
