// REST-based Cloud synchronization management for Citation Linker
// Uses Firestore REST API (Manifest V3 compliant)

class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.syncListeners = [];
    this.lastSyncTime = null;
    this.syncInterval = null;
    this.projectId = null;
    this.apiKey = null;
  }

  // Initialize sync and load configuration
  async initialize() {
    await this.loadFirebaseConfig();

    // Load last sync time from storage
    const stored = await this.getStorageData(['lastSyncTime']);
    this.lastSyncTime = stored.lastSyncTime || null;
  }

  // Load Firebase configuration
  async loadFirebaseConfig() {
    try {
      // Try to get config from global window object (set by build-config.js)
      if (typeof window !== 'undefined' && window.FIREBASE_CONFIG) {
        this.apiKey = window.FIREBASE_CONFIG.apiKey;
        this.projectId = window.FIREBASE_CONFIG.projectId;
      } else {
        // Fallback: try to get from environment or use defaults
        this.apiKey = process.env.FIREBASE_API_KEY || 'your_api_key_here';
        this.projectId = process.env.FIREBASE_PROJECT_ID || 'your_project_id';
      }
      console.log('Sync manager initialized for project:', this.projectId);
    } catch (error) {
      console.error('Error loading Firebase config for sync:', error);
      throw new Error('Firebase configuration not available for sync');
    }
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

  // Start automatic sync
  startAutoSync(intervalMs = 30000) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Initial sync
    this.performSync();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      if (authManager.isLoggedIn()) {
        this.performSync();
      }
    }, intervalMs);
  }

  // Stop automatic sync
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Perform sync operation
  async performSync() {
    if (this.syncInProgress) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    const user = authManager.getCurrentUser();
    if (!user) {
      console.log('No user logged in, skipping sync');
      return;
    }

    this.syncInProgress = true;
    this.notifySyncListeners({ status: 'syncing' });

    try {
      // Get local data (don't default lastModified to current time)
      const localData = await this.getStorageData({
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0,
        lastModified: undefined // Include lastModified in the request
      });

      // Get cloud data
      const cloudData = await this.getCloudData(user.uid);

      // Determine which data is newer
      let finalData;
      let action;
      
      // Analyze the current state
      const hasLocalNodes = localData.citationTree?.nodes?.length > 0;
      const hasCloudNodes = cloudData?.citationTree?.nodes?.length > 0;
      const hasLocalTimestamp = !!localData.lastModified;
      const hasCloudTimestamp = !!cloudData?.lastModified;
      
      console.log('=== SYNC DECISION ANALYSIS ===');
      console.log('Local:', { hasNodes: hasLocalNodes, hasTimestamp: hasLocalTimestamp, nodeCount: localData.citationTree?.nodes?.length || 0 });
      console.log('Cloud:', { hasNodes: hasCloudNodes, hasTimestamp: hasCloudTimestamp, nodeCount: cloudData?.citationTree?.nodes?.length || 0 });
      
      if (!cloudData || !hasCloudTimestamp) {
        // No cloud data exists - upload local data (even if empty)
        action = 'upload_no_cloud';
        finalData = localData;
        await this.uploadToCloud(user.uid, localData);
      } else if (!hasLocalNodes && hasCloudNodes) {
        // Fresh session: no local content, cloud has content - safe to download
        action = 'download_fresh_session';
        finalData = cloudData;
        await this.saveToLocal(cloudData);
      } else if (!hasLocalTimestamp && hasLocalNodes) {
        // Local content exists but no timestamp - prioritize local to prevent data loss
        action = 'upload_preserve_local_content';
        finalData = localData;
        
        // Use consistent timestamp for both local and cloud
        const now = new Date().toISOString();
        finalData.lastModified = now; // Set timestamp for upload
        
        await this.uploadToCloud(user.uid, finalData);
        
        // Set the same timestamp in local storage to prevent repeating this case
        await this.setStorageData({ lastModified: now });
        
        console.warn('Local content found without timestamp - uploading to preserve user data');
      } else if (!hasLocalTimestamp && !hasLocalNodes && hasCloudNodes) {
        // No local content or timestamp, cloud has content - download
        action = 'download_no_local_data';
        finalData = cloudData;
        await this.saveToLocal(cloudData);
      } else if (hasLocalTimestamp && hasCloudTimestamp) {
        // Both have timestamps - compare them
        const localTime = new Date(localData.lastModified).getTime();
        const cloudTime = new Date(cloudData.lastModified).getTime();
        const timeDiff = localTime - cloudTime;
        
        if (timeDiff > 0) {
          // Local is newer - upload
          action = 'upload_local_newer';
          finalData = localData;
          await this.uploadToCloud(user.uid, localData);
        } else if (timeDiff < 0) {
          // Cloud is newer - download
          action = 'download_cloud_newer';
          finalData = cloudData;
          await this.saveToLocal(cloudData);
        } else {
          // Timestamps equal - no sync needed
          action = 'no_sync_equal_timestamps';
          finalData = localData;
        }
      } else {
        // Fallback: upload local data to be safe
        action = 'upload_fallback';
        finalData = localData;
        await this.uploadToCloud(user.uid, localData);
      }
      
      console.log('Sync action taken:', action);
      console.log('=== END SYNC ANALYSIS ===');

      // Update last sync time
      this.lastSyncTime = new Date().toISOString();
      await this.setStorageData({ lastSyncTime: this.lastSyncTime });

      // Only update nodes if we need to mark them as synced
      // Don't update the storage if data came from cloud (already has fromSync flag)
      if (action && action.startsWith('upload')) {
        // Only update sync status for uploaded data
        if (finalData.citationTree && finalData.citationTree.nodes) {
          finalData.citationTree.nodes.forEach(node => {
            node.syncStatus = 'synced';
          });
          // No need to update storage again - data was already uploaded
        }
      }

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

  // Get data from Firestore using REST API
  async getCloudData(userId) {
    try {
      const authToken = await authManager.ensureValidToken();
      
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/users/${userId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 404) {
        // Document doesn't exist yet
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Firestore GET error: ${errorData.error?.message || response.statusText}`);
      }

      const firestoreDoc = await response.json();
      
      // Convert Firestore fields format back to JavaScript objects
      const cloudData = this.convertFromFirestoreFields(firestoreDoc.fields || {});
      
      console.log('Retrieved cloud data:', cloudData);
      return cloudData;

    } catch (error) {
      console.error('Error getting cloud data:', error);
      throw error;
    }
  }

  // Convert JavaScript objects to Firestore fields format
  convertToFirestoreFields(obj) {
    if (obj === null || obj === undefined) {
      return { nullValue: null };
    }
    
    if (typeof obj === 'string') {
      return { stringValue: obj };
    }
    
    if (typeof obj === 'number') {
      return Number.isInteger(obj) ? 
        { integerValue: obj.toString() } : 
        { doubleValue: obj };
    }
    
    if (typeof obj === 'boolean') {
      return { booleanValue: obj };
    }
    
    if (Array.isArray(obj)) {
      return {
        arrayValue: {
          values: obj.map(item => this.convertToFirestoreFields(item))
        }
      };
    }
    
    if (typeof obj === 'object') {
      const fields = {};
      for (const [key, value] of Object.entries(obj)) {
        fields[key] = this.convertToFirestoreFields(value);
      }
      return { mapValue: { fields } };
    }
    
    return { stringValue: String(obj) };
  }

  // Convert Firestore fields format back to JavaScript objects
  convertFromFirestoreFields(fields) {
    const result = {};
    
    for (const [key, value] of Object.entries(fields)) {
      result[key] = this.convertFirestoreValue(value);
    }
    
    return result;
  }

  // Convert individual Firestore value to JavaScript value
  convertFirestoreValue(value) {
    if (value.nullValue !== undefined) {
      return null;
    }
    
    if (value.stringValue !== undefined) {
      return value.stringValue;
    }
    
    if (value.integerValue !== undefined) {
      return parseInt(value.integerValue);
    }
    
    if (value.doubleValue !== undefined) {
      return value.doubleValue;
    }
    
    if (value.booleanValue !== undefined) {
      return value.booleanValue;
    }
    
    if (value.arrayValue !== undefined) {
      return value.arrayValue.values?.map(item => this.convertFirestoreValue(item)) || [];
    }
    
    if (value.mapValue !== undefined) {
      return this.convertFromFirestoreFields(value.mapValue.fields || {});
    }
    
    return null;
  }

  // Sanitize data to remove undefined values
  sanitizeData(obj) {
    if (obj === null || obj === undefined) {
      return null;
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

  // Upload data to Firestore using REST API
  async uploadToCloud(userId, localData) {
    try {
      const authToken = await authManager.ensureValidToken();
      const currentUser = authManager.getCurrentUser();
      const userEmail = currentUser ? currentUser.email : null;

      // Create data object with safe defaults
      const dataToUpload = {
        citationTree: localData.citationTree || { nodes: [], currentNodeId: null },
        nodeCounter: localData.nodeCounter || 0,
        lastModified: localData.lastModified || new Date().toISOString(),
        userEmail: userEmail
      };

      // Sanitize data to remove any undefined values
      const sanitizedData = this.sanitizeData(dataToUpload);

      // Convert to Firestore fields format
      const firestoreFields = {};
      for (const [key, value] of Object.entries(sanitizedData)) {
        firestoreFields[key] = this.convertToFirestoreFields(value);
      }

      console.log('Uploading data to cloud via REST API...');

      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/users/${userId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: firestoreFields
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Firestore PATCH error: ${errorData.error?.message || response.statusText}`);
      }

      console.log('Data uploaded to cloud successfully via REST API');

    } catch (error) {
      console.error('Error uploading to cloud:', error);
      throw error;
    }
  }

  // Save cloud data to local storage
  async saveToLocal(cloudData) {
    try {
      // Validate and repair tree structure before saving
      const validatedTree = this.validateAndRepairTreeStructure(cloudData.citationTree);
      
      // Add fromSync flag to prevent triggering another sync
      const dataToSave = {
        citationTree: { 
          ...validatedTree, 
          fromSync: true 
        },
        nodeCounter: cloudData.nodeCounter,
        lastModified: cloudData.lastModified
      };
      
      await this.setStorageData(dataToSave);
      console.log('Cloud data validated and saved to local storage');
    } catch (error) {
      console.error('Error saving to local storage:', error);
      throw error;
    }
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
      
      // Group orphaned nodes into chains and promote first node of each chain to root
      const processed = new Set();
      
      orphanedNodes.forEach(orphanedNode => {
        if (processed.has(orphanedNode.id)) return;
        
        // This orphaned node becomes a root
        orphanedNode.parentId = null;
        processed.add(orphanedNode.id);
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

  // Mark data as modified (will sync on next 30-second interval)
  async markAsModified() {
    const now = new Date().toISOString();
    
    // Only update the timestamp, don't modify citationTree to avoid triggering storage listener
    await this.setStorageData({ 
      lastModified: now
    });
    
    console.log('Data marked as modified at:', now);
    // Data will be synced on the next scheduled 30-second interval
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
    if (!authManager.isLoggedIn()) return 'offline';
    if (this.lastSyncTime) {
      const timeSinceSync = Date.now() - new Date(this.lastSyncTime).getTime();
      if (timeSinceSync < 60000) return 'synced'; // Less than 1 minute
    }
    return 'pending';
  }

  // Force immediate sync
  async forceSync() {
    if (!authManager.isLoggedIn()) {
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

  // Clear all cloud data for current user
  async clearCloudData() {
    const user = authManager.getCurrentUser();
    if (!user) {
      console.warn('No user logged in');
      return;
    }

    try {
      const authToken = await authManager.ensureValidToken();
      
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/users/${user.uid}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok && response.status !== 404) {
        const errorData = await response.json();
        throw new Error(`Firestore DELETE error: ${errorData.error?.message || response.statusText}`);
      }

      console.log('Cloud data cleared via REST API');
    } catch (error) {
      console.error('Error clearing cloud data:', error);
      throw error;
    }
  }
}

// Create singleton instance
const syncManager = new SyncManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { syncManager };
}
