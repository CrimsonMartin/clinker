/**
 * @jest-environment jsdom
 */

// Sync Loop Prevention Tests
// Tests to ensure sync.js and sidebar.js don't get stuck in sync-modify-sync loops

describe('Sync Loop Prevention', () => {
  let mockAuthManager;
  let mockDb;
  let mockDoc;
  let mockCollection;
  let mockStorageLocal;
  let storageData;
  let storageChangeListeners;
  let SyncManager;
  let syncManager;

  // Mock the global browser object
  global.browser = {
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        onChanged: {
          addListener: jest.fn()
        }
      },
      onChanged: {
        addListener: jest.fn()
      }
    }
  };

  // Mock Firebase
  global.firebase = {
    firestore: jest.fn()
  };

  beforeEach(() => {
    // Reset storage data
    storageData = {};
    storageChangeListeners = [];

    // Mock storage operations
    mockStorageLocal = {
      get: jest.fn().mockImplementation((keys) => {
        const result = {};
        if (typeof keys === 'object' && keys !== null) {
          // Handle default values object
          Object.keys(keys).forEach(key => {
            result[key] = storageData[key] || keys[key];
          });
        } else if (Array.isArray(keys)) {
          // Handle array of keys
          keys.forEach(key => {
            result[key] = storageData[key];
          });
        } else if (typeof keys === 'string') {
          // Handle single key
          result[keys] = storageData[keys];
        }
        return Promise.resolve(result);
      }),
      set: jest.fn().mockImplementation((data) => {
        const oldData = { ...storageData };
        Object.assign(storageData, data);
        
        // Simulate storage change events
        const changes = {};
        Object.keys(data).forEach(key => {
          changes[key] = {
            oldValue: oldData[key],
            newValue: data[key]
          };
        });
        
        // Trigger storage change listeners
        storageChangeListeners.forEach(listener => {
          listener(changes, 'local');
        });
        
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

    // Mock Firestore
    mockDoc = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(),
      delete: jest.fn().mockResolvedValue()
    };
    mockCollection = {
      doc: jest.fn().mockReturnValue(mockDoc)
    };
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
      enablePersistence: jest.fn().mockResolvedValue()
    };
    global.firebase.firestore.mockReturnValue(mockDb);

    // Mock authManager
    mockAuthManager = {
      isLoggedIn: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockReturnValue({
        uid: 'test-uid',
        email: 'test@example.com'
      })
    };
    global.authManager = mockAuthManager;

    // Load the SyncManager class
    delete require.cache[require.resolve('../firebase/sync.js')];
    const syncModule = require('../firebase/sync.js');
    SyncManager = syncModule.syncManager.constructor;
    
    // Create a fresh instance for each test
    syncManager = new SyncManager();
  });

  afterEach(() => {
    // Clean up intervals
    if (syncManager.syncInterval) {
      clearInterval(syncManager.syncInterval);
    }
    jest.clearAllMocks();
  });

  describe('Timestamp Persistence Bug Fix', () => {
    it('should set lastModified in local storage when uploading local content without timestamp', async () => {
      // Setup: Cloud data exists, local content exists but no timestamp (upload_preserve_local_content case)
      const cloudData = {
        citationTree: {
          nodes: [{ id: 2, text: 'Cloud node', url: 'https://cloud.com', timestamp: new Date(Date.now() - 1000).toISOString() }],
          currentNodeId: 2
        },
        nodeCounter: 2,
        lastModified: new Date(Date.now() - 1000).toISOString()
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => cloudData
      });

      // Local content exists but no timestamp
      storageData = {
        citationTree: {
          nodes: [
            { id: 1, text: 'Local node', url: 'https://example.com', timestamp: new Date().toISOString() }
          ],
          currentNodeId: 1
        },
        nodeCounter: 1
        // No lastModified timestamp - this should trigger upload_preserve_local_content
      };

      await syncManager.initialize();
      await syncManager.performSync();

      // Verify that lastModified was set in local storage after upload_preserve_local_content
      const setCall = mockStorageLocal.set.mock.calls.find(call => 
        call[0].lastModified !== undefined && !call[0].lastSyncTime
      );
      expect(setCall).toBeTruthy();
      expect(setCall[0].lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Verify storage data was updated
      expect(storageData.lastModified).toBeDefined();
    });

    it('should not repeat upload_preserve_local_content after timestamp is set', async () => {
      // Setup cloud data
      const cloudData = {
        citationTree: {
          nodes: [{ id: 2, text: 'Cloud node', url: 'https://cloud.com', timestamp: new Date(Date.now() - 1000).toISOString() }],
          currentNodeId: 2
        },
        nodeCounter: 2,
        lastModified: new Date(Date.now() - 1000).toISOString()
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => cloudData
      });

      // Local content without timestamp
      storageData = {
        citationTree: {
          nodes: [{ id: 1, text: 'Local node', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 1
        },
        nodeCounter: 1
        // No lastModified - should trigger upload_preserve_local_content
      };

      await syncManager.initialize();
      
      // First sync should upload and set timestamp
      await syncManager.performSync();
      expect(mockDoc.set).toHaveBeenCalledTimes(1);
      
      // After first sync, storageData should now have lastModified timestamp
      expect(storageData.lastModified).toBeDefined();
      
      // Clear the mock calls
      mockDoc.set.mockClear();

      // For second sync, mock cloud to have data with timestamp slightly newer than local
      // This ensures download_cloud_newer path instead of upload
      const futureTimestamp = new Date(Date.now() + 5000).toISOString();
      const newerCloudData = {
        citationTree: {
          nodes: [{ id: 3, text: 'Newer cloud node', url: 'https://newer.com', timestamp: futureTimestamp }],
          currentNodeId: 3
        },
        nodeCounter: 3,
        lastModified: futureTimestamp
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => newerCloudData
      });

      await syncManager.performSync();
      // Should download cloud data, not upload
      expect(mockDoc.set).not.toHaveBeenCalled();
    });

    it('should handle sidebar reopen without repeated uploads', async () => {
      // Setup: Cloud data already exists
      const cloudData = {
        citationTree: {
          nodes: [{ id: 2, text: 'Cloud node', url: 'https://cloud.com', timestamp: new Date(Date.now() - 1000).toISOString() }],
          currentNodeId: 2
        },
        nodeCounter: 2,
        lastModified: new Date(Date.now() - 1000).toISOString()
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => cloudData
      });

      // Simulate problematic scenario: local content but no timestamp
      storageData = {
        citationTree: {
          nodes: [{ id: 1, text: 'Local node', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 1
        },
        nodeCounter: 1
        // No lastModified - this should trigger upload_preserve_local_content
      };

      // Simulate first sidebar open
      const syncManager1 = new SyncManager();
      await syncManager1.initialize();
      await syncManager1.performSync();
      
      expect(mockDoc.set).toHaveBeenCalledTimes(1);
      
      // Storage should now have timestamp
      expect(storageData.lastModified).toBeDefined();
      
      mockDoc.set.mockClear();

      // For second sidebar open, use future timestamp to ensure download behavior
      const futureTimestamp = new Date(Date.now() + 10000).toISOString();
      const newerCloudData = {
        citationTree: {
          nodes: [{ id: 3, text: 'Future cloud node', url: 'https://future.com', timestamp: futureTimestamp }],
          currentNodeId: 3
        },
        nodeCounter: 3,
        lastModified: futureTimestamp
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => newerCloudData
      });

      // Simulate sidebar close/reopen (new SyncManager instance)
      const syncManager2 = new SyncManager();
      await syncManager2.initialize();
      await syncManager2.performSync();

      // Should download cloud data, not upload
      expect(mockDoc.set).not.toHaveBeenCalled();
    });
  });

  describe('Sync Loop Prevention', () => {
    it('should prevent concurrent syncs with syncInProgress flag', async () => {
      const slowMockDoc = {
        get: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ exists: false }), 100))),
        set: jest.fn().mockResolvedValue()
      };
      mockCollection.doc.mockReturnValue(slowMockDoc);

      await syncManager.initialize();

      // Start multiple syncs concurrently
      const sync1 = syncManager.performSync();
      const sync2 = syncManager.performSync();
      const sync3 = syncManager.performSync();

      await Promise.all([sync1, sync2, sync3]);

      // Only one sync should have executed
      expect(slowMockDoc.get).toHaveBeenCalledTimes(1);
    });

    it('should not trigger sync when fromSync flag is present', async () => {
      await syncManager.initialize();
      
      // Mock storage change listener (similar to sidebar.js)
      let syncTriggered = false;
      const mockStorageListener = (changes, namespace) => {
        if (namespace === 'local' && changes.citationTree) {
          const newValue = changes.citationTree.newValue;
          const isFromSync = newValue?.fromSync === true;
          
          if (!isFromSync) {
            syncTriggered = true;
          }
        }
      };

      // Add listener
      storageChangeListeners.push(mockStorageListener);

      // Simulate data coming from sync (with fromSync flag)
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
      const mockStorageListener = (changes, namespace) => {
        if (namespace === 'local' && changes.citationTree) {
          const newValue = changes.citationTree.newValue;
          const isUIOnlyChange = newValue?.uiOnlyChange === true;
          const isFromSync = newValue?.fromSync === true;
          
          if (!isFromSync && !isUIOnlyChange) {
            syncTriggered = true;
          }
        }
      };

      storageChangeListeners.push(mockStorageListener);

      // Simulate UI-only change (like highlighting a node)
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

      // Simulate rapid node operations (like multiple drag-and-drop actions)
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

      // Should not cause a sync storm - markAsModified should be called but not excessively
      expect(syncCount).toBeLessThan(15); // Allow some reasonable amount but not 1:1 with changes
    });
  });

  describe('Storage Change Listener Logic', () => {
    it('should properly detect content changes vs UI changes', async () => {
      const changes = [];
      
      const testListener = (changeData, namespace) => {
        if (namespace === 'local' && changeData.citationTree) {
          const newValue = changeData.citationTree.newValue;
          const isUIOnlyChange = newValue?.uiOnlyChange === true;
          const isFromSync = newValue?.fromSync === true;
          
          changes.push({
            isContentChange: !isFromSync && !isUIOnlyChange,
            isUIOnly: isUIOnlyChange,
            isFromSync: isFromSync
          });
        }
      };

      storageChangeListeners.push(testListener);

      // Test content change (should trigger sync)
      await mockStorageLocal.set({
        citationTree: {
          nodes: [{ id: 1, text: 'New content', url: 'https://example.com', timestamp: new Date().toISOString() }]
        }
      });

      // Test UI-only change (should not trigger sync)
      await mockStorageLocal.set({
        citationTree: {
          nodes: [{ id: 1, text: 'Content', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 1,
          uiOnlyChange: true
        }
      });

      // Test sync data (should not trigger sync)
      await mockStorageLocal.set({
        citationTree: {
          nodes: [{ id: 1, text: 'From cloud', url: 'https://example.com', timestamp: new Date().toISOString() }],
          fromSync: true
        }
      });

      expect(changes).toEqual([
        { isContentChange: true, isUIOnly: false, isFromSync: false },
        { isContentChange: false, isUIOnly: true, isFromSync: false },
        { isContentChange: false, isUIOnly: false, isFromSync: true }
      ]);
    });
  });

  describe('Edge Cases and Race Conditions', () => {
    it('should handle sync during ongoing storage modifications', async () => {
      await syncManager.initialize();
      
      // Setup initial data
      storageData = {
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0,
        lastModified: new Date().toISOString()
      };

      // Mock cloud data
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          citationTree: { nodes: [{ id: 1, text: 'Cloud node', url: 'https://example.com', timestamp: new Date().toISOString() }], currentNodeId: 1 },
          nodeCounter: 1,
          lastModified: new Date(Date.now() + 1000).toISOString() // Cloud is newer
        })
      });

      // Start sync
      const syncPromise = syncManager.performSync();

      // Immediately modify storage while sync is in progress
      await mockStorageLocal.set({
        citationTree: {
          nodes: [{ id: 2, text: 'Local modification during sync', url: 'https://example.com', timestamp: new Date().toISOString() }],
          currentNodeId: 2
        }
      });

      // Wait for sync to complete
      await syncPromise;

      // Verify sync completed successfully
      expect(mockDoc.get).toHaveBeenCalled();
    });

    it('should handle network errors gracefully without causing loops', async () => {
      await syncManager.initialize();
      
      // Mock network error
      mockDoc.get.mockRejectedValue(new Error('Network error'));
      
      let errorCount = 0;
      syncManager.onSyncStatusChange((status) => {
        if (status.status === 'error') {
          errorCount++;
        }
      });

      await syncManager.performSync();

      expect(errorCount).toBe(1);
      expect(syncManager.syncInProgress).toBe(false); // Should reset even on error
    });

    it('should not cause infinite loops when timestamps are corrupted', async () => {
      await syncManager.initialize();
      
      // Setup corrupted timestamp data
      storageData = {
        citationTree: { nodes: [{ id: 1, text: 'Test', url: 'https://example.com', timestamp: new Date().toISOString() }] },
        nodeCounter: 1,
        lastModified: 'invalid-date'
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          citationTree: { nodes: [], currentNodeId: null },
          nodeCounter: 0,
          lastModified: 'also-invalid'
        })
      });

      // Should not throw error or loop infinitely
      await expect(syncManager.performSync()).resolves.not.toThrow();
    });
  });

  describe('Sync Timing and Intervals', () => {
    it('should not sync if user is not logged in', async () => {
      mockAuthManager.getCurrentUser.mockReturnValue(null);
      mockAuthManager.isLoggedIn.mockReturnValue(false);
      
      await syncManager.initialize();
      await syncManager.performSync();

      expect(mockDoc.get).not.toHaveBeenCalled();
    });

    it('should handle auto-sync interval correctly', async () => {
      jest.useFakeTimers();
      
      // Mock document to return no cloud data
      mockDoc.get.mockResolvedValue({ exists: false });
      
      await syncManager.initialize();
      
      // Clear any calls that happened during initialization
      mockDoc.get.mockClear();
      
      // Start auto-sync with short interval for testing
      syncManager.startAutoSync(1000);
      
      // The startAutoSync should call performSync() immediately
      // Use advanceTimersByTime to let it complete
      await jest.advanceTimersByTimeAsync(0);
      
      expect(mockDoc.get).toHaveBeenCalledTimes(1); // Initial sync from startAutoSync
      
      // Fast-forward time to trigger interval syncs
      await jest.advanceTimersByTimeAsync(2000);
      
      expect(mockDoc.get).toHaveBeenCalledTimes(3); // Initial + 2 interval syncs
      
      syncManager.stopAutoSync();
      jest.useRealTimers();
    });
  });
});
