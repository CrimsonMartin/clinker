/**
 * @jest-environment jsdom
 */

// Sync Loop Prevention Tests
// Tests to ensure api/sync.js and sidebar.js don't get stuck in sync-modify-sync loops,
// plus the version / conflict handling of the self-hosted sync API.

const API = 'https://api.test.example';
const SYNC_URL = `${API}/v1/sync`;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body)
  };
}

function syncDoc(data, version = 1) {
  return { data, version, updatedAt: new Date().toISOString() };
}

function cloudDataWithNode(id, text, lastModified) {
  return {
    citationTree: {
      nodes: [{ id, text, url: `https://example.com/${id}`, timestamp: lastModified, parentId: null }],
      currentNodeId: id
    },
    nodeCounter: id,
    lastModified
  };
}

function putCalls() {
  return global.fetch.mock.calls.filter(call => call[1].method === 'PUT');
}

function getCalls() {
  return global.fetch.mock.calls.filter(call => call[1].method === 'GET');
}

describe('Sync Loop Prevention', () => {
  let mockAuthManager;
  let mockStorageLocal;
  let storageData;
  let storageChangeListeners;
  let SyncManager;
  let syncManager;
  let originalFetch;

  global.browser = {
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        onChanged: { addListener: jest.fn() }
      },
      onChanged: { addListener: jest.fn() }
    }
  };

  beforeEach(() => {
    storageData = {};
    storageChangeListeners = [];
    originalFetch = global.fetch;

    window.CLINKER_CONFIG = { apiBaseUrl: API };

    mockStorageLocal = {
      get: jest.fn().mockImplementation((keys) => {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            result[key] = storageData[key];
          });
        } else if (typeof keys === 'object' && keys !== null) {
          Object.keys(keys).forEach(key => {
            result[key] = storageData[key] || keys[key];
          });
        } else if (typeof keys === 'string') {
          result[keys] = storageData[keys];
        }
        return Promise.resolve(result);
      }),
      set: jest.fn().mockImplementation((data) => {
        const oldData = { ...storageData };
        Object.assign(storageData, data);

        const changes = {};
        Object.keys(data).forEach(key => {
          changes[key] = { oldValue: oldData[key], newValue: data[key] };
        });
        storageChangeListeners.forEach(listener => listener(changes, 'local'));

        return Promise.resolve();
      }),
      onChanged: {
        addListener: jest.fn().mockImplementation((listener) => {
          storageChangeListeners.push(listener);
        })
      }
    };

    global.browser.storage.local = mockStorageLocal;
    global.browser.storage.onChanged.addListener = mockStorageLocal.onChanged.addListener;

    global.fetch = jest.fn();

    mockAuthManager = {
      isLoggedIn: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockReturnValue({ uid: 'test-uid', email: 'test@example.com' }),
      ensureValidToken: jest.fn().mockResolvedValue('mock-auth-token')
    };
    global.authManager = mockAuthManager;
    window.authManager = mockAuthManager;

    delete require.cache[require.resolve('../api/sync.js')];
    const syncModule = require('../api/sync.js');
    SyncManager = syncModule.SyncManager;
    syncManager = new SyncManager();
  });

  afterEach(() => {
    if (syncManager.syncInterval) {
      clearInterval(syncManager.syncInterval);
    }
    if (originalFetch) {
      global.fetch = originalFetch;
    }
    jest.clearAllMocks();
  });

  describe('API requests', () => {
    it('sends the bearer token to GET /v1/sync and uploads with PUT when no document exists', async () => {
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') return Promise.resolve(jsonResponse(404, { error: { code: 'not_found', message: 'none' } }));
        return Promise.resolve(jsonResponse(200, syncDoc(JSON.parse(options.body).data, 1)));
      });
      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Local', parentId: null }], currentNodeId: 1 },
        nodeCounter: 1,
        lastModified: new Date().toISOString()
      };

      await syncManager.initialize();
      await syncManager.performSync();

      expect(global.fetch).toHaveBeenCalledWith(SYNC_URL, expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer mock-auth-token' })
      }));
      const [, putOptions] = putCalls()[0];
      const body = JSON.parse(putOptions.body);
      expect(body.baseVersion).toBeNull();
      expect(body.data.citationTree.nodes).toHaveLength(1);
      expect(body.data.userEmail).toBe('test@example.com');
      expect(storageData.syncVersion).toBe(1);
      expect(storageData.lastSyncTime).toBeDefined();
    });

    it('uses the fetched version as baseVersion when local data is newer', async () => {
      const old = new Date(Date.now() - 60000).toISOString();
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') return Promise.resolve(jsonResponse(200, syncDoc(cloudDataWithNode(2, 'Cloud', old), 7)));
        return Promise.resolve(jsonResponse(200, syncDoc(JSON.parse(options.body).data, 8)));
      });
      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Local', parentId: null }], currentNodeId: 1 },
        nodeCounter: 1,
        lastModified: new Date().toISOString()
      };

      await syncManager.initialize();
      await syncManager.performSync();

      expect(JSON.parse(putCalls()[0][1].body).baseVersion).toBe(7);
      expect(storageData.syncVersion).toBe(8);
    });

    it('downloads newer cloud data and records its version', async () => {
      const future = new Date(Date.now() + 60000).toISOString();
      global.fetch.mockResolvedValue(jsonResponse(200, syncDoc(cloudDataWithNode(2, 'Cloud', future), 4)));
      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Local', parentId: null }], currentNodeId: 1 },
        nodeCounter: 1,
        lastModified: new Date().toISOString()
      };

      await syncManager.initialize();
      await syncManager.performSync();

      expect(putCalls()).toHaveLength(0);
      expect(storageData.citationTree.nodes[0].text).toBe('Cloud');
      expect(storageData.citationTree.fromSync).toBe(true);
      expect(storageData.lastModified).toBe(future);
      expect(storageData.syncVersion).toBe(4);
    });

    it('retries once on 401 with a refreshed token', async () => {
      mockAuthManager.ensureValidToken
        .mockResolvedValueOnce('stale-token')
        .mockResolvedValueOnce('fresh-token');
      global.fetch
        .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'unauthorized', message: 'expired' } }))
        .mockResolvedValueOnce(jsonResponse(200, syncDoc({ citationTree: { nodes: [] } , lastModified: null }, 1)))
        .mockResolvedValue(jsonResponse(200, syncDoc({}, 2)));

      await syncManager.initialize();
      await syncManager.performSync();

      expect(mockAuthManager.ensureValidToken).toHaveBeenNthCalledWith(2, true);
      expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
    });
  });

  describe('Version conflicts (409)', () => {
    it('reconciles with current.data and retries the upload once with the new version', async () => {
      const old = new Date(Date.now() - 60000).toISOString();
      const lessOld = new Date(Date.now() - 30000).toISOString();
      let putCount = 0;
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') return Promise.resolve(jsonResponse(200, syncDoc(cloudDataWithNode(2, 'Cloud', old), 3)));
        putCount++;
        if (putCount === 1) {
          return Promise.resolve(jsonResponse(409, {
            error: { code: 'version_conflict', message: 'conflict' },
            current: syncDoc(cloudDataWithNode(3, 'Other device', lessOld), 5)
          }));
        }
        return Promise.resolve(jsonResponse(200, syncDoc(JSON.parse(options.body).data, 6)));
      });
      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Local', parentId: null }], currentNodeId: 1 },
        nodeCounter: 1,
        lastModified: new Date().toISOString()
      };
      const statuses = [];
      syncManager.onSyncStatusChange(s => statuses.push(s.status));

      await syncManager.initialize();
      await syncManager.performSync();

      const puts = putCalls();
      expect(puts).toHaveLength(2);
      expect(JSON.parse(puts[0][1].body).baseVersion).toBe(3);
      expect(JSON.parse(puts[1][1].body).baseVersion).toBe(5);
      expect(storageData.syncVersion).toBe(6);
      expect(statuses).toEqual(['syncing', 'synced']);
    });

    it('downloads instead of retrying the upload when the conflicting data is newer', async () => {
      const old = new Date(Date.now() - 60000).toISOString();
      const future = new Date(Date.now() + 60000).toISOString();
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') return Promise.resolve(jsonResponse(200, syncDoc(cloudDataWithNode(2, 'Cloud', old), 3)));
        return Promise.resolve(jsonResponse(409, {
          error: { code: 'version_conflict', message: 'conflict' },
          current: syncDoc(cloudDataWithNode(9, 'Newer elsewhere', future), 4)
        }));
      });
      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Local', parentId: null }], currentNodeId: 1 },
        nodeCounter: 1,
        lastModified: new Date().toISOString()
      };

      await syncManager.initialize();
      await syncManager.performSync();

      expect(putCalls()).toHaveLength(1);
      expect(storageData.citationTree.nodes[0].text).toBe('Newer elsewhere');
      expect(storageData.syncVersion).toBe(4);
    });

    it('reports an error (no infinite retry) if the retry conflicts again', async () => {
      const old = new Date(Date.now() - 60000).toISOString();
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') return Promise.resolve(jsonResponse(200, syncDoc(cloudDataWithNode(2, 'Cloud', old), 3)));
        return Promise.resolve(jsonResponse(409, {
          error: { code: 'version_conflict', message: 'conflict' },
          current: syncDoc(cloudDataWithNode(2, 'Cloud', old), 99)
        }));
      });
      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Local', parentId: null }], currentNodeId: 1 },
        nodeCounter: 1,
        lastModified: new Date().toISOString()
      };
      const statuses = [];
      syncManager.onSyncStatusChange(s => statuses.push(s.status));

      await syncManager.initialize();
      await syncManager.performSync();

      expect(putCalls()).toHaveLength(2);
      expect(statuses).toEqual(['syncing', 'error']);
      expect(syncManager.syncInProgress).toBe(false);
    });
  });

  describe('Timestamp Persistence Bug Fix', () => {
    it('should set lastModified in local storage when uploading local content without timestamp', async () => {
      const cloudTime = new Date(Date.now() - 1000).toISOString();
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') return Promise.resolve(jsonResponse(200, syncDoc(cloudDataWithNode(2, 'Cloud node', cloudTime), 1)));
        return Promise.resolve(jsonResponse(200, syncDoc(JSON.parse(options.body).data, 2)));
      });

      storageData = {
        citationTree: {
          nodes: [{ id: 1, text: 'Local node', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 1
        },
        nodeCounter: 1
        // No lastModified timestamp - this should trigger upload_preserve_local_content
      };

      await syncManager.initialize();
      await syncManager.performSync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(SYNC_URL, expect.objectContaining({ method: 'GET' }));
      expect(global.fetch).toHaveBeenCalledWith(SYNC_URL, expect.objectContaining({ method: 'PUT' }));

      const setCall = mockStorageLocal.set.mock.calls.find(call =>
        call[0].lastModified !== undefined && !call[0].lastSyncTime
      );
      expect(setCall).toBeTruthy();
      expect(setCall[0].lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(storageData.lastModified).toBeDefined();
    });

    it('should not repeat upload_preserve_local_content after timestamp is set', async () => {
      let newerCloud = false;
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') {
          const doc = newerCloud
            ? syncDoc(cloudDataWithNode(3, 'Newer cloud node', new Date(Date.now() + 5000).toISOString()), 3)
            : syncDoc(cloudDataWithNode(2, 'Cloud node', new Date(Date.now() - 1000).toISOString()), 1);
          return Promise.resolve(jsonResponse(200, doc));
        }
        return Promise.resolve(jsonResponse(200, syncDoc(JSON.parse(options.body).data, 2)));
      });

      storageData = {
        citationTree: {
          nodes: [{ id: 1, text: 'Local node', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 1
        },
        nodeCounter: 1
      };

      await syncManager.initialize();
      await syncManager.performSync();

      expect(putCalls()).toHaveLength(1);
      expect(storageData.lastModified).toBeDefined();

      global.fetch.mockClear();
      newerCloud = true;

      await syncManager.performSync();

      expect(getCalls()).toHaveLength(1);
      expect(putCalls()).toHaveLength(0);
    });

    it('should handle sidebar reopen without repeated uploads', async () => {
      let newerCloud = false;
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') {
          const doc = newerCloud
            ? syncDoc(cloudDataWithNode(3, 'Future cloud node', new Date(Date.now() + 10000).toISOString()), 3)
            : syncDoc(cloudDataWithNode(2, 'Cloud node', new Date(Date.now() - 1000).toISOString()), 1);
          return Promise.resolve(jsonResponse(200, doc));
        }
        return Promise.resolve(jsonResponse(200, syncDoc(JSON.parse(options.body).data, 2)));
      });

      storageData = {
        citationTree: {
          nodes: [{ id: 1, text: 'Local node', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 1
        },
        nodeCounter: 1
      };

      // First sidebar open
      const syncManager1 = new SyncManager();
      await syncManager1.initialize();
      await syncManager1.performSync();

      expect(putCalls()).toHaveLength(1);
      expect(storageData.lastModified).toBeDefined();

      global.fetch.mockClear();
      newerCloud = true;

      // Sidebar close/reopen (new SyncManager instance)
      const syncManager2 = new SyncManager();
      await syncManager2.initialize();
      expect(syncManager2.remoteVersion).toBe(2);
      await syncManager2.performSync();

      expect(getCalls()).toHaveLength(1);
      expect(putCalls()).toHaveLength(0);
    });
  });

  describe('Sync Loop Prevention', () => {
    it('should prevent concurrent syncs with syncInProgress flag', async () => {
      let getCount = 0;
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') {
          getCount++;
          return new Promise(resolve =>
            setTimeout(() => resolve(jsonResponse(404, { error: { code: 'not_found', message: 'none' } })), 100)
          );
        }
        return Promise.resolve(jsonResponse(200, syncDoc({}, 1)));
      });

      await syncManager.initialize();

      const sync1 = syncManager.performSync();
      const sync2 = syncManager.performSync();
      const sync3 = syncManager.performSync();

      await Promise.all([sync1, sync2, sync3]);

      expect(getCount).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(SYNC_URL, expect.objectContaining({ method: 'GET' }));
    });

    it('should not trigger sync when fromSync flag is present', async () => {
      await syncManager.initialize();

      let syncTriggered = false;
      storageChangeListeners.push((changes, namespace) => {
        if (namespace === 'local' && changes.citationTree) {
          if (changes.citationTree.newValue?.fromSync !== true) {
            syncTriggered = true;
          }
        }
      });

      await mockStorageLocal.set({
        citationTree: {
          nodes: [{ id: 1, text: 'From sync', url: 'https://example.com', timestamp: new Date().toISOString() }],
          fromSync: true
        }
      });

      expect(syncTriggered).toBe(false);
    });

    it('should not trigger sync when uiOnlyChange flag is present', async () => {
      await syncManager.initialize();

      let syncTriggered = false;
      storageChangeListeners.push((changes, namespace) => {
        if (namespace === 'local' && changes.citationTree) {
          const newValue = changes.citationTree.newValue;
          if (newValue?.fromSync !== true && newValue?.uiOnlyChange !== true) {
            syncTriggered = true;
          }
        }
      });

      await mockStorageLocal.set({
        citationTree: {
          nodes: [{ id: 1, text: 'Test', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 1,
          uiOnlyChange: true
        }
      });

      expect(syncTriggered).toBe(false);
    });

    it('should handle rapid storage changes without sync storm', async () => {
      await syncManager.initialize();

      let syncCount = 0;
      const originalMarkAsModified = syncManager.markAsModified;
      syncManager.markAsModified = jest.fn().mockImplementation(() => {
        syncCount++;
        return originalMarkAsModified.call(syncManager);
      });

      for (let i = 0; i < 10; i++) {
        await mockStorageLocal.set({
          citationTree: {
            nodes: [
              { id: 1, text: 'Node 1', parentId: null, url: 'https://example.com', timestamp: new Date().toISOString() },
              { id: 2, text: 'Node 2', parentId: i % 2 === 0 ? 1 : null, url: 'https://example.com', timestamp: new Date().toISOString() }
            ],
            currentNodeId: 2
          }
        });
      }

      expect(syncCount).toBeLessThan(15);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Race Conditions', () => {
    it('should handle sync during ongoing storage modifications', async () => {
      await syncManager.initialize();

      storageData = {
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0,
        lastModified: new Date().toISOString()
      };

      global.fetch.mockResolvedValue(jsonResponse(200,
        syncDoc(cloudDataWithNode(1, 'Cloud node', new Date(Date.now() + 1000).toISOString()), 2)));

      const syncPromise = syncManager.performSync();

      await mockStorageLocal.set({
        citationTree: {
          nodes: [{ id: 2, text: 'Local modification during sync', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 2
        }
      });

      await syncPromise;

      expect(global.fetch).toHaveBeenCalledWith(SYNC_URL, expect.objectContaining({ method: 'GET' }));
    });

    it('should handle network errors gracefully without causing loops', async () => {
      await syncManager.initialize();
      global.fetch.mockRejectedValue(new Error('Network error'));

      let errorCount = 0;
      syncManager.onSyncStatusChange((status) => {
        if (status.status === 'error') errorCount++;
      });

      await syncManager.performSync();

      expect(errorCount).toBe(1);
      expect(syncManager.syncInProgress).toBe(false);
    });

    it('should report server errors', async () => {
      await syncManager.initialize();
      global.fetch.mockResolvedValue(jsonResponse(500, { error: { code: 'internal', message: 'Database down' } }));

      const errors = [];
      syncManager.onSyncStatusChange((status) => {
        if (status.status === 'error') errors.push(status.error);
      });

      await syncManager.performSync();

      expect(errors).toEqual(['Sync GET error: Database down']);
    });

    it('should not cause infinite loops when timestamps are corrupted', async () => {
      await syncManager.initialize();

      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Test', url: 'https://example.com', timestamp: new Date().toISOString() }] },
        nodeCounter: 1,
        lastModified: 'invalid-date'
      };

      global.fetch.mockResolvedValue(jsonResponse(200, syncDoc({
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0,
        lastModified: 'also-invalid'
      }, 1)));

      await expect(syncManager.performSync()).resolves.not.toThrow();
      expect(putCalls()).toHaveLength(0);
    });
  });

  describe('Sync Timing and Intervals', () => {
    it('should not sync if user is not logged in', async () => {
      mockAuthManager.getCurrentUser.mockReturnValue(null);
      mockAuthManager.isLoggedIn.mockReturnValue(false);

      await syncManager.initialize();
      await syncManager.performSync();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('forceSync returns an error when not logged in', async () => {
      mockAuthManager.isLoggedIn.mockReturnValue(false);
      await expect(syncManager.forceSync()).resolves.toEqual({ success: false, error: 'Not logged in' });
    });

    it('should handle auto-sync interval correctly', async () => {
      jest.useFakeTimers();

      let getCount = 0;
      global.fetch.mockImplementation((url, options) => {
        if (options.method === 'GET') {
          getCount++;
          return Promise.resolve(jsonResponse(404, { error: { code: 'not_found', message: 'none' } }));
        }
        return Promise.resolve(jsonResponse(200, syncDoc({}, getCount)));
      });

      await syncManager.initialize();

      syncManager.startAutoSync(1000);
      await jest.advanceTimersByTimeAsync(0);
      expect(getCount).toBe(1);

      await jest.advanceTimersByTimeAsync(2000);
      expect(getCount).toBe(3);

      syncManager.stopAutoSync();
      jest.useRealTimers();
    });

    it('startSync starts auto-sync only if it is not already running', () => {
      const spy = jest.spyOn(syncManager, 'startAutoSync').mockImplementation(() => {
        syncManager.syncInterval = 123;
      });
      syncManager.startSync(5000);
      syncManager.startSync(5000);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(5000);
      syncManager.syncInterval = null;
    });
  });
});
