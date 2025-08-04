/**
 * @jest-environment jsdom
 */

// Import types using ES6 exports (these work in tests)
import { TreeNode, TreeData, TreeRepairResult } from '../types/treeTypes';

// Load service file that populates global namespace
require('../services/treeValidationService');

// Extract class from global namespace
const TreeValidationService = (global as any).treeValidationService.constructor;

describe('TreeValidationService', () => {
  let treeValidationService: any;

  beforeEach(() => {
    treeValidationService = new TreeValidationService();
    
    // Mock browser storage
    (global as any).browser = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined)
        }
      }
    };
    
    // Mock console
    global.console = {
      ...global.console,
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
  });

  describe('validateAndRepairTree', () => {
    it('should handle invalid tree structure', () => {
      const invalidTree: any = null;
      const result = treeValidationService.validateAndRepairTree(invalidTree);
      
      expect(result).toEqual({
        nodes: [],
        currentNodeId: null,
        repaired: false,
        repairs: []
      });
      expect(console.warn).toHaveBeenCalledWith('Invalid tree structure, initializing empty tree');
    });

    it('should handle tree without nodes array', () => {
      const invalidTree: any = { nodes: null };
      const result = treeValidationService.validateAndRepairTree(invalidTree);
      
      expect(result).toEqual({
        nodes: [],
        currentNodeId: null,
        repaired: false,
        repairs: []
      });
    });

    it('should validate valid tree without modifications', () => {
      const validTree: TreeData = {
        nodes: [
          { id: 1, text: 'Root', url: 'https://example.com', timestamp: '2023-01-01', parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      const result = treeValidationService.validateAndRepairTree(validTree);
      
      expect(result.repaired).toBe(false);
      expect(result.nodes).toEqual(validTree.nodes);
      expect(result.currentNodeId).toBe(1);
    });
  });

  describe('findOrphanedNodes', () => {
    it('should find nodes with missing parents', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Valid root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] },
        { id: 2, text: 'Orphaned node', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 999, children: [] }, // Parent 999 doesn't exist
        { id: 3, text: 'Another valid root', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const nodeIds = new Set([1, 2, 3]);
      const orphanedNodes = treeValidationService['findOrphanedNodes'](nodes, nodeIds);
      
      expect(orphanedNodes).toHaveLength(1);
      expect(orphanedNodes[0].id).toBe(2);
    });

    it('should not find orphaned nodes in valid tree', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2] },
        { id: 2, text: 'Child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] }
      ];
      
      const nodeIds = new Set([1, 2]);
      const orphanedNodes = treeValidationService['findOrphanedNodes'](nodes, nodeIds);
      
      expect(orphanedNodes).toHaveLength(0);
    });
  });

  describe('repairOrphanedNodes', () => {
    it('should promote orphaned nodes to root level', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Valid root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] },
        { id: 2, text: 'Orphaned node', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 999, children: [] }
      ];
      
      const orphanedNodes = [nodes[1]];
      const modified = treeValidationService['repairOrphanedNodes'](nodes, orphanedNodes);
      
      expect(modified).toBe(true);
      expect(nodes[1].parentId).toBeNull();
      expect(console.log).toHaveBeenCalledWith('Found orphaned nodes:', [{ id: 2, missingParent: 999 }]);
      expect(console.log).toHaveBeenCalledWith('Promoting orphaned node 2 to root (was child of missing node 999)');
    });

    it('should handle empty orphaned nodes array', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const modified = treeValidationService['repairOrphanedNodes'](nodes, []);
      
      expect(modified).toBe(false);
    });
  });

  describe('groupOrphanedNodesIntoChains', () => {
    it('should group orphaned nodes into chains', () => {
      const allNodes: TreeNode[] = [
        { id: 1, text: 'Orphaned parent', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: 999, children: [2] },
        { id: 2, text: 'Orphaned child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [3] },
        { id: 3, text: 'Orphaned grandchild', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 2, children: [] }
      ];
      
      const orphanedNodes = [allNodes[0]]; // Only the root of the chain
      const chains = treeValidationService['groupOrphanedNodesIntoChains'](allNodes, orphanedNodes);
      
      expect(chains).toHaveLength(1);
      expect(chains[0]).toHaveLength(3);
      expect(chains[0][0].id).toBe(1);
      expect(chains[0][1].id).toBe(2);
      expect(chains[0][2].id).toBe(3);
    });

    it('should handle single orphaned nodes', () => {
      const allNodes: TreeNode[] = [
        { id: 1, text: 'Single orphan', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: 999, children: [] }
      ];
      
      const orphanedNodes = [allNodes[0]];
      const chains = treeValidationService['groupOrphanedNodesIntoChains'](allNodes, orphanedNodes);
      
      expect(chains).toHaveLength(1);
      expect(chains[0]).toHaveLength(1);
      expect(chains[0][0].id).toBe(1);
    });
  });

  describe('repairChildrenArrays', () => {
    it('should add missing children arrays', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Node without children', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null } as TreeNode,
        { id: 2, text: 'Child node', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] }
      ];
      
      const modified = treeValidationService['repairChildrenArrays'](nodes);
      
      expect(modified).toBe(true);
      expect(nodes[0].children).toEqual([2]);
      expect(console.log).toHaveBeenCalledWith('Adding missing children to node 1:', [2]);
    });

    it('should remove invalid children', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Node with invalid child', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2, 999] }, // 999 doesn't exist
        { id: 2, text: 'Valid child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] }
      ];
      
      const modified = treeValidationService['repairChildrenArrays'](nodes);
      
      expect(modified).toBe(true);
      expect(nodes[0].children).toEqual([2]);
      expect(console.log).toHaveBeenCalledWith('Removing invalid children from node 1:', [999]);
    });

    it('should not modify valid children arrays', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2] },
        { id: 2, text: 'Child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] }
      ];
      
      const modified = treeValidationService['repairChildrenArrays'](nodes);
      
      expect(modified).toBe(false);
      expect(nodes[0].children).toEqual([2]);
      expect(nodes[1].children).toEqual([]);
    });
  });

  describe('validateCurrentNodeId', () => {
    it('should clear invalid current node ID', () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Valid node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
        ],
        currentNodeId: 999 // Invalid node ID
      };
      
      const modified = treeValidationService['validateCurrentNodeId'](tree);
      
      expect(modified).toBe(true);
      expect(tree.currentNodeId).toBeNull();
      expect(console.log).toHaveBeenCalledWith('Current node 999 doesn\'t exist, clearing currentNodeId');
    });

    it('should NOT clear deleted current node ID (UI handles deleted nodes)', () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Test', url: 'https://example.com', timestamp: '2023-01-01', parentId: null, children: [], deleted: true, deletedAt: '2023-01-02' }
        ],
        currentNodeId: 1
      };

      const modified = treeValidationService['validateCurrentNodeId'](tree);

      expect(modified).toBe(false);
      expect(tree.currentNodeId).toBe(1); // Should remain unchanged
      // No console.log should be called for deleted nodes
    });

    it('should not modify valid current node ID', () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Valid node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      const modified = treeValidationService['validateCurrentNodeId'](tree);
      
      expect(modified).toBe(false);
      expect(tree.currentNodeId).toBe(1);
    });

    it('should handle null current node ID', () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Valid node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
        ],
        currentNodeId: null
      };
      
      const modified = treeValidationService['validateCurrentNodeId'](tree);
      
      expect(modified).toBe(false);
      expect(tree.currentNodeId).toBeNull();
    });
  });

  describe('repairTreeIntegrity', () => {
    it('should repair tree and save to storage when modified', async () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Orphaned node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: 999, children: [] }
        ],
        currentNodeId: 1
      };
      
      const result = await treeValidationService.repairTreeIntegrity(tree);
      
      expect(result.repaired).toBe(true);
      expect(result.nodes[0].parentId).toBeNull();
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, parentId: null })
          ]),
          currentNodeId: 1,
          fromRepair: true
        }),
        lastModified: expect.any(String)
      });
      expect(console.log).toHaveBeenCalledWith('Tree structure repaired, saving changes...');
      expect(console.log).toHaveBeenCalledWith('Repaired tree saved to local storage');
    });

    it('should not save when tree is not modified', async () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Valid node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      const result = await treeValidationService.repairTreeIntegrity(tree);
      
      expect(result.repaired).toBe(false);
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should trigger sync when user is logged in', async () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Orphaned node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: 999, children: [] }
        ],
        currentNodeId: 1
      };
      
      // Mock sync manager
      (window as any).syncInitialized = true;
      (window as any).authManager = { isLoggedIn: jest.fn().mockReturnValue(true) };
      (window as any).syncManager = { markAsModified: jest.fn() };
      
      await treeValidationService.repairTreeIntegrity(tree);
      
      expect((window as any).syncManager.markAsModified).toHaveBeenCalled();
    });

    it('should not trigger sync when user is not logged in', async () => {
      const tree: TreeData = {
        nodes: [
          { id: 1, text: 'Orphaned node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: 999, children: [] }
        ],
        currentNodeId: 1
      };
      
      // Mock sync manager
      (window as any).syncInitialized = true;
      (window as any).authManager = { isLoggedIn: jest.fn().mockReturnValue(false) };
      (window as any).syncManager = { markAsModified: jest.fn() };
      
      await treeValidationService.repairTreeIntegrity(tree);
      
      expect((window as any).syncManager.markAsModified).not.toHaveBeenCalled();
    });
  });
});
