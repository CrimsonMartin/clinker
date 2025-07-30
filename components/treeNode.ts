// treeNode.ts - Tree node component for rendering individual nodes
import { TreeNode as TreeNodeType } from '../types/treeTypes';

export class TreeNode {
  private node: TreeNodeType;
  private isCurrentNode: boolean;
  private element: HTMLElement | null;
  private draggedNodeId: number | null;

  constructor(node: TreeNodeType, isCurrentNode: boolean) {
    this.node = node;
    this.isCurrentNode = isCurrentNode;
    this.element = null;
    this.draggedNodeId = null;
  }

  // Create the tree node element
  createElement(): HTMLElement {
    this.element = document.createElement('div');
    this.element.className = `tree-node ${this.isCurrentNode ? 'current' : ''}`;
    this.element.dataset.nodeId = this.node.id.toString();
    
    // Make node draggable
    this.setupDragAndDrop();
    
    // Create content elements
    const contentElement = this.createContentElement();
    const metaElement = this.createMetaElement();
    
    this.element.appendChild(contentElement);
    this.element.appendChild(metaElement);
    
    // Setup event handlers
    this.setupEventHandlers();
    
    return this.element;
  }

  // Create content element with text and images
  private createContentElement(): HTMLElement {
    const contentElement = document.createElement('div');
    contentElement.className = 'tree-node-content';
    contentElement.textContent = (window as any).formatters.truncateText(this.node.text);
    
    // Add images if they exist
    if (this.node.images && this.node.images.length > 0) {
      const imagesContainer = this.createImagesContainer();
      contentElement.appendChild(imagesContainer);
    }
    
    return contentElement;
  }

  // Create images container
  private createImagesContainer(): HTMLElement {
    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'tree-node-images';
    
    this.node.images!.forEach((imageData, index) => {
      const imgElement = document.createElement('img');
      imgElement.src = imageData;
      imgElement.className = 'tree-node-image-thumbnail';
      imgElement.alt = `Image ${index + 1}`;
      imgElement.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showImageModal(imageData);
      });
      imagesContainer.appendChild(imgElement);
    });
    
    return imagesContainer;
  }

  // Create meta element with URL, timestamp, and buttons
  private createMetaElement(): HTMLElement {
    const metaElement = document.createElement('div');
    metaElement.className = 'tree-node-meta';
    
    // Create info container
    const infoElement = document.createElement('div');
    infoElement.className = 'tree-node-info';
    
    const urlElement = document.createElement('span');
    urlElement.className = 'tree-node-url';
    urlElement.textContent = new URL(this.node.url).hostname;
    urlElement.title = this.node.url;
    
    const timeElement = document.createElement('span');
    timeElement.textContent = (window as any).formatters.formatTimestamp(this.node.timestamp);
    
    infoElement.appendChild(urlElement);
    infoElement.appendChild(timeElement);
    
    // Create buttons container
    const buttonsElement = document.createElement('div');
    buttonsElement.className = 'tree-node-buttons';
    
    // Add annotation button
    const annotationButton = (window as any).createAnnotationButton(this.node);
    buttonsElement.appendChild(annotationButton);
    
    // Add delete button
    const deleteButton = (window as any).createDeleteButton(this.node);
    buttonsElement.appendChild(deleteButton);
    
    metaElement.appendChild(infoElement);
    metaElement.appendChild(buttonsElement);
    
    return metaElement;
  }

  // Setup drag and drop functionality
  private setupDragAndDrop(): void {
    if (!this.element) return;
    
    this.element.draggable = true;
    
    this.element.addEventListener('dragstart', (e) => {
      (window as any).currentDraggedNodeId = this.node.id;
      e.dataTransfer!.setData('text/plain', this.node.id.toString());
      e.dataTransfer!.effectAllowed = 'move';
      this.element!.classList.add('dragging');
    });
    
    this.element.addEventListener('dragend', () => {
      this.element!.classList.remove('dragging');
      (window as any).currentDraggedNodeId = null;
      
      // Clean up any remaining drag-over classes
      document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
      
      // Clean up background drag-over class
      const treeContainer = document.querySelector('.tree-container');
      if (treeContainer) {
        treeContainer.classList.remove('drag-over-background');
      }
    });
    
    // Make node a drop target
    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Only add drag-over class if we're dragging a different node
      if ((window as any).currentDraggedNodeId && (window as any).currentDraggedNodeId !== this.node.id) {
        this.element!.classList.add('drag-over');
      }
    });
    
    this.element.addEventListener('dragleave', (e) => {
      // Only remove drag-over if we're actually leaving the element
      if (!this.element!.contains(e.relatedTarget as Node)) {
        this.element!.classList.remove('drag-over');
      }
    });
    
    this.element.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.element!.classList.remove('drag-over');
      
      const draggedNodeId = parseInt(e.dataTransfer!.getData('text/plain')) || (window as any).currentDraggedNodeId;
      const targetNodeId = this.node.id;
      
      if (draggedNodeId && draggedNodeId !== targetNodeId) {
        console.log(`Moving node ${draggedNodeId} to become child of node ${targetNodeId}`);
        await (window as any).treeService.moveNode(draggedNodeId, targetNodeId);
        
        // Mark as modified for sync
        if ((window as any).syncInitialized && (window as any).authManager?.isLoggedIn()) {
          (window as any).syncManager.markAsModified();
        }
      }
    });
  }

  // Setup event handlers
  private setupEventHandlers(): void {
    if (!this.element) return;
    
    // Single-click handler to update highlighting
    this.element.addEventListener('click', async () => {
      try {
        await (window as any).treeService.setCurrentNode(this.node.id);
      } catch (error) {
        console.error('Error updating current node:', error);
      }
    });
    
    // Double-click handler for navigation
    this.element.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        console.log('Navigating to node:', this.node.id, 'URL:', this.node.url);
        
        // First update the current node
        await (window as any).treeService.setCurrentNode(this.node.id);
        
        // Then navigate to the URL
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0] && tabs[0].id) {
          await browser.tabs.update(tabs[0].id, { url: this.node.url });
        }
      } catch (error) {
        console.error('Error navigating to node:', error);
      }
    });
    
    // Right-click context menu
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e);
    });
  }

  // Show context menu
  private showContextMenu(event: MouseEvent): void {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = event.clientX + 'px';
    contextMenu.style.top = event.clientY + 'px';
    contextMenu.style.zIndex = '10000';
    
    // Only show "Shift out to parent" if the node has a parent
    if (this.node.parentId !== null) {
      const shiftUpOption = document.createElement('div');
      shiftUpOption.className = 'context-menu-item';
      shiftUpOption.textContent = 'Shift out';
      shiftUpOption.addEventListener('click', async () => {
        await (window as any).treeService.shiftNodeToParent(this.node.id);
        
        // Mark as modified for sync
        if ((window as any).syncInitialized && (window as any).authManager?.isLoggedIn()) {
          (window as any).syncManager.markAsModified();
        }
        
        contextMenu.remove();
      });
      contextMenu.appendChild(shiftUpOption);
    }
    
    document.body.appendChild(contextMenu);
    
    // Close context menu when clicking outside
    const closeContextMenu = (e: Event) => {
      if (!contextMenu.contains(e.target as Node)) {
        contextMenu.remove();
        document.removeEventListener('click', closeContextMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeContextMenu);
    }, 0);
  }

  // Show image modal
  private showImageModal(imageData: string): void {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'image-modal-content';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    const image = document.createElement('img');
    image.src = imageData;
    image.className = 'modal-image';
    
    modalContent.appendChild(closeButton);
    modalContent.appendChild(image);
    modal.appendChild(modalContent);
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
    
    document.body.appendChild(modal);
  }
}

// Export TreeNode class for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).TreeNode = TreeNode;
}
