// deleteButton.js - Delete button functionality for Research Linker

async function deleteNode(nodeId) {
  try {
    // Use the modern TreeService
    const treeService = window.CitationLinker?.treeService || window.treeService;
    if (treeService) {
      return await treeService.deleteNode(nodeId);
    } else {
      console.error('TreeService not available');
      return false;
    }
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
