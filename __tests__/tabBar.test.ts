/**
 * @jest-environment jsdom
 */

require('../components/tabBar');
const TabBarClass = (global as any).window.CitationLinker.TabBar;

describe('TabBar', () => {
  let tabBar: any;
  let tabs: any[];
  let activeTabId: string;
  let tabService: any;
  let treeContainer: any;

  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  };
  const tabEl = (id: string) => document.querySelector(`.tab[data-tab-id="${id}"]`) as HTMLElement;
  const fire = (target: Element, type: string, props: Record<string, any> = {}) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.entries(props).forEach(([k, v]) => Object.defineProperty(ev, k, { value: v }));
    target.dispatchEvent(ev);
    return ev;
  };

  beforeEach(async () => {
    document.body.innerHTML = '<div id="tab-bar-container"></div>';
    tabs = [
      { id: 'general-tab', title: 'General', treeData: { nodes: [] } },
      { id: 't2', title: 'Second', treeData: { nodes: [{ id: 1 }] } },
      { id: 't3', title: 'Third', treeData: { nodes: [] } }
    ];
    activeTabId = 'general-tab';
    tabService = {
      getTabsForDisplay: jest.fn(async () => tabs.slice()),
      getActiveTabId: jest.fn(async () => activeTabId),
      getTab: jest.fn(async (id: string) => tabs.find(t => t.id === id) || null),
      setActiveTab: jest.fn(async (id: string) => { activeTabId = id; }),
      deleteTab: jest.fn(async (id: string) => { tabs = tabs.filter(t => t.id !== id); return true; }),
      renameTab: jest.fn(async (id: string, title: string) => { tabs.find(t => t.id === id).title = title; return true; }),
      createTab: jest.fn(),
      reorderTabs: jest.fn(async (ids: string[]) => {
        tabs = ids.map(id => tabs.find(t => t.id === id));
        return true;
      }),
      moveNodeToTab: jest.fn().mockResolvedValue(true)
    };
    treeContainer = { refresh: jest.fn().mockResolvedValue(undefined) };
    (window as any).CitationLinker.tabService = tabService;
    (window as any).CitationLinker.treeContainer = treeContainer;
    (window as any).currentDraggedNodeId = null;
    (window as any).currentDragState = null;

    tabBar = new TabBarClass();
    await tabBar.initialize();
  });

  it('renders tabs with close buttons except for the General tab', () => {
    expect(document.querySelectorAll('.tab')).toHaveLength(3);
    expect(tabEl('general-tab').querySelector('.tab-close')).toBeNull();
    expect(tabEl('t2').querySelector('.tab-close')?.getAttribute('aria-label')).toBe('Close tab Second');
    expect(tabEl('general-tab').getAttribute('aria-selected')).toBe('true');
  });

  it('switches tabs on click and refreshes the tree', async () => {
    tabEl('t2').querySelector('.tab-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(tabService.setActiveTab).toHaveBeenCalledWith('t2');
    expect(treeContainer.refresh).toHaveBeenCalled();
    expect(tabEl('t2').classList.contains('active')).toBe(true);
  });

  it('clicking the active tab does nothing (keeps the element for double-click)', async () => {
    const before = tabEl('general-tab');
    before.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(tabService.setActiveTab).not.toHaveBeenCalled();
    expect(tabEl('general-tab')).toBe(before);
  });

  it('close button closes the tab after confirmation without activating it', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    (tabEl('t2').querySelector('.tab-close') as HTMLElement).click();
    await flush();
    expect(confirmSpy).toHaveBeenCalled();
    expect(tabService.deleteTab).toHaveBeenCalledWith('t2');
    expect(tabService.setActiveTab).not.toHaveBeenCalled();
    expect(tabEl('t2')).toBeNull();
    confirmSpy.mockRestore();
  });

  it('a drag starting on the close button is cancelled', () => {
    const close = tabEl('t2').querySelector('.tab-close') as HTMLElement;
    fire(close, 'mousedown');
    const ev = fire(tabEl('t2'), 'dragstart', { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });
    expect(ev.defaultPrevented).toBe(true);
  });

  it('double-click renames inline and saves on Enter', async () => {
    tabEl('t3').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    const input = tabEl('t3').querySelector('.tab-rename-input') as HTMLInputElement;
    expect(input).not.toBeNull();

    // a storage-triggered refresh must not destroy the input
    await tabBar.refresh();
    expect(tabEl('t3').querySelector('.tab-rename-input')).toBe(input);

    input.value = 'Renamed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(tabService.renameTab).toHaveBeenCalledWith('t3', 'Renamed');
    expect(tabEl('t3').querySelector('.tab-label')!.textContent).toBe('Renamed');
    expect(tabEl('t3').querySelector('.tab-rename-input')).toBeNull();
  });

  it('Escape cancels a rename', async () => {
    tabEl('t3').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    const input = tabEl('t3').querySelector('.tab-rename-input') as HTMLInputElement;
    input.value = 'Nope';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(tabService.renameTab).not.toHaveBeenCalled();
    expect(tabEl('t3').querySelector('.tab-label')!.textContent).toBe('Third');
  });

  it('drag-reordering persists the new order', async () => {
    const dt = { setData: jest.fn(), effectAllowed: '', dropEffect: '' };
    fire(tabEl('t3'), 'mousedown');
    fire(tabEl('t3'), 'dragstart', { dataTransfer: dt });
    // simulate the live preview having moved t3 to the front
    const wrapper = document.querySelector('.tabs-wrapper')!;
    wrapper.insertBefore(tabEl('t3'), wrapper.firstChild);
    fire(tabEl('general-tab'), 'drop', { dataTransfer: dt });
    await flush();

    expect(tabService.reorderTabs).toHaveBeenCalledWith(['t3', 'general-tab', 't2']);
    expect(Array.from(document.querySelectorAll('.tab')).map(t => (t as HTMLElement).dataset.tabId))
      .toEqual(['t3', 'general-tab', 't2']);
  });

  it('dropping a tree node on another tab moves it there', async () => {
    (window as any).currentDraggedNodeId = 7;
    (window as any).currentDragState = { nodeId: 7, sourceTabId: 'general-tab' };
    const over = fire(tabEl('t2'), 'dragover', { dataTransfer: { dropEffect: '' } });
    expect(over.defaultPrevented).toBe(true);
    expect(tabEl('t2').classList.contains('drag-over')).toBe(true);

    fire(tabEl('t2'), 'drop', { dataTransfer: { getData: () => '7' } });
    await flush();
    expect(tabService.moveNodeToTab).toHaveBeenCalledWith(7, 'general-tab', 't2');
  });

  it('does not attach duplicate listeners across renders', async () => {
    await tabBar.render(true);
    await tabBar.render(true);
    tabEl('t2').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(tabService.setActiveTab).toHaveBeenCalledTimes(1);
  });
});
