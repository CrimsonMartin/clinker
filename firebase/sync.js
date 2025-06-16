// Cloud synchronization management for Citation Linker

class SyncManager {
  constructor() {
    this.db = null;
    this.syncInProgress = false;
    this.syncListeners = [];
    this.lastSyncTime = null;
    this.syncInterval = null;
  }

  // Initialize Firestore and sync
  async initialize() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      console.error('Firebase Firestore not loaded');
      return;
    }

    this.db = firebase.firestore();
    
    // Enable offline persistence
    try {
      await this.db.enablePersistence();
    } catch (error) {
      console.warn('Firestore persistence error:', error);
    }

    // Load last sync time from storage
    const stored = await browser.storage.local.get(['lastSyncTime']);
    this.lastSyncTime = stored.lastSyncTime || null;
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
      // Get local data
      const localData = await browser.storage.local.get({
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0,
        lastModified: new Date().toISOString()
      });

      // Get cloud data
      const cloudData = await this.getCloudData(user.uid);

      // Determine which data is newer
      let finalData;
      if (!cloudData || !cloudData.lastModified) {
        // No cloud data, upload local
        console.log('No cloud data found, uploading local data');
        finalData = localData;
        await this.uploadToCloud(user.uid, localData);
      } else if (!localData.lastModified) {
        // No local timestamp, download cloud
        console.log('No local timestamp, downloading cloud data');
        finalData = cloudData;
        await this.saveToLocal(cloudData);
      } else {
        // Compare timestamps
        const localTime = new Date(localData.lastModified).getTime();
        const cloudTime = new Date(cloudData.lastModified).getTime();

        if (localTime > cloudTime) {
          // Local is newer, upload
          console.log('Local data is newer, uploading');
          finalData = localData;
          await this.uploadToCloud(user.uid, localData);
        } else if (cloudTime > localTime) {
          // Cloud is newer, download
          console.log('Cloud data is newer, downloading');
          finalData = cloudData;
          await this.saveToLocal(cloudData);
        } else {
          // Same timestamp, no action needed
          console.log('Data is already in sync');
          finalData = localData;
        }
      }

      // Update last sync time
      this.lastSyncTime = new Date().toISOString();
      await browser.storage.local.set({ lastSyncTime: this.lastSyncTime });

      // Mark all nodes as synced
      if (finalData.citationTree && finalData.citationTree.nodes) {
        finalData.citationTree.nodes.forEach(node => {
          node.syncStatus = 'synced';
        });
        await browser.storage.local.set({ citationTree: finalData.citationTree });
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

  // Get data from Firestore
  async getCloudData(userId) {
    try {
      const doc = await this.db.collection('users').doc(userId).get();
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (error) {
      console.error('Error getting cloud data:', error);
      throw error;
    }
  }

  // Upload data to Firestore
  async uploadToCloud(userId, localData) {
    try {
      const dataToUpload = {
        citationTree: localData.citationTree,
        nodeCounter: localData.nodeCounter,
        lastModified: new Date().toISOString(),
        userEmail: authManager.getCurrentUser().email
      };

      await this.db.collection('users').doc(userId).set(dataToUpload);
      console.log('Data uploaded to cloud successfully');
    } catch (error) {
      console.error('Error uploading to cloud:', error);
      throw error;
    }
  }

  // Save cloud data to local storage
  async saveToLocal(cloudData) {
    try {
      await browser.storage.local.set({
        citationTree: cloudData.citationTree,
        nodeCounter: cloudData.nodeCounter,
        lastModified: cloudData.lastModified
      });
      console.log('Cloud data saved to local storage');
    } catch (error) {
      console.error('Error saving to local storage:', error);
      throw error;
    }
  }

  // Mark data as modified (triggers sync on next interval)
  async markAsModified() {
    const now = new Date().toISOString();
    await browser.storage.local.set({ lastModified: now });
    
    // If logged in, queue for immediate sync
    if (authManager.isLoggedIn() && !this.syncInProgress) {
      setTimeout(() => this.performSync(), 1000); // Small delay to batch changes
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
      await this.db.collection('users').doc(user.uid).delete();
      console.log('Cloud data cleared');
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
