// treeContainer.ts - Tree container component for managing tree rendering
//
// Drag and drop is implemented with event delegation on #tree-root: the
// listeners are attached once, survive every re-render, and resolve the node
// under the pointer with closest('.tree-node-row'). Supported drops:
//   - top/bottom edge of a row  -> insert before/after that node (reorder)
//   - middle of a row           -> make the dragged node a child of it
//   - empty space in the tree   -> move to the end of the top level
// Dropping onto the dragged node itself or into its own subtree is refused.

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

type TreeDropPosition = 'before' | 'after' | 'inside';

interface TreeDropTarget {
  nodeId: number | null;          // null = background / top level
  position: TreeDropPosition;
  element: HTMLElement | null;    // .tree-node wrapper that shows the indicator
}

const NODE_DRAG_MIME = 'application/x-clinker-node';
const DROP_CLASSES = ['drop-before', 'drop-after', 'drop-inside'];

class TreeContainer {
  private treeRoot: HTMLElement | null;
  private backgroundDropSetup: boolean;
  private tabListenerSetup: boolean;
  private dragState: { nodeId: number; sourceTabId: string | null } | null;
  private dropTarget: TreeDropTarget | null;
  private pointerDownTarget: Element | null;
  private lastRenderKey: string | null;
  private pendingRefresh: boolean;

  constructor() {
    this.treeRoot = null;
    this.backgroundDropSetup = false;
    this.tabListenerSetup = false;
    this.dragState = null;
    this.dropTarget = null;
    this.pointerDownTarget = null;
    this.lastRenderKey = null;
    this.pendingRefresh = false;
  }

  // Decide where a drop lands, given the pointer offset inside a row.
  static getDropPosition(offsetY: number, height: number): TreeDropPosition {
    if (height <= 0) return 'inside';
    const ratio = offsetY / height;
    if (ratio < 0.3) return 'before';
    if (ratio > 0.7) return 'after';
    return 'inside';
  }

  // Initialize the tree container (safe to call more than once)
  initialize(): void {
    this.treeRoot = document.getElementById('tree-root');
    if (!this.treeRoot) {
      console.error('Tree root element not found');
      return;
    }

    if (!this.backgroundDropSetup) {
      this.setupDragAndDrop(this.treeRoot);
      this.backgroundDropSetup = true;
    }

    if (!this.tabListenerSetup) {
      this.setupTabChangeListener();
      this.tabListenerSetup = true;
    }
  }

  private getTreeService(): any {
    return (window as any).CitationLinker?.treeService || (window as any).treeService;
  }

  // Load and display the tree
  async loadAndDisplayTree(force: boolean = false): Promise<void> {
    if (!this.treeRoot) {
      this.initialize();
    }

    if (!this.treeRoot) return;

    // Never swap the DOM out from under an active drag; render once it ends.
    if (this.dragState) {
      this.pendingRefresh = true;
      return;
    }

    try {
      const treeService = this.getTreeService();
      const treeValidationService = (window as any).CitationLinker?.treeValidationService || (window as any).treeValidationService;

      if (!treeService) {
        console.error('TreeService not available');
        this.showErrorState();
        return;
      }

      const tree = await treeService.getTree();

      let repairedTree = tree;
      if (treeValidationService) {
        repairedTree = await treeValidationService.repairTreeIntegrity(tree);
      }

      const nodes: TreeNodeType[] = repairedTree?.nodes || [];
      const visibleCount = nodes.filter(n => !n.deleted).length;

      if (visibleCount === 0) {
        this.lastRenderKey = null;
        this.showEmptyState();
        return;
      }

      // Skip the rebuild when only the highlighted node changed. Rebuilding the
      // DOM on every click would destroy the element between the two clicks of
      // a double-click and drop focus/scroll position.
      const renderKey = JSON.stringify(nodes);
      if (!force && renderKey === this.lastRenderKey && this.treeRoot.querySelector('.tree-node')) {
        this.updateCurrentNode(repairedTree.currentNodeId);
        return;
      }

      const scrollTop = this.treeRoot.scrollTop;
      const treeElements = this.renderTree(nodes, repairedTree.currentNodeId);
      treeElements.className = 'tree';
      treeElements.setAttribute('role', 'tree');
      this.treeRoot.innerHTML = '';
      this.treeRoot.appendChild(treeElements);
      this.treeRoot.scrollTop = scrollTop;
      this.lastRenderKey = renderKey;

      const searchBar = (window as any).CitationLinker?.searchBar || (window as any).searchBar;
      if (searchBar && typeof searchBar.rerunSearchIfActive === 'function') {
        searchBar.rerunSearchIfActive();
      }
    } catch (error) {
      console.error('Error loading tree:', error);
      this.lastRenderKey = null;
      this.showErrorState();
    }
  }

  // Update the highlighted node in place
  private updateCurrentNode(currentNodeId: number | null): void {
    if (!this.treeRoot) return;
    this.treeRoot.querySelectorAll('.tree-node.current').forEach(el => {
      if (currentNodeId === null || (el as HTMLElement).dataset.nodeId !== String(currentNodeId)) {
        el.classList.remove('current');
        el.setAttribute('aria-selected', 'false');
      }
    });
    if (currentNodeId !== null && currentNodeId !== undefined) {
      const el = this.treeRoot.querySelector(`.tree-node[data-node-id="${currentNodeId}"]`);
      if (el) {
        el.classList.add('current');
        el.setAttribute('aria-selected', 'true');
      }
    }
  }

  // Show empty state message
  private showEmptyState(): void {
    if (this.treeRoot) {
      this.treeRoot.innerHTML = '<div class="empty-state"><strong>No citations saved yet</strong><span>Highlight text on any web page, then use the Citation Linker button (or right-click → Save to Citation Linker) to start your research tree.</span></div>';
    }
  }

  // Show error state message
  private showErrorState(): void {
    if (this.treeRoot) {
      this.treeRoot.innerHTML = '<div class="empty-state">Error loading research tree.</div>';
    }
  }

  // Render tree recursively
  private renderTree(nodes: TreeNodeType[], currentNodeId: number | null, parentId: number | null = null): HTMLElement {
    const container = document.createElement('div');

    const childNodes = this.getTreeService().getChildNodes(nodes, parentId);

    childNodes.forEach((node: TreeNodeType) => {
      if (!node.children) {
        node.children = [];
      }

      const isCurrentNode = node.id === currentNodeId;

      const TreeNodeClass = (window as any).CitationLinker?.TreeNode || (window as any).TreeNode;
      if (!TreeNodeClass) {
        console.error('TreeNode component not available');
        return;
      }

      const treeNodeComponent = new TreeNodeClass(node, isCurrentNode);
      const nodeElement = treeNodeComponent.createElement();

      // Render children found by parentId (children[] may be stale; parentId is authoritative)
      const childrenElements = this.renderTree(nodes, currentNodeId, node.id);
      if (childrenElements.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        childrenContainer.setAttribute('role', 'group');
        while (childrenElements.firstChild) {
          childrenContainer.appendChild(childrenElements.firstChild);
        }
        nodeElement.appendChild(childrenContainer);
        nodeElement.classList.add('has-children');
      }

      container.appendChild(nodeElement);
    });

    return container;
  }

  // ---------------------------------------------------------------------------
  // Drag and drop (delegated)
  // ---------------------------------------------------------------------------

  private setupDragAndDrop(root: HTMLElement): void {
    // Remember where the pointer went down so a drag that starts on a button
    // (delete / annotate) can be cancelled: buttons should click, not drag.
    root.addEventListener('mousedown', (e) => {
      this.pointerDownTarget = e.target as Element;
    }, true);

    root.addEventListener('dragstart', (e) => this.handleDragStart(e as DragEvent));
    root.addEventListener('dragover', (e) => this.handleDragOver(e as DragEvent));
    root.addEventListener('dragleave', (e) => this.handleDragLeave(e as DragEvent));
    root.addEventListener('drop', (e) => this.handleDrop(e as DragEvent));
    root.addEventListener('dragend', () => this.endDrag());
    // If the dragged element is detached mid-drag, dragend never reaches root.
    document.addEventListener('dragend', () => { if (this.dragState) this.endDrag(); });
  }

  private static elementFrom(target: EventTarget | null): Element | null {
    if (!target) return null;
    if ((target as Node).nodeType === 1) return target as Element;
    return (target as Node).parentElement || null;
  }

  private handleDragStart(e: DragEvent): void {
    const target = TreeContainer.elementFrom(e.target);
    const row = target?.closest('.tree-node-row') as HTMLElement | null;
    if (!row || !this.treeRoot?.contains(row)) return;

    const downOn = this.pointerDownTarget;
    if (downOn && row.contains(downOn) && downOn.closest('button, input, textarea, a, .annotation-bubble')) {
      e.preventDefault();
      return;
    }

    const wrapper = row.parentElement as HTMLElement;
    const nodeId = parseInt(wrapper?.dataset.nodeId || '', 10);
    if (isNaN(nodeId)) return;

    // setData must be called synchronously inside dragstart (Firefox requires
    // data for the drag to start at all, and dataTransfer is read-only later).
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', String(nodeId));
      try {
        e.dataTransfer.setData(NODE_DRAG_MIME, String(nodeId));
      } catch {
        /* some environments only accept text/plain */
      }
      e.dataTransfer.effectAllowed = 'move';
    }

    this.dragState = { nodeId, sourceTabId: null };
    (window as any).currentDraggedNodeId = nodeId;
    (window as any).currentDragState = { nodeId, sourceTabId: null };
    wrapper.classList.add('dragging');
    this.treeRoot!.classList.add('is-dragging');
    // the context menu would otherwise linger above the drag
    document.querySelectorAll('.context-menu').forEach(m => m.remove());

    // Record the source tab (used when dropping onto another tab in the tab bar)
    const tabService = (window as any).CitationLinker?.tabService;
    if (tabService) {
      Promise.resolve(tabService.getActiveTabId()).then((tabId: string) => {
        if (this.dragState && this.dragState.nodeId === nodeId) {
          this.dragState.sourceTabId = tabId;
          (window as any).currentDragState = { nodeId, sourceTabId: tabId };
        }
      }).catch(() => { /* ignore */ });
    }
  }

  // Resolve the drop target for a pointer event; null = drop not allowed here
  private resolveDropTarget(e: DragEvent): TreeDropTarget | null {
    if (!this.dragState || !this.treeRoot) return null;
    const target = TreeContainer.elementFrom(e.target);
    if (!target) return null;

    const row = target.closest('.tree-node-row') as HTMLElement | null;
    if (row && this.treeRoot.contains(row)) {
      let wrapper = row.parentElement as HTMLElement;
      let targetId = parseInt(wrapper.dataset.nodeId || '', 10);
      if (isNaN(targetId)) return null;

      const draggedWrapper = this.treeRoot.querySelector(
        `.tree-node[data-node-id="${this.dragState.nodeId}"]`
      ) as HTMLElement | null;
      // Self or own descendant: not a valid target
      if (targetId === this.dragState.nodeId || (draggedWrapper && draggedWrapper.contains(wrapper))) {
        return null;
      }

      const rect = row.getBoundingClientRect();
      let position = TreeContainer.getDropPosition(e.clientY - rect.top, rect.height);

      // "After" a node whose children are shown sits visually between the node
      // and its first child: treat it as "before the first child".
      if (position === 'after') {
        const firstChild = wrapper.querySelector(':scope > .tree-children > .tree-node') as HTMLElement | null;
        if (firstChild) {
          const firstId = parseInt(firstChild.dataset.nodeId || '', 10);
          if (firstId === this.dragState.nodeId) {
            // dropping right above itself is a no-op
            return null;
          }
          wrapper = firstChild;
          targetId = firstId;
          position = 'before';
        }
      }
      return { nodeId: targetId, position, element: wrapper };
    }

    // Empty space (not inside any node, e.g. below the last node) = top level
    if (!target.closest('.tree-node')) {
      return { nodeId: null, position: 'inside', element: null };
    }
    return null;
  }

  private handleDragOver(e: DragEvent): void {
    if (!this.dragState) return; // not our drag (e.g. a tab or an external file)

    const dropTarget = this.resolveDropTarget(e);
    if (!dropTarget) {
      this.clearDropIndicators();
      this.dropTarget = null;
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }

    // preventDefault is what marks this element as a valid drop target
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    const same = this.dropTarget
      && this.dropTarget.nodeId === dropTarget.nodeId
      && this.dropTarget.position === dropTarget.position;
    this.dropTarget = dropTarget;
    if (same) return;

    this.clearDropIndicators();
    if (dropTarget.element) {
      dropTarget.element.classList.add(`drop-${dropTarget.position}`);
    } else {
      this.treeRoot!.classList.add('drag-over-background');
    }
  }

  private handleDragLeave(e: DragEvent): void {
    if (!this.dragState || !this.treeRoot) return;
    const related = e.relatedTarget as Node | null;
    if (!related || !this.treeRoot.contains(related)) {
      this.clearDropIndicators();
      this.dropTarget = null;
    }
  }

  private async handleDrop(e: DragEvent): Promise<void> {
    if (!this.dragState) return;
    e.preventDefault();
    e.stopPropagation();

    const dropTarget = this.resolveDropTarget(e) || this.dropTarget;
    let draggedNodeId = this.dragState.nodeId;
    const fromData = parseInt(e.dataTransfer?.getData(NODE_DRAG_MIME) || e.dataTransfer?.getData('text/plain') || '', 10);
    if (!isNaN(fromData)) draggedNodeId = fromData;

    this.endDrag(false);
    if (!dropTarget) return;

    const treeService = this.getTreeService();
    let moved = false;
    if (dropTarget.nodeId === null) {
      moved = await treeService.moveNodeToRoot(draggedNodeId);
    } else if (dropTarget.position === 'inside') {
      moved = await treeService.moveNode(draggedNodeId, dropTarget.nodeId);
    } else {
      moved = await treeService.moveNodeRelative(draggedNodeId, dropTarget.nodeId, dropTarget.position);
    }

    if (moved) {
      if ((window as any).syncInitialized && (window as any).authManager?.isLoggedIn()) {
        (window as any).syncManager.markAsModified();
      }
    }
    await this.refresh();
  }

  private clearDropIndicators(): void {
    if (!this.treeRoot) return;
    this.treeRoot.classList.remove('drag-over-background');
    this.treeRoot.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach(el => {
      el.classList.remove(...DROP_CLASSES);
    });
  }

  // Clear all drag state. Runs on dragend and drop.
  private endDrag(runPendingRefresh: boolean = true): void {
    this.clearDropIndicators();
    if (this.treeRoot) {
      this.treeRoot.classList.remove('is-dragging');
      this.treeRoot.querySelectorAll('.tree-node.dragging').forEach(el => el.classList.remove('dragging'));
    }
    document.querySelectorAll('.tab.drag-over').forEach(el => el.classList.remove('drag-over'));
    this.dragState = null;
    this.dropTarget = null;
    this.pointerDownTarget = null;
    (window as any).currentDraggedNodeId = null;
    (window as any).currentDragState = null;

    if (runPendingRefresh && this.pendingRefresh) {
      this.pendingRefresh = false;
      this.refresh();
    }
    this.pendingRefresh = false;
  }

  // Setup tab change listener
  private setupTabChangeListener(): void {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes: any, areaName: string) => {
        if (areaName === 'local' && (changes.tabsData || changes.citationTree)) {
          this.refresh();
        }
      });
    }
  }

  // Refresh the tree display
  async refresh(force: boolean = false): Promise<void> {
    await this.loadAndDisplayTree(force);
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).CitationLinker = (window as any).CitationLinker || {};
  (window as any).CitationLinker.TreeContainer = TreeContainer;

  const treeContainerInstance = new TreeContainer();

  (window as any).CitationLinker.treeContainer = treeContainerInstance;
  (window as any).treeContainer = treeContainerInstance; // Legacy support
}
