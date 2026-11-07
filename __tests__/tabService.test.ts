/**
 * @jest-environment jsdom
 */

require('../services/tabService');
const TabServiceClass = (global as any).window.CitationLinker.TabService;

describe('TabService', () => {
  let service: any;
  let store: any;

  const tab = (id: string, nodes: any[] = []) => ({
    id, title: id, url: '', isActive: id === 'a', lastModified: 0,
    treeData: { nodes, currentNodeId: null }
  });

  beforeEach(() => {
    store = {};
    (global as any).browser = {
      storage: {
        local: {
          get: jest.fn(async (key: string) => (key in store ? { [key]: JSON.parse(JSON.stringify(store[key])) } : {})),
          set: jest.fn(async (obj: any) => { Object.assign(store, JSON.parse(JSON.stringify(obj))); })
        }
      }
    };
    service = new TabServiceClass();
  });

  describe('reorderTabs', () => {
    it('persists the new order', async () => {
      store.tabsData = { tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a' };
      expect(await service.reorderTabs(['c', 'a', 'b'])).toBe(true);
      expect(store.tabsData.tabs.map((t: any) => t.id)).toEqual(['c', 'a', 'b']);
    });

    it('keeps unknown/missing ids stable and skips no-op writes', async () => {
      store.tabsData = { tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a' };
      expect(await service.reorderTabs(['b', 'zzz'])).toBe(true);
      expect(store.tabsData.tabs.map((t: any) => t.id)).toEqual(['b', 'a', 'c']);

      (browser.storage.local.set as jest.Mock).mockClear();
      expect(await service.reorderTabs(['b', 'a', 'c'])).toBe(false);
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('moveNodeToTab', () => {
    const n = (id: number, parentId: number | null, children: number[] = []) =>
      ({ id, text: `N${id}`, url: 'https://e.com', timestamp: '', parentId, children });

    it('moves a node with its subtree and detaches it from the old parent', async () => {
      store.tabsData = {
        tabs: [tab('a', [n(1, null, [2]), n(2, 1, [3]), n(3, 2), n(4, null)]), tab('b', [n(10, null)])],
        activeTabId: 'a'
      };
      expect(await service.moveNodeToTab(2, 'a', 'b')).toBe(true);

      const [a, b] = store.tabsData.tabs;
      expect(a.treeData.nodes.map((x: any) => x.id)).toEqual([1, 4]);
      expect(a.treeData.nodes[0].children).toEqual([]);
      expect(b.treeData.nodes.map((x: any) => x.id)).toEqual([10, 2, 3]);
      expect(b.treeData.nodes.find((x: any) => x.id === 2).parentId).toBeNull();
      expect(b.treeData.nodes.find((x: any) => x.id === 3).parentId).toBe(2);
    });

    it('refuses same-tab moves, unknown nodes and id collisions', async () => {
      store.tabsData = { tabs: [tab('a', [n(1, null)]), tab('b', [n(1, null)])], activeTabId: 'a' };
      expect(await service.moveNodeToTab(1, 'a', 'a')).toBe(false);
      expect(await service.moveNodeToTab(99, 'a', 'b')).toBe(false);
      expect(await service.moveNodeToTab(1, 'a', 'b')).toBe(false);
      expect(store.tabsData.tabs[0].treeData.nodes).toHaveLength(1);
    });
  });
});
