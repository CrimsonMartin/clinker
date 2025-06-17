/**
 * @jest-environment jsdom
 */

describe('DeleteButton', () => {
  let deleteNode, createDeleteButton;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up console mocks
    global.console = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock browser storage
    global.browser = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({
            citationTree: { nodes: [], currentNodeId: null }
          }),
          set: jest.fn().mockResolvedValue()
        }
      }
    };

    // Clear document body
    document.body.innerHTML = '';

    // Load and evaluate the deleteButton script
    const fs = require('fs');
    const path = require('path');
    const deleteButtonScript = fs.readFileSync(path.join(__dirname, '../deleteButton.js'), 'utf8');
    
    // Execute the script in the global context
    const vm = require('vm');
    const context = {
      window: global.window || {},
      document: global.document,
      console: global.console,
      browser: global.browser
    };
    vm.createContext(context);
    vm.runInContext(deleteButtonScript, context);
    
    // Get functions from the context
    deleteNode = context.deleteNode;
    createDeleteButton = context.createDeleteButton;
  });

  describe('deleteNode', () => {
    it('should soft delete a node and all its descendants', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [2] },
          { id: 2, parentId: 1, children: [3] },
          { id: 3, parentId: 2, children: [] },
          { id: 4, parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteNode(2);

      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Check that node 2 and its descendant (node 3) are marked as deleted
      const node2 = savedTree.nodes.find(n => n.id === 2);
      const node3 = savedTree.nodes.find(n => n.id === 3);
      
      expect(node2.deleted).toBe(true);
      expect(node2.deletedAt).toBeDefined();
      expect(node3.deleted).toBe(true);
      expect(node3.deletedAt).toBeDefined();
      
      // Check that other nodes are not deleted
      const node1 = savedTree.nodes.find(n => n.id === 1);
      const node4 = savedTree.nodes.find(n => n.id === 4);
      
      expect(node1.deleted).toBeUndefined();
      expect(node4.deleted).toBeUndefined();
      
      // All nodes should still be in the array
      expect(savedTree.nodes).toHaveLength(4);
      expect(savedTree.currentNodeId).toBe(1);
    });

    it('should soft delete node and preserve all nodes in array', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [2, 3] },
          { id: 2, parentId: 1, children: [] },
          { id: 3, parentId: 1, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteNode(2);

      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Check that node 2 is marked as deleted
      const node2 = savedTree.nodes.find(n => n.id === 2);
      expect(node2.deleted).toBe(true);
      expect(node2.deletedAt).toBeDefined();
      
      // Check that other nodes are not deleted
      const node1 = savedTree.nodes.find(n => n.id === 1);
      const node3 = savedTree.nodes.find(n => n.id === 3);
      expect(node1.deleted).toBeUndefined();
      expect(node3.deleted).toBeUndefined();
      
      // All nodes should still be in the array
      expect(savedTree.nodes).toHaveLength(3);
      expect(savedTree.currentNodeId).toBe(1);
    });

    it('should clear current node if deleted node was current', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteNode(1);

      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Node should be marked as deleted but still in array
      const node1 = savedTree.nodes.find(n => n.id === 1);
      expect(node1.deleted).toBe(true);
      expect(node1.deletedAt).toBeDefined();
      
      // Current node should be cleared since it was deleted
      expect(savedTree.currentNodeId).toBe(null);
      
      // Node should still be in the array
      expect(savedTree.nodes).toHaveLength(1);
    });

    it('should clear current node if current node is a descendant of deleted node', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [2] },
          { id: 2, parentId: 1, children: [3] },
          { id: 3, parentId: 2, children: [] }
        ],
        currentNodeId: 3
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteNode(2); // Delete the child, which should also delete grandchild

      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Check that node 2 and its descendant (node 3) are marked as deleted
      const node2 = savedTree.nodes.find(n => n.id === 2);
      const node3 = savedTree.nodes.find(n => n.id === 3);
      
      expect(node2.deleted).toBe(true);
      expect(node2.deletedAt).toBeDefined();
      expect(node3.deleted).toBe(true);
      expect(node3.deletedAt).toBeDefined();
      
      // Check that node 1 is not deleted
      const node1 = savedTree.nodes.find(n => n.id === 1);
      expect(node1.deleted).toBeUndefined();
      
      // Current node should be cleared since it was deleted (descendant of deleted node)
      expect(savedTree.currentNodeId).toBe(null);
      
      // All nodes should still be in the array
      expect(savedTree.nodes).toHaveLength(3);
    });

    it('should handle deleting root node', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [2] },
          { id: 2, parentId: 1, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteNode(1);

      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Check that node 1 and its descendant (node 2) are marked as deleted
      const node1 = savedTree.nodes.find(n => n.id === 1);
      const node2 = savedTree.nodes.find(n => n.id === 2);
      
      expect(node1.deleted).toBe(true);
      expect(node1.deletedAt).toBeDefined();
      expect(node2.deleted).toBe(true);
      expect(node2.deletedAt).toBeDefined();
      
      // Current node should be cleared since it was deleted
      expect(savedTree.currentNodeId).toBe(null);
      
      // All nodes should still be in the array
      expect(savedTree.nodes).toHaveLength(2);
    });

    it('should handle complex tree structures', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [2, 4] }, // Root
          { id: 2, parentId: 1, children: [3] },       // Branch A
          { id: 3, parentId: 2, children: [] },        // Leaf A1
          { id: 4, parentId: 1, children: [5] },       // Branch B
          { id: 5, parentId: 4, children: [] }         // Leaf B1
        ],
        currentNodeId: 5
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteNode(2); // Delete Branch A and its children

      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Check that node 2 and its descendant (node 3) are marked as deleted
      const node2 = savedTree.nodes.find(n => n.id === 2);
      const node3 = savedTree.nodes.find(n => n.id === 3);
      
      expect(node2.deleted).toBe(true);
      expect(node2.deletedAt).toBeDefined();
      expect(node3.deleted).toBe(true);
      expect(node3.deletedAt).toBeDefined();
      
      // Check that other nodes are not deleted
      const node1 = savedTree.nodes.find(n => n.id === 1);
      const node4 = savedTree.nodes.find(n => n.id === 4);
      const node5 = savedTree.nodes.find(n => n.id === 5);
      
      expect(node1.deleted).toBeUndefined();
      expect(node4.deleted).toBeUndefined();
      expect(node5.deleted).toBeUndefined();
      
      // Current node should remain the same since it wasn't deleted
      expect(savedTree.currentNodeId).toBe(5);
      
      // All nodes should still be in the array
      expect(savedTree.nodes).toHaveLength(5);
    });

    it('should handle storage errors gracefully', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await deleteNode(1);

      expect(console.error).toHaveBeenCalledWith('Error deleting node:', expect.any(Error));
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle nodes with no children property', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null } // Node without children property
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteNode(1);

      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Node should be marked as deleted but still in array
      const node1 = savedTree.nodes.find(n => n.id === 1);
      expect(node1.deleted).toBe(true);
      expect(node1.deletedAt).toBeDefined();
      
      // Current node should be cleared since it was deleted
      expect(savedTree.currentNodeId).toBe(null);
      
      // Node should still be in the array
      expect(savedTree.nodes).toHaveLength(1);
    });
  });

  describe('createDeleteButton', () => {
    it('should create delete button element with correct properties', () => {
      const node = { id: 1, text: 'Test node' };
      const button = createDeleteButton(node);

      expect(button).toBeInstanceOf(HTMLElement);
      expect(button.tagName).toBe('BUTTON');
      expect(button.className).toBe('node-delete-button');
      expect(button.title).toBe('Delete this node');
      expect(button.textContent).toBe('X');
    });

    it('should call deleteNode when clicked', async () => {
      const node = { id: 1, text: 'Test node' };
      
      // Set up mock tree for the delete operation
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      const button = createDeleteButton(node);

      const clickEvent = new Event('click');
      Object.defineProperty(clickEvent, 'stopPropagation', {
        value: jest.fn(),
        writable: true
      });

      button.dispatchEvent(clickEvent);

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(clickEvent.stopPropagation).toHaveBeenCalled();
      // Verify deleteNode was called by checking storage operations
      expect(browser.storage.local.get).toHaveBeenCalledWith({ citationTree: { nodes: [], currentNodeId: null } });
      
      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Node should be marked as deleted but still in array
      const node1 = savedTree.nodes.find(n => n.id === 1);
      expect(node1.deleted).toBe(true);
      expect(node1.deletedAt).toBeDefined();
      
      // Current node should be cleared since it was deleted
      expect(savedTree.currentNodeId).toBe(null);
      
      // Node should still be in the array
      expect(savedTree.nodes).toHaveLength(1);
    });

    it('should work with different node types', () => {
      const nodeWithChildren = {
        id: 2,
        text: 'Parent node',
        children: [3, 4]
      };

      const button = createDeleteButton(nodeWithChildren);

      expect(button.className).toBe('node-delete-button');
      expect(button.textContent).toBe('X');
    });

    it('should stop event propagation on click', () => {
      const node = { id: 1, text: 'Test node' };
      const button = createDeleteButton(node);

      const clickEvent = new Event('click');
      const stopPropagationSpy = jest.fn();
      Object.defineProperty(clickEvent, 'stopPropagation', {
        value: stopPropagationSpy,
        writable: true
      });

      button.dispatchEvent(clickEvent);

      expect(stopPropagationSpy).toHaveBeenCalled();
    });

    it('should handle nodes with missing properties gracefully', () => {
      const incompleteNode = { id: 42 }; // Missing text and other properties

      const button = createDeleteButton(incompleteNode);

      expect(button).toBeInstanceOf(HTMLElement);
      expect(button.className).toBe('node-delete-button');
      expect(button.textContent).toBe('X');
    });

    it('should create unique buttons for different nodes', () => {
      const node1 = { id: 1, text: 'Node 1' };
      const node2 = { id: 2, text: 'Node 2' };

      const button1 = createDeleteButton(node1);
      const button2 = createDeleteButton(node2);

      expect(button1).not.toBe(button2);
      expect(button1.className).toBe(button2.className);
      expect(button1.textContent).toBe(button2.textContent);
    });
  });

  describe('Integration tests', () => {
    it('should delete node when button is clicked in DOM', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      const node = { id: 1, text: 'Test node' };
      const button = createDeleteButton(node);

      document.body.appendChild(button);

      const clickEvent = new Event('click');
      Object.defineProperty(clickEvent, 'stopPropagation', {
        value: jest.fn(),
        writable: true
      });

      button.dispatchEvent(clickEvent);

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(browser.storage.local.get).toHaveBeenCalled();
      
      const setCall = browser.storage.local.set.mock.calls[0][0];
      const savedTree = setCall.citationTree;
      
      // Node should be marked as deleted but still in array
      const node1 = savedTree.nodes.find(n => n.id === 1);
      expect(node1.deleted).toBe(true);
      expect(node1.deletedAt).toBeDefined();
      
      // Current node should be cleared since it was deleted
      expect(savedTree.currentNodeId).toBe(null);
      
      // Node should still be in the array
      expect(savedTree.nodes).toHaveLength(1);
    });

    it('should handle multiple delete operations', async () => {
      const mockTree = {
        nodes: [
          { id: 1, parentId: null, children: [] },
          { id: 2, parentId: null, children: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      const node1 = { id: 1, text: 'Node 1' };
      const node2 = { id: 2, text: 'Node 2' };

      const button1 = createDeleteButton(node1);
      const button2 = createDeleteButton(node2);

      document.body.appendChild(button1);
      document.body.appendChild(button2);

      // Click first button
      const clickEvent1 = new Event('click');
      Object.defineProperty(clickEvent1, 'stopPropagation', {
        value: jest.fn(),
        writable: true
      });
      button1.dispatchEvent(clickEvent1);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Click second button  
      const clickEvent2 = new Event('click');
      Object.defineProperty(clickEvent2, 'stopPropagation', {
        value: jest.fn(),
        writable: true
      });
      button2.dispatchEvent(clickEvent2);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(browser.storage.local.get).toHaveBeenCalledTimes(2);
      expect(browser.storage.local.set).toHaveBeenCalledTimes(2);
    });
  });
});
