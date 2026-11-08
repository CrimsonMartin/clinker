// treeNode.ts - Tree node component for rendering individual nodes
//
// DOM structure produced by createElement():
//
//   <div class="tree-node [current]" data-node-id="1" role="treeitem">
//     <div class="tree-node-row" draggable="true" tabindex="0">   <- the card
//       <div class="tree-node-content">…</div>
//       <div class="tree-node-images">…</div>
//       <div class="tree-node-meta">…info…  …buttons…</div>
//     </div>
//     <div class="tree-children" role="group">…nested .tree-node…</div>  (added by TreeContainer)
//   </div>
//
// Click/keyboard handlers live on the row, so events from a nested child node
// never reach its ancestors' handlers. Drag and drop is handled by
// TreeContainer through event delegation (one set of listeners for the whole tree).

// Type definitions (copied from types/treeTypes.ts to avoid import issues)
interface TreeNodeType {
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
}

// Create an icon that references the lucide sprite embedded in sidebar.html.
// Falls back to an empty svg if the sprite is missing (e.g. in tests).
function clinkerIcon(name: string, className: string = 'icon'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

class TreeNode {
  private node: TreeNodeType;
  private isCurrentNode: boolean;
  private element: HTMLElement | null;
  private row: HTMLElement | null;

  constructor(node: TreeNodeType, isCurrentNode: boolean) {
    this.node = node;
    this.isCurrentNode = isCurrentNode;
    this.element = null;
    this.row = null;
  }

  // Create the tree node element
  createElement(): HTMLElement {
    this.element = document.createElement('div');
    this.element.className = this.isCurrentNode ? 'tree-node current' : 'tree-node';
    this.element.dataset.nodeId = this.node.id.toString();
    this.element.setAttribute('role', 'treeitem');
    this.element.setAttribute('aria-selected', this.isCurrentNode ? 'true' : 'false');

    this.row = document.createElement('div');
    this.row.className = 'tree-node-row';
    this.row.draggable = true;
    this.row.tabIndex = 0;
    this.row.title = this.node.text;

    this.row.appendChild(this.createContentElement());
    const images = this.localImages();
    if (images.length > 0) {
      this.row.appendChild(this.createImagesContainer(images));
    }
    this.row.appendChild(this.createMetaElement());
    this.element.appendChild(this.row);

    this.setupEventHandlers();

    return this.element;
  }

  // Create content element with the (truncated) highlighted text
  private createContentElement(): HTMLElement {
    const contentElement = document.createElement('div');
    contentElement.className = 'tree-node-content';
    contentElement.textContent = (window as any).formatters.truncateText(this.node.text, 300);
    return contentElement;
  }

  // Only inline data: images are rendered. Older versions could store remote image URLs, which
  // would make the sidebar request them from third-party servers.
  private localImages(): string[] {
    return (this.node.images || []).filter(
      (src) => typeof src === 'string' && /^data:image\//i.test(src)
    );
  }

  // Create images container
  private createImagesContainer(images: string[]): HTMLElement {
    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'tree-node-images';

    images.forEach((imageData, index) => {
      const imgElement = document.createElement('img');
      imgElement.src = imageData;
      imgElement.className = 'tree-node-image-thumbnail';
      imgElement.alt = `Image ${index + 1}`;
      // Images are draggable by default, which would hijack the row drag
      imgElement.draggable = false;
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

    const infoElement = document.createElement('div');
    infoElement.className = 'tree-node-info';

    // Compact citation line ("Smith et al. 2024 · Nature") when metadata exists, else the hostname
    const citationLabel = this.getCitationLabel();
    const urlElement = document.createElement('span');
    urlElement.className = citationLabel ? 'tree-node-url tree-node-citation' : 'tree-node-url';
    urlElement.textContent = citationLabel || this.getHostname();
    urlElement.title = citationLabel ? `${citationLabel}\n${this.node.url}` : this.node.url;

    const timeElement = document.createElement('span');
    timeElement.className = 'tree-node-time';
    timeElement.textContent = (window as any).formatters.formatTimestamp(this.node.timestamp);

    infoElement.appendChild(urlElement);
    infoElement.appendChild(timeElement);

    const buttonsElement = document.createElement('div');
    buttonsElement.className = 'tree-node-buttons';

    const createAnnotationButton = (window as any).createAnnotationButton;
    if (typeof createAnnotationButton === 'function') {
      buttonsElement.appendChild(createAnnotationButton(this.node));
    }
    buttonsElement.appendChild(this.createDeleteButton());

    metaElement.appendChild(infoElement);
    metaElement.appendChild(buttonsElement);

    return metaElement;
  }

  private getCitationLabel(): string {
    const svc = (window as any).CitationLinker?.citationService;
    const citation = (this.node as any).citation;
    if (!svc || !citation || typeof svc.shortLabel !== 'function') return '';
    try {
      return svc.shortLabel(citation);
    } catch {
      return '';
    }
  }

  private getHostname(): string {
    try {
      return new URL(this.node.url).hostname;
    } catch {
      return this.node.url || '';
    }
  }

  private getTreeService(): any {
    return (window as any).CitationLinker?.treeService || (window as any).treeService;
  }

  private getTreeContainer(): any {
    return (window as any).CitationLinker?.treeContainer || (window as any).treeContainer;
  }

  private markModified(): void {
    if ((window as any).syncInitialized && (window as any).authManager?.isLoggedIn()) {
      (window as any).syncManager.markAsModified();
    }
  }

  // Make this node the highlighted ("current") one without re-rendering
  async select(): Promise<void> {
    document.querySelectorAll('.tree-node.current').forEach(el => {
      el.classList.remove('current');
      el.setAttribute('aria-selected', 'false');
    });
    this.element?.classList.add('current');
    this.element?.setAttribute('aria-selected', 'true');
    try {
      await this.getTreeService().setCurrentNode(this.node.id);
    } catch (error) {
      console.error('Error updating current node:', error);
    }
  }

  // Open the node's page in the active browser tab
  async open(newTab: boolean = false): Promise<void> {
    try {
      await this.getTreeService().setCurrentNode(this.node.id);
      if (newTab) {
        await browser.tabs.create({ url: this.node.url });
        return;
      }
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].id) {
        await browser.tabs.update(tabs[0].id, { url: this.node.url });
      }
    } catch (error) {
      console.error('Error navigating to node:', error);
    }
  }

  // Setup event handlers (on the row only, so nested nodes don't trigger ancestors)
  private setupEventHandlers(): void {
    const row = this.row;
    if (!row) return;

    // Single click: highlight
    row.addEventListener('click', (e) => {
      if ((e.target as Element)?.closest?.('button, input, textarea, a')) return;
      this.select();
    });

    // Double click: navigate
    row.addEventListener('dblclick', (e) => {
      if ((e.target as Element)?.closest?.('button, input, textarea, a')) return;
      e.preventDefault();
      e.stopPropagation();
      this.open();
    });

    // Keyboard: Enter opens, Space selects, Delete removes, ContextMenu/Shift+F10 opens menu
    row.addEventListener('keydown', (e) => {
      if (e.target !== row) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.open(e.ctrlKey || e.metaKey);
      } else if (e.key === ' ') {
        e.preventDefault();
        this.select();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        this.deleteNode();
      } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        const r = row.getBoundingClientRect();
        this.showContextMenu({ clientX: r.left + 16, clientY: r.top + 16 } as MouseEvent);
      }
    });

    // Right-click context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e);
    });
  }

  // Show context menu
  private showContextMenu(event: MouseEvent): void {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.setAttribute('role', 'menu');

    const addItem = (label: string, action: () => Promise<void> | void, danger = false) => {
      const item = document.createElement('div');
      item.className = danger ? 'context-menu-item danger' : 'context-menu-item';
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
      item.textContent = label;
      item.addEventListener('click', async () => {
        contextMenu.remove();
        cleanup();
        await action();
      });
      contextMenu.appendChild(item);
    };

    // Only show "Shift out" if the node has a parent
    if (this.node.parentId !== null) {
      addItem('Shift out', async () => {
        await this.getTreeService().shiftNodeToParent(this.node.id);
        this.markModified();
      });
      addItem('Move to top level', async () => {
        await this.getTreeService().moveNodeToRoot(this.node.id);
        this.markModified();
      });
    }
    addItem('Open in new tab', () => this.open(true));
    if ((window as any).CitationLinker?.exportDialog) {
      addItem('Cite…', () => (window as any).CitationLinker.exportDialog.open({ scope: 'node', nodeId: this.node.id }));
    }
    if ((window as any).CitationLinker?.citationEditor) {
      addItem('Edit citation…', async () => {
        await (window as any).CitationLinker.citationEditor.open(this.node.id);
      });
    }
    addItem('Delete', () => this.deleteNode(), true);

    document.body.appendChild(contextMenu);

    // Keep the menu inside the viewport
    const x = Math.max(4, Math.min(event.clientX, window.innerWidth - contextMenu.offsetWidth - 4));
    const y = Math.max(4, Math.min(event.clientY, window.innerHeight - contextMenu.offsetHeight - 4));
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    const closeContextMenu = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'click' && contextMenu.contains(e.target as Node)) return;
      contextMenu.remove();
      cleanup();
    };
    const cleanup = () => {
      document.removeEventListener('click', closeContextMenu);
      document.removeEventListener('keydown', closeContextMenu);
    };

    setTimeout(() => {
      document.addEventListener('click', closeContextMenu);
      document.addEventListener('keydown', closeContextMenu);
    }, 0);
  }

  // Delete this node (and its subtree)
  private async deleteNode(button?: HTMLButtonElement): Promise<void> {
    const hasChildren = (this.node.children || []).length > 0;
    if (hasChildren && typeof window.confirm === 'function') {
      let ok = true;
      try {
        ok = window.confirm('Delete this citation and everything nested under it?');
      } catch {
        ok = true;
      }
      if (!ok) return;
    }

    if (button) {
      button.disabled = true;
      button.classList.add('busy');
    }

    try {
      const treeService = this.getTreeService();
      if (!treeService) throw new Error('TreeService not available');
      const success = await treeService.deleteNode(this.node.id);
      if (!success) throw new Error('Delete operation failed');

      const treeContainer = this.getTreeContainer();
      if (treeContainer) {
        await treeContainer.refresh();
      }
      this.markModified();
    } catch (error) {
      console.error('Error deleting node:', error);
      if (button) {
        button.disabled = false;
        button.classList.remove('busy');
      }
    }
  }

  // Create delete button using modern TreeService
  private createDeleteButton(): HTMLElement {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'icon-button node-delete-button';
    deleteButton.title = 'Delete this node';
    deleteButton.setAttribute('aria-label', 'Delete this citation');
    deleteButton.draggable = false;
    deleteButton.appendChild(clinkerIcon('trash-2'));

    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteNode(deleteButton);
    });
    deleteButton.addEventListener('dblclick', (e) => e.stopPropagation());

    return deleteButton;
  }

  // Show image modal
  private showImageModal(imageData: string): void {
    const modal = document.createElement('div');
    modal.className = 'image-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'image-modal-content';

    const close = () => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'icon-button modal-close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.title = 'Close';
    closeButton.appendChild(clinkerIcon('x'));
    closeButton.addEventListener('click', close);

    const image = document.createElement('img');
    image.src = imageData;
    image.className = 'modal-image';
    image.alt = '';

    modalContent.appendChild(closeButton);
    modalContent.appendChild(image);
    modal.appendChild(modalContent);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(modal);
  }
}

// Export TreeNode class for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).TreeNode = TreeNode;
  (window as any).clinkerIcon = clinkerIcon;
}
