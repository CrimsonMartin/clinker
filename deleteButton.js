// deleteButton.js - Delete button functionality for Research Linker

async function deleteNode(nodeId) {
  try {
    // Use the modern TreeService if available
    const treeService = window.CitationLinker?.treeService || window.treeService;
    if (treeService) {
      return await treeService.deleteNode(nodeId);
    } else {
      // Fallback to legacy implementation for tests
      return await legacyDeleteNode(nodeId);
    }
  } catch (error) {
    console.error('Error deleting node:', error);
    return false;
  }
}

// Legacy deleteNode implementation for backward compatibility with tests
async function legacyDeleteNode(nodeId) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    const now = new Date().toISOString();
    
    // Find all nodes to soft delete (the node and all its descendants)
    const nodesToDelete = new Set();
    
    function collectDescendants(id) {
      nodesToDelete.add(id);
      const node = tree.nodes.find(n => n.id === id);
      if (node && node.children) {
        node.children.forEach(childId => collectDescendants(childId));
      }
    }
    
    collectDescendants(nodeId);
    
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
    
    await browser.storage.local.set({ 
      citationTree: tree,
      lastModified: new Date().toISOString()
    });
    
    console.log(`Successfully deleted node ${nodeId} and ${nodesToDelete.size - 1} descendants`);
    return true;
  } catch (error) {
    console.error('Error deleting node:', error);
    return false;
  }
}

function createDeleteButton(node) {
  const deleteButton = document.createElement('button');
  deleteButton.className = 'node-delete-button';
  deleteButton.title = 'Delete this node';
  deleteButton.textContent = 'X';
  deleteButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    // Show loading state
    deleteButton.disabled = true;
    deleteButton.textContent = '...';
    
    try {
      await deleteNode(node.id);
      
      // Refresh the tree UI to hide deleted nodes
      const treeContainer = window.CitationLinker?.treeContainer || window.treeContainer;
      if (treeContainer) {
        await treeContainer.refresh();
      }
      
      // Mark as modified for sync if available
      if (window.syncInitialized && window.authManager?.isLoggedIn()) {
        window.syncManager.markAsModified();
      }
      
    } catch (error) {
      console.error('Error deleting node:', error);
      // Restore button state on error
      deleteButton.disabled = false;
      deleteButton.textContent = 'X';
    }
  });
  
  return deleteButton;
}
