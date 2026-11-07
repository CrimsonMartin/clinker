// Cloud synchronization for Citation Linker.
// Stores one JSON document per user on the self-hosted Clinker API
// (GET/PUT /v1/sync, see docs/API.md). Uses the document `version` for
// optimistic concurrency: a PUT carries the version it was based on, and on a
// 409 conflict the local data is reconciled against the server's current
// document and the upload is retried once.

// Thrown by uploadToCloud when the server rejects a PUT with 409.
class SyncVersionConflictError extends Error {
  constructor(current) {
    super('Sync version conflict');
    this.name = 'SyncVersionConflictError';
    this.current = current || null; // SyncDoc currently stored on the server
  }
}

// Resolve the auth manager lazily so load order and test mocks both work.
function getSyncAuthManager() {
  if (typeof window !== 'undefined' && window.authManager) return window.authManager;
  if (typeof globalThis !== 'undefined' && globalThis.authManager) return globalThis.authManager;
  throw new Error('authManager not available');
}

async function readSyncJsonBody(response) {
  try {
    if (typeof response.text === 'function') {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
    return typeof response.json === 'function' ? await response.json() : null;
  } catch (e) {
    return null;
  }
}

class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.syncListeners = [];
    this.lastSyncTime = null;
    this.syncInterval = null;
    this.apiBaseUrl = 'https://clinker.lanerate.io';
    this.remoteVersion = null; // version of the server document we last saw
    this.loadConfig();
  }

  // Initialize sync and load configuration
  async initialize() {
    this.loadConfig();

    // Load last sync bookkeeping from storage
    const stored = await this.getStorageData(['lastSyncTime', 'syncVersion']);
    this.lastSyncTime = stored.lastSyncTime || null;
    this.remoteVersion = typeof stored.syncVersion === 'number' ? stored.syncVersion : null;

    if (typeof window !== 'undefined') {
      // Components (treeNode, deleteButton, ...) check this before markAsModified()
      window.syncInitialized = true;
    }
  }

  loadConfig() {
    let url = null;
    if (typeof window !== 'undefined' && window.CLINKER_CONFIG && window.CLINKER_CONFIG.apiBaseUrl) {
      url = window.CLINKER_CONFIG.apiBaseUrl;
    } else if (typeof process !== 'undefined' && process.env && process.env.API_BASE_URL) {
      url = process.env.API_BASE_URL;
    }
    this.apiBaseUrl = (url || 'https://clinker.lanerate.io').replace(/\/+$/, '');
  }

  // Browser storage abstraction
  async getStorageData(keys) {
    if (typeof browser !== 'undefined') {
      return await browser.storage.local.get(keys);
    } else if (typeof chrome !== 'undefined') {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
      });
    }
    throw new Error('Browser storage not available');
  }

  async setStorageData(data) {
    if (typeof browser !== 'undefined') {
      return await browser.storage.local.set(data);
    } else if (typeof chrome !== 'undefined') {
      return new Promise((resolve) => {
        chrome.storage.local.set(data, resolve);
      });
    }
    throw new Error('Browser storage not available');
  }

  // Authenticated request to the sync API. Refreshes the access token when it
  // is about to expire and retries once on 401.
  async apiFetch(method, path, body) {
    const auth = getSyncAuthManager();
    const url = `${this.apiBaseUrl}${path}`;
    const doFetch = (token) => {
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      if (body !== undefined) options.body = JSON.stringify(body);
      return fetch(url, options);
    };

    let token = await auth.ensureValidToken();
    let response = await doFetch(token);
    if (response.status === 401) {
      token = await auth.ensureValidToken(true);
      response = await doFetch(token);
    }
    return response;
  }

  // Start automatic sync
  startAutoSync(intervalMs = 30000) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Initial sync
    this.performSync();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      if (getSyncAuthManager().isLoggedIn()) {
        this.performSync();
      }
    }, intervalMs);
  }

  // Used by sidebarController: start auto-sync unless it is already running
  startSync(intervalMs) {
    if (this.syncInterval) return;
    return this.startAutoSync(intervalMs);
  }

  // Stop automatic sync
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Read local data in sync format (new tab format first, then legacy format)
  async getLocalSyncData() {
    const tabsData = await this.getStorageData(['tabsData']);

    if (tabsData.tabsData) {
      console.log('Using new tab format for sync');
      return this.convertTabsDataToSyncFormat(tabsData.tabsData);
    }

    console.log('Using old format for sync fallback');
    return await this.getStorageData({
      citationTree: { nodes: [], currentNodeId: null },
      nodeCounter: 0,
      lastModified: undefined
    });
  }

  // Perform sync operation
  async performSync() {
    if (this.syncInProgress) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    const user = getSyncAuthManager().getCurrentUser();
    if (!user) {
      console.log('No user logged in, skipping sync');
      return;
    }

    this.syncInProgress = true;
    this.notifySyncListeners({ status: 'syncing' });

    try {
      const localData = await this.getLocalSyncData();
      const cloudDoc = await this.getCloudDoc();

      let action;
      try {
        action = await this.reconcile(user, localData, cloudDoc);
      } catch (error) {
        if (!(error instanceof SyncVersionConflictError)) throw error;
        // Someone else wrote in between: decide again against the server's
        // current document and retry once.
        console.log('Sync version conflict, reconciling with current server data and retrying');
        action = await this.reconcile(user, localData, error.current);
      }

      console.log('Sync action taken:', action);

      // Update last sync time
      this.lastSyncTime = new Date().toISOString();
      await this.setStorageData({ lastSyncTime: this.lastSyncTime });

      this.notifySyncListeners({
        status: 'synced',
        lastSyncTime: this.lastSyncTime
      });

    } catch (error) {
      console.error('Sync error:', error);
      this.notifySyncListeners({
        status: 'error',
        error: error.message
      });
    } finally {
      this.syncInProgress = false;
    }
  }

  // Decide between upload/download given local data and the server document
  // (null if none) and carry it out. Returns the action name.
  async reconcile(user, originalLocalData, cloudDoc) {
    // Work on a copy so a retry after a version conflict starts from the same state
    const localData = JSON.parse(JSON.stringify(originalLocalData || {}));
    const cloudData = cloudDoc && cloudDoc.data ? cloudDoc.data : null;
    const baseVersion = cloudDoc && typeof cloudDoc.version === 'number' ? cloudDoc.version : null;

    let finalData;
    let action;

    // Analyze the current state
    const hasLocalNodes = localData.citationTree?.nodes?.length > 0;
    const hasCloudNodes = cloudData?.citationTree?.nodes?.length > 0;
    const hasLocalTimestamp = !!localData.lastModified;
    const hasCloudTimestamp = !!cloudData?.lastModified;

    console.log('=== SYNC DECISION ANALYSIS ===');
    console.log('Local:', { hasNodes: hasLocalNodes, hasTimestamp: hasLocalTimestamp, nodeCount: localData.citationTree?.nodes?.length || 0 });
    console.log('Cloud:', { hasNodes: hasCloudNodes, hasTimestamp: hasCloudTimestamp, nodeCount: cloudData?.citationTree?.nodes?.length || 0, version: baseVersion });

    if (!cloudData || !hasCloudTimestamp) {
      // No cloud data exists - upload local data (even if empty)
      action = 'upload_no_cloud';
      finalData = localData;
      await this.uploadToCloud(user.uid, localData, baseVersion);
    } else if (!hasLocalNodes && hasCloudNodes) {
      // Fresh session: no local content, cloud has content - safe to download
      action = 'download_fresh_session';
      finalData = cloudData;
      await this.saveToLocal(cloudData, baseVersion);
    } else if (!hasLocalTimestamp && hasLocalNodes) {
      // Local content exists but no timestamp - prioritize local to prevent data loss
      action = 'upload_preserve_local_content';
      finalData = localData;

      // Use consistent timestamp for both local and cloud
      const now = new Date().toISOString();
      finalData.lastModified = now;

      await this.uploadToCloud(user.uid, finalData, baseVersion);

      // Set the same timestamp in local storage to prevent repeating this case
      await this.setStorageData({ lastModified: now });

      console.warn('Local content found without timestamp - uploading to preserve user data');
    } else if (!hasLocalTimestamp && !hasLocalNodes && hasCloudNodes) {
      // No local content or timestamp, cloud has content - download
      action = 'download_no_local_data';
      finalData = cloudData;
      await this.saveToLocal(cloudData, baseVersion);
    } else if (hasLocalTimestamp && hasCloudTimestamp) {
      // Both have timestamps - compare them
      const localTime = new Date(localData.lastModified).getTime();
      const cloudTime = new Date(cloudData.lastModified).getTime();
      const timeDiff = localTime - cloudTime;

      if (timeDiff > 0) {
        // Local is newer - upload
        action = 'upload_local_newer';
        finalData = localData;
        await this.uploadToCloud(user.uid, localData, baseVersion);
      } else if (timeDiff < 0) {
        // Cloud is newer - download
        action = 'download_cloud_newer';
        finalData = cloudData;
        await this.saveToLocal(cloudData, baseVersion);
      } else {
        // Timestamps equal (or unparseable) - no sync needed
        action = 'no_sync_equal_timestamps';
        finalData = localData;
        await this.rememberRemoteVersion(baseVersion);
      }
    } else {
      // Fallback: upload local data to be safe
      action = 'upload_fallback';
      finalData = localData;
      await this.uploadToCloud(user.uid, localData, baseVersion);
    }

    console.log('=== END SYNC ANALYSIS ===');

    if (action.startsWith('upload') && finalData.citationTree && finalData.citationTree.nodes) {
      finalData.citationTree.nodes.forEach(node => {
        node.syncStatus = 'synced';
      });
    }

    return action;
  }

  async rememberRemoteVersion(version) {
    if (typeof version !== 'number' || version === this.remoteVersion) return;
    this.remoteVersion = version;
    await this.setStorageData({ syncVersion: version });
  }

  // GET /v1/sync. Returns the SyncDoc ({data, version, updatedAt}) or null if
  // the user has never uploaded.
  async getCloudDoc() {
    const response = await this.apiFetch('GET', '/v1/sync');

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await readSyncJsonBody(response);
      throw new Error(`Sync GET error: ${body?.error?.message || response.statusText || response.status}`);
    }

    const doc = await response.json();
    console.log('Retrieved cloud data, version', doc?.version);
    return doc;
  }

  // Backward-compatible: return just the cloud data object (or null)
  async getCloudData() {
    const doc = await this.getCloudDoc();
    return doc ? doc.data || null : null;
  }

  // Sanitize data to remove undefined values (from objects and arrays)
  sanitizeData(obj) {
    if (obj === null) {
      return null;
    }

    if (obj === undefined) {
      return undefined; // Signal that this should be removed
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeData(item)).filter(item => item !== undefined);
    }

    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedValue = this.sanitizeData(value);
        if (sanitizedValue !== undefined) {
          sanitized[key] = sanitizedValue;
        }
      }
      return sanitized;
    }

    return obj;
  }

  // PUT /v1/sync with optimistic concurrency. `baseVersion` is the server
  // version the upload is based on (null = no document yet / force overwrite).
  // Throws SyncVersionConflictError on 409.
  async uploadToCloud(userId, localData, baseVersion = this.remoteVersion) {
    const currentUser = getSyncAuthManager().getCurrentUser();
    const userEmail = currentUser ? currentUser.email : null;

    // Create data object with safe defaults
    const dataToUpload = {
      citationTree: localData.citationTree || { nodes: [], currentNodeId: null },
      nodeCounter: localData.nodeCounter || 0,
      lastModified: localData.lastModified || new Date().toISOString(),
      userEmail: userEmail
    };

    // Include tab metadata if available
    if (localData.tabsMetadata) {
      dataToUpload.tabsMetadata = localData.tabsMetadata;
    }

    const sanitizedData = this.sanitizeData(dataToUpload);

    console.log(`Uploading ${sanitizedData.citationTree?.nodes?.length || 0} nodes across ${sanitizedData.tabsMetadata?.tabCount || 1} tabs (base version ${baseVersion})`);

    const response = await this.apiFetch('PUT', '/v1/sync', {
      data: sanitizedData,
      baseVersion: typeof baseVersion === 'number' ? baseVersion : null
    });

    if (response.status === 409) {
      const body = await readSyncJsonBody(response);
      throw new SyncVersionConflictError(body && body.current ? body.current : null);
    }

    if (!response.ok) {
      const body = await readSyncJsonBody(response);
      throw new Error(`Sync PUT error: ${body?.error?.message || response.statusText || response.status}`);
    }

    const doc = await readSyncJsonBody(response);
    if (doc && typeof doc.version === 'number') {
      await this.rememberRemoteVersion(doc.version);
    }
    console.log('Data uploaded to cloud successfully, version', doc?.version);
    return doc;
  }

  // Save cloud data to local storage
  async saveToLocal(cloudData, version) {
    // Validate and repair tree structure before saving
    const validatedTree = this.validateAndRepairTreeStructure(cloudData.citationTree);

    // Check if we're using the new tab format locally
    const existingTabsData = await this.getStorageData(['tabsData']);

    if (existingTabsData.tabsData) {
      // Convert cloud data back to tab format
      console.log('Converting cloud data to tab format for local storage');
      const tabsData = this.convertSyncFormatToTabsData({
        ...cloudData,
        citationTree: validatedTree
      });

      // Add fromSync flag to prevent triggering another sync
      tabsData.fromSync = true;

      await this.setStorageData({
        tabsData: tabsData,
        lastModified: cloudData.lastModified
      });
      console.log('Cloud data converted to tab format and saved to local storage');
    } else {
      // Use old format for backward compatibility
      const dataToSave = {
        citationTree: {
          ...validatedTree,
          fromSync: true
        },
        nodeCounter: cloudData.nodeCounter,
        lastModified: cloudData.lastModified
      };

      await this.setStorageData(dataToSave);
      console.log('Cloud data saved to local storage in old format');
    }

    await this.rememberRemoteVersion(version);
  }

  // Validate and repair tree structure (simplified version for sync context)
  validateAndRepairTreeStructure(tree) {
    if (!tree || !tree.nodes || !Array.isArray(tree.nodes)) {
      console.warn('Invalid tree structure in cloud data, initializing empty tree');
      return {
        nodes: [],
        currentNodeId: null
      };
    }

    const nodeIds = new Set(tree.nodes.map(node => node.id));
    let repaired = false;

    // Find and repair orphaned nodes
    const orphanedNodes = tree.nodes.filter(node =>
      node.parentId !== null && !nodeIds.has(node.parentId)
    );

    if (orphanedNodes.length > 0) {
      console.log('Found orphaned nodes in cloud data, promoting to root:', orphanedNodes.map(n => n.id));
      orphanedNodes.forEach(orphanedNode => {
        orphanedNode.parentId = null;
        repaired = true;
        console.log(`Promoted orphaned node ${orphanedNode.id} to root in cloud data`);
      });
    }

    // Ensure all nodes have children arrays and validate them
    tree.nodes.forEach(node => {
      if (!node.children) {
        node.children = [];
      }

      // Find actual children based on parentId references
      const actualChildren = tree.nodes
        .filter(child => child.parentId === node.id)
        .map(child => child.id);

      // Update children array to match actual relationships
      if (JSON.stringify(node.children.sort()) !== JSON.stringify(actualChildren.sort())) {
        node.children = actualChildren;
        repaired = true;
      }
    });

    // Validate currentNodeId
    if (tree.currentNodeId !== null && !nodeIds.has(tree.currentNodeId)) {
      console.log(`Current node ${tree.currentNodeId} doesn't exist in cloud data, clearing`);
      tree.currentNodeId = null;
      repaired = true;
    }

    if (repaired) {
      console.log('Cloud data tree structure repaired during sync');
    }

    return tree;
  }

  // Convert tabs data to sync format (combines all tabs into one tree)
  convertTabsDataToSyncFormat(tabsData) {
    const allNodes = [];
    let maxNodeId = 0;
    let globalCurrentNodeId = null;
    let lastModified = null;

    // Combine nodes from all tabs
    tabsData.tabs.forEach(tab => {
      if (tab.treeData && tab.treeData.nodes) {
        tab.treeData.nodes.forEach(node => {
          // Ensure node has tabId for tracking
          if (!node.tabId) {
            node.tabId = tab.id;
          }
          allNodes.push(node);

          // Track highest node ID
          if (node.id > maxNodeId) {
            maxNodeId = node.id;
          }
        });

        // Use the active tab's current node as global current node
        if (tab.id === tabsData.activeTabId && tab.treeData.currentNodeId) {
          globalCurrentNodeId = tab.treeData.currentNodeId;
        }

        // Use the most recent lastModified timestamp
        if (tab.lastModified) {
          if (!lastModified || new Date(tab.lastModified) > new Date(lastModified)) {
            lastModified = tab.lastModified;
          }
        }
      }
    });

    console.log(`Converted ${tabsData.tabs.length} tabs to sync format: ${allNodes.length} total nodes`);

    return {
      citationTree: {
        nodes: allNodes,
        currentNodeId: globalCurrentNodeId
      },
      nodeCounter: maxNodeId,
      lastModified: lastModified || new Date().toISOString(),
      // Include tab metadata for cloud storage
      tabsMetadata: {
        activeTabId: tabsData.activeTabId,
        tabCount: tabsData.tabs.length,
        tabTitles: tabsData.tabs.map(tab => ({ id: tab.id, title: tab.title }))
      }
    };
  }

  // Convert sync format back to tabs data
  convertSyncFormatToTabsData(syncData) {
    const tabsMap = new Map();

    // Initialize with a General tab if no nodes exist
    if (!syncData.citationTree || !syncData.citationTree.nodes || syncData.citationTree.nodes.length === 0) {
      return {
        tabs: [{
          id: 'general-tab',
          title: 'General',
          url: '',
          isActive: true,
          treeData: { nodes: [], currentNodeId: null },
          lastModified: syncData.lastModified || new Date().toISOString()
        }],
        activeTabId: 'general-tab'
      };
    }

    // Group nodes by tabId
    syncData.citationTree.nodes.forEach(node => {
      const tabId = node.tabId || 'general-tab';

      if (!tabsMap.has(tabId)) {
        tabsMap.set(tabId, {
          id: tabId,
          title: tabId === 'general-tab' ? 'General' : `Tab ${tabId}`,
          url: '',
          isActive: false,
          treeData: { nodes: [], currentNodeId: null },
          lastModified: syncData.lastModified || new Date().toISOString()
        });
      }

      tabsMap.get(tabId).treeData.nodes.push(node);
    });

    // Convert map to array
    const tabs = Array.from(tabsMap.values());

    // Determine active tab
    let activeTabId = 'general-tab';
    if (syncData.tabsMetadata && syncData.tabsMetadata.activeTabId) {
      activeTabId = syncData.tabsMetadata.activeTabId;
    } else if (tabs.length > 0) {
      activeTabId = tabs[0].id;
    }

    // Set active tab and current node
    tabs.forEach(tab => {
      tab.isActive = tab.id === activeTabId;

      // Check if the current node belongs to this tab (regardless of which tab is active)
      if (syncData.citationTree.currentNodeId) {
        const hasCurrentNode = tab.treeData.nodes.some(node => node.id === syncData.citationTree.currentNodeId);
        if (hasCurrentNode) {
          tab.treeData.currentNodeId = syncData.citationTree.currentNodeId;
        }
      }
    });

    // Restore tab titles from metadata if available
    if (syncData.tabsMetadata && syncData.tabsMetadata.tabTitles) {
      syncData.tabsMetadata.tabTitles.forEach(tabInfo => {
        const tab = tabs.find(t => t.id === tabInfo.id);
        if (tab) {
          tab.title = tabInfo.title;
        }
      });
    }

    console.log(`Converted sync format to ${tabs.length} tabs`);

    return {
      tabs: tabs,
      activeTabId: activeTabId
    };
  }

  // Mark data as modified (will sync on next interval)
  async markAsModified() {
    const now = new Date().toISOString();

    // Check if we're using the new tab format
    const tabsData = await this.getStorageData(['tabsData']);
    if (tabsData.tabsData) {
      // Update the active tab's lastModified timestamp
      const activeTabId = tabsData.tabsData.activeTabId;
      const activeTab = tabsData.tabsData.tabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        activeTab.lastModified = now;
        await this.setStorageData({ tabsData: tabsData.tabsData });
        console.log(`Tab ${activeTabId} marked as modified at:`, now);
      }
    } else {
      // Fallback to old format
      await this.setStorageData({
        lastModified: now
      });
      console.log('Data marked as modified at:', now);
    }
  }

  // Add sync status listener
  onSyncStatusChange(callback) {
    this.syncListeners.push(callback);
  }

  // Notify sync listeners
  notifySyncListeners(status) {
    this.syncListeners.forEach(callback => callback(status));
  }

  // Get sync status
  getSyncStatus() {
    if (this.syncInProgress) return 'syncing';
    if (!getSyncAuthManager().isLoggedIn()) return 'offline';
    if (this.lastSyncTime) {
      const timeSinceSync = Date.now() - new Date(this.lastSyncTime).getTime();
      if (timeSinceSync < 60000) return 'synced'; // Less than 1 minute
    }
    return 'pending';
  }

  // Force immediate sync
  async forceSync() {
    if (!getSyncAuthManager().isLoggedIn()) {
      console.warn('Cannot sync: user not logged in');
      return { success: false, error: 'Not logged in' };
    }

    try {
      await this.performSync();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Clear all cloud data for current user (overwrites the sync document with
  // an empty one; deleting the account removes it entirely).
  async clearCloudData() {
    const user = getSyncAuthManager().getCurrentUser();
    if (!user) {
      console.warn('No user logged in');
      return;
    }

    const response = await this.apiFetch('PUT', '/v1/sync', { data: {}, baseVersion: null });
    if (!response.ok) {
      const body = await readSyncJsonBody(response);
      throw new Error(`Sync clear error: ${body?.error?.message || response.statusText || response.status}`);
    }
    const doc = await readSyncJsonBody(response);
    if (doc && typeof doc.version === 'number') {
      await this.rememberRemoteVersion(doc.version);
    }
    console.log('Cloud data cleared');
  }
}

// Create singleton instance
const syncManager = new SyncManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { syncManager, SyncManager, SyncVersionConflictError };
}

// Also export to global scope for browser usage
if (typeof window !== 'undefined') {
  window.syncManager = syncManager;
}
