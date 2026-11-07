/**
 * @jest-environment jsdom
 */

// Import types using ES6 exports (these work in tests)
import { TreeNode, TreeData } from '../types/treeTypes';

// Load service file that creates window.treeService
require('../services/treeService');

// Extract class from window object
const TreeServiceClass = (global as any).window.CitationLinker?.treeService?.constructor || (global as any).window.treeService?.constructor;

describe('TreeService', () => {
  let treeService: any;

  beforeEach(() => {
    treeService = new TreeServiceClass();
    
    // Mock browser storage
    (global as any).browser = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined)
        }
      }
    };
  });

  describe('getTree', () => {
    it('should return tree data from storage', async () => {
      const mockTree: TreeData = {
        nodes: [{ id: 1, text: 'Test', url: 'https://example.com', timestamp: '2023-01-01', parentId: null, children: [] }],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
      
      const tree = await treeService.getTree();
      
      expect(tree).toEqual(mockTree);
      expect(browser.storage.local.get).toHaveBeenCalledWith({ citationTree: { nodes: [], currentNodeId: null } });
    });

    it('should return default empty tree when no data exists', async () => {
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: { nodes: [], currentNodeId: null } });
      
      const tree = await treeService.getTree();
      
      expect(tree).toEqual({ nodes: [], currentNodeId: null });
    });
  });

  describe('saveTree', () => {
    it('should save tree data to storage', async () => {
      const mockTree: TreeData = {
        nodes: [{ id: 1, text: 'Test', url: 'https://example.com', timestamp: '2023-01-01', parentId: null, children: [] }],
        currentNodeId: 1
      };
      
      await treeService.saveTree(mockTree);
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: mockTree,
        lastModified: expect.any(String)
      });
    });
  });

  describe('findNode', () => {
    it('should find node by ID', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Node 1', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] },
        { id: 2, text: 'Node 2', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const foundNode = treeService.findNode(nodes, 2);
      
      expect(foundNode).toEqual(nodes[1]);
    });

    it('should return undefined for non-existent node', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Node 1', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const foundNode = treeService.findNode(nodes, 999);
      
      expect(foundNode).toBeUndefined();
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants of a node', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2, 3] },
        { id: 2, text: 'Child 1', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [4] },
        { id: 3, text: 'Child 2', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 1, children: [] },
        { id: 4, text: 'Grandchild', url: 'https://example.com/4', timestamp: '2023-01-01', parentId: 2, children: [] }
      ];
      
      const descendants = treeService.getDescendants(nodes, 1);
      
      expect(descendants).toBeInstanceOf(Set);
      expect(descendants.size).toBe(4);
      expect(descendants.has(1)).toBe(true);
      expect(descendants.has(2)).toBe(true);
      expect(descendants.has(3)).toBe(true);
      expect(descendants.has(4)).toBe(true);
    });

    it('should return only the node itself when it has no children', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const descendants = treeService.getDescendants(nodes, 1);
      
      expect(descendants.size).toBe(1);
      expect(descendants.has(1)).toBe(true);
    });
  });

  describe('isDescendant', () => {
    let testNodes: TreeNode[];

    beforeEach(() => {
      testNodes = [
        { id: 1, text: 'Root', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2, 3] },
        { id: 2, text: 'Child 1', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [4] },
        { id: 3, text: 'Child 2', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 1, children: [] },
        { id: 4, text: 'Grandchild', url: 'https://example.com/4', timestamp: '2023-01-01', parentId: 2, children: [] }
      ];
    });

    it('should return true when node is a descendant', () => {
      expect(treeService.isDescendant(testNodes, 4, 1)).toBe(true); // Grandchild is descendant of root
      expect(treeService.isDescendant(testNodes, 2, 1)).toBe(true); // Child is descendant of root
    });

    it('should return false when node is not a descendant', () => {
      expect(treeService.isDescendant(testNodes, 3, 4)).toBe(false); // Child 2 is not descendant of grandchild
      expect(treeService.isDescendant(testNodes, 1, 2)).toBe(false); // Root is not descendant of child
    });

    it('should return false for non-existent nodes', () => {
      expect(treeService.isDescendant(testNodes, 999, 1)).toBe(false);
    });

    it('should return false for root nodes', () => {
      expect(treeService.isDescendant(testNodes, 1, 1)).toBe(false); // Node is not descendant of itself
    });
  });

  describe('moveNode', () => {
    let mockTree: TreeData;

    beforeEach(() => {
      mockTree = {
        nodes: [
          { id: 1, text: 'Parent 1', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2] },
          { id: 2, text: 'Child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] },
          { id: 3, text: 'Parent 2', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
    });

    it('should move node to new parent', async () => {
      const result = await treeService.moveNode(2, 3);
      
      expect(result).toBe(true);
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, children: [] }),
            expect.objectContaining({ id: 2, parentId: 3 }),
            expect.objectContaining({ id: 3, children: [2] })
          ])
        }),
        lastModified: expect.any(String)
      });
    });

    it('should prevent moving node to its descendant', async () => {
      const mockTreeWithDescendants: TreeData = {
        nodes: [
          { id: 1, text: 'Parent', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2] },
          { id: 2, text: 'Child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [3] },
          { id: 3, text: 'Grandchild', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 2, children: [] }
        ],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTreeWithDescendants });
      
      const result = await treeService.moveNode(1, 3); // Try to move parent to its grandchild
      
      expect(result).toBe(false);
      expect(console.warn).toHaveBeenCalledWith('Cannot move node to its descendant');
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle missing nodes gracefully', async () => {
      const result = await treeService.moveNode(999, 888); // Non-existent nodes
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Could not find dragged or target node');
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle storage errors', async () => {
      (browser.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      const result = await treeService.moveNode(1, 2);
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error moving node:', expect.any(Error));
    });
  });

  describe('moveNodeToRoot', () => {
    let mockTree: TreeData;

    beforeEach(() => {
      mockTree = {
        nodes: [
          { id: 1, text: 'Parent', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2] },
          { id: 2, text: 'Child to move', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] }
        ],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
    });

    it('should move node to root level', async () => {
      const result = await treeService.moveNodeToRoot(2);
      
      expect(result).toBe(true);
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, children: [] }),
            expect.objectContaining({ id: 2, parentId: null })
          ])
        }),
        lastModified: expect.any(String)
      });
    });

    it('should handle node not found', async () => {
      const result = await treeService.moveNodeToRoot(999);
      
      expect(result).toBe(false);
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle storage errors', async () => {
      (browser.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      const result = await treeService.moveNodeToRoot(1);
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error moving node to root:', expect.any(Error));
    });
  });

  describe('shiftNodeToParent', () => {
    let mockTree: TreeData;

    beforeEach(() => {
      mockTree = {
        nodes: [
          { id: 1, text: 'Grandparent', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2] },
          { id: 2, text: 'Parent', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [3] },
          { id: 3, text: 'Child to shift', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 2, children: [] }
        ],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
    });

    it('should shift node up to parent level', async () => {
      const result = await treeService.shiftNodeToParent(3);
      
      expect(result).toBe(true);
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, children: [2, 3] }),
            expect.objectContaining({ id: 2, children: [] }),
            expect.objectContaining({ id: 3, parentId: 1 })
          ])
        }),
        lastModified: expect.any(String)
      });
    });

    it('should handle node with no parent', async () => {
      const mockRootTree: TreeData = {
        nodes: [
          { id: 1, text: 'Root node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockRootTree });
      
      const result = await treeService.shiftNodeToParent(1);
      
      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith('Node has no parent to shift up to');
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle missing parent node', async () => {
      const mockTreeWithMissingParent: TreeData = {
        nodes: [
          { id: 1, text: 'Node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: 999, children: [] } // Parent 999 doesn't exist
        ],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTreeWithMissingParent });
      
      const result = await treeService.shiftNodeToParent(1);
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Current parent not found');
    });

    it('should handle storage errors', async () => {
      (browser.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      const result = await treeService.shiftNodeToParent(1);
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error shifting node to parent:', expect.any(Error));
    });
  });

  describe('deleteNode', () => {
    let mockTree: TreeData;

    beforeEach(() => {
      mockTree = {
        nodes: [
          { id: 1, text: 'Parent', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2] },
          { id: 2, text: 'Child to delete', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [3] },
          { id: 3, text: 'Grandchild', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 2, children: [] }
        ],
        currentNodeId: 1
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
    });

    it('should soft delete node and all its descendants', async () => {
      const result = await treeService.deleteNode(2);
      
      expect(result).toBe(true);
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 1, children: [2] }), // Parent children array unchanged
            expect.objectContaining({ id: 2, deleted: true, deletedAt: expect.any(String) }),
            expect.objectContaining({ id: 3, deleted: true, deletedAt: expect.any(String) })
          ])
        }),
        lastModified: expect.any(String)
      });
    });

    it('should clear current node if deleted node was current', async () => {
      mockTree.currentNodeId = 2;
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
      
      const result = await treeService.deleteNode(2);
      
      expect(result).toBe(true);
      const savedTree = (browser.storage.local.set as jest.Mock).mock.calls[0][0].citationTree;
      expect(savedTree.currentNodeId).toBeNull();
    });

    it('should clear current node if current node is a descendant of deleted node', async () => {
      mockTree.currentNodeId = 3; // Grandchild
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
      
      const result = await treeService.deleteNode(2); // Delete parent
      
      expect(result).toBe(true);
      const savedTree = (browser.storage.local.set as jest.Mock).mock.calls[0][0].citationTree;
      expect(savedTree.currentNodeId).toBeNull();
    });

    it('should not affect current node if it is not related to deleted node', async () => {
      mockTree.currentNodeId = 1; // Unrelated node
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
      
      const result = await treeService.deleteNode(2);
      
      expect(result).toBe(true);
      const savedTree = (browser.storage.local.set as jest.Mock).mock.calls[0][0].citationTree;
      expect(savedTree.currentNodeId).toBe(1);
    });

    it('should handle storage errors', async () => {
      (browser.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      const result = await treeService.deleteNode(1);
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error deleting node:', expect.any(Error));
    });
  });

  describe('setCurrentNode', () => {
    it('should update current node ID', async () => {
      const mockTree: TreeData = {
        nodes: [{ id: 1, text: 'Test', url: 'https://example.com', timestamp: '2023-01-01', parentId: null, children: [] }],
        currentNodeId: null
      };
      
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: mockTree });
      
      const result = await treeService.setCurrentNode(1);
      
      expect(result).toBe(true);
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          currentNodeId: 1
        }),
        lastModified: expect.any(String)
      });
    });

    it('should handle storage errors', async () => {
      (browser.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      const result = await treeService.setCurrentNode(1);
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error updating current node:', expect.any(Error));
    });
  });

  describe('getVisibleNodes', () => {
    it('should return only non-deleted nodes', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Active node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] },
        { id: 2, text: 'Deleted node', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: null, children: [], deleted: true, deletedAt: '2023-01-02' },
        { id: 3, text: 'Another active node', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const visibleNodes = treeService.getVisibleNodes(nodes);
      
      expect(visibleNodes).toHaveLength(2);
      expect(visibleNodes[0].id).toBe(1);
      expect(visibleNodes[1].id).toBe(3);
    });
  });

  describe('getRootNodes', () => {
    it('should return only root nodes (parentId === null) that are not deleted', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Root 1', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] },
        { id: 2, text: 'Child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] },
        { id: 3, text: 'Root 2', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: null, children: [] },
        { id: 4, text: 'Deleted root', url: 'https://example.com/4', timestamp: '2023-01-01', parentId: null, children: [], deleted: true, deletedAt: '2023-01-02' }
      ];
      
      const rootNodes = treeService.getRootNodes(nodes);
      
      expect(rootNodes).toHaveLength(2);
      expect(rootNodes[0].id).toBe(1);
      expect(rootNodes[1].id).toBe(3);
    });
  });

  describe('getChildNodes', () => {
    it('should return child nodes of specified parent', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Parent', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2, 3] },
        { id: 2, text: 'Child 1', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] },
        { id: 3, text: 'Child 2', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 1, children: [] },
        { id: 4, text: 'Other node', url: 'https://example.com/4', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const childNodes = treeService.getChildNodes(nodes, 1);
      
      expect(childNodes).toHaveLength(2);
      expect(childNodes[0].id).toBe(2);
      expect(childNodes[1].id).toBe(3);
    });

    it('should return empty array for non-existent parent', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Node', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [] }
      ];
      
      const childNodes = treeService.getChildNodes(nodes, 999);
      
      expect(childNodes).toHaveLength(0);
    });

    it('should exclude deleted child nodes', () => {
      const nodes: TreeNode[] = [
        { id: 1, text: 'Parent', url: 'https://example.com/1', timestamp: '2023-01-01', parentId: null, children: [2, 3] },
        { id: 2, text: 'Active child', url: 'https://example.com/2', timestamp: '2023-01-01', parentId: 1, children: [] },
        { id: 3, text: 'Deleted child', url: 'https://example.com/3', timestamp: '2023-01-01', parentId: 1, children: [], deleted: true, deletedAt: '2023-01-02' }
      ];
      
      const childNodes = treeService.getChildNodes(nodes, 1);
      
      expect(childNodes).toHaveLength(1);
      expect(childNodes[0].id).toBe(2);
    });
  });

  describe('drag-and-drop moves (applyMove / moveNodeRelative)', () => {
    const mk = (id: number, parentId: number | null, children: number[] = []): TreeNode => ({
      id, text: `N${id}`, url: `https://example.com/${id}`, timestamp: '2023-01-01', parentId, children
    });
    // Tree:
    //  1
    //  ├─ 2
    //  │  └─ 5
    //  └─ 3
    //  4
    const build = (): TreeData => ({
      nodes: [mk(1, null, [2, 3]), mk(2, 1, [5]), mk(3, 1), mk(4, null), mk(5, 2)],
      currentNodeId: null
    });
    const order = (tree: TreeData, parentId: number | null) =>
      tree.nodes.filter(n => n.parentId === parentId).map(n => n.id);

    it('canMoveNode rejects self, descendants and unknown ids', () => {
      const t = build();
      expect(treeService.canMoveNode(t.nodes, 1, 1)).toBe(false);
      expect(treeService.canMoveNode(t.nodes, 1, 5)).toBe(false);
      expect(treeService.canMoveNode(t.nodes, 2, 5)).toBe(false);
      expect(treeService.canMoveNode(t.nodes, 99, 1)).toBe(false);
      expect(treeService.canMoveNode(t.nodes, 1, 99)).toBe(false);
      expect(treeService.canMoveNode(t.nodes, 5, 1)).toBe(true);
      expect(treeService.canMoveNode(t.nodes, 5, null)).toBe(true);
    });

    it("'inside' makes the node the last child of the target", () => {
      const t = build();
      expect(treeService.applyMove(t, 4, 1, 'inside')).toBe(true);
      expect(order(t, 1)).toEqual([2, 3, 4]);
      expect(treeService.findNode(t.nodes, 1).children).toEqual([2, 3, 4]);
      expect(treeService.findNode(t.nodes, 4).parentId).toBe(1);
      expect(order(t, null)).toEqual([1]);
    });

    it("'before' reorders among siblings", () => {
      const t = build();
      expect(treeService.applyMove(t, 3, 2, 'before')).toBe(true);
      expect(order(t, 1)).toEqual([3, 2]);
      expect(treeService.findNode(t.nodes, 1).children).toEqual([3, 2]);
    });

    it("'after' reorders root nodes", () => {
      const t = build();
      expect(treeService.applyMove(t, 1, 4, 'after')).toBe(true);
      expect(order(t, null)).toEqual([4, 1]);
      // subtree stays attached
      expect(order(t, 1)).toEqual([2, 3]);
    });

    it("'before'/'after' a node in another parent reparents at that index", () => {
      const t = build();
      expect(treeService.applyMove(t, 4, 3, 'before')).toBe(true);
      expect(treeService.findNode(t.nodes, 4).parentId).toBe(1);
      expect(order(t, 1)).toEqual([2, 4, 3]);
      expect(treeService.findNode(t.nodes, 1).children).toEqual([2, 4, 3]);

      expect(treeService.applyMove(t, 5, 4, 'after')).toBe(true);
      expect(treeService.findNode(t.nodes, 2).children).toEqual([]);
      expect(order(t, 1)).toEqual([2, 4, 5, 3]);
    });

    it('moving a nested node next to a root node makes it a root', () => {
      const t = build();
      expect(treeService.applyMove(t, 5, 1, 'before')).toBe(true);
      expect(treeService.findNode(t.nodes, 5).parentId).toBeNull();
      expect(order(t, null)).toEqual([5, 1, 4]);
      expect(treeService.findNode(t.nodes, 2).children).toEqual([]);
    });

    it('null target moves the node to the end of the root list', () => {
      const t = build();
      expect(treeService.applyMove(t, 2, null, 'inside')).toBe(true);
      expect(order(t, null)).toEqual([1, 4, 2]);
      expect(treeService.findNode(t.nodes, 1).children).toEqual([3]);
      expect(order(t, 2)).toEqual([5]);
    });

    it('refuses to move a node into its own subtree and leaves the tree untouched', () => {
      const t = build();
      const before = JSON.stringify(t);
      expect(treeService.applyMove(t, 1, 5, 'inside')).toBe(false);
      expect(treeService.applyMove(t, 1, 2, 'before')).toBe(false);
      expect(treeService.applyMove(t, 2, 2, 'after')).toBe(false);
      expect(JSON.stringify(t)).toBe(before);
    });

    it('moveNodeRelative persists the reordered tree', async () => {
      const t = build();
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: t });
      const result = await treeService.moveNodeRelative(3, 2, 'before');
      expect(result).toBe(true);
      const saved = (browser.storage.local.set as jest.Mock).mock.calls[0][0].citationTree;
      expect(saved.nodes.filter((n: TreeNode) => n.parentId === 1).map((n: TreeNode) => n.id)).toEqual([3, 2]);
    });

    it('moveNodeRelative does not save an invalid move', async () => {
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: build() });
      expect(await treeService.moveNodeRelative(1, 5, 'after')).toBe(false);
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('shiftNodeToParent places the node right after its former parent', async () => {
      const t = build();
      (browser.storage.local.get as jest.Mock).mockResolvedValue({ citationTree: t });
      expect(await treeService.shiftNodeToParent(5)).toBe(true);
      const saved = (browser.storage.local.set as jest.Mock).mock.calls[0][0].citationTree;
      expect(saved.nodes.filter((n: TreeNode) => n.parentId === 1).map((n: TreeNode) => n.id)).toEqual([2, 5, 3]);
    });
  });
});
