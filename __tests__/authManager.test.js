/**
 * @jest-environment jsdom
 */

// Mock browser storage
const mockStorageLocal = {
  get: jest.fn(),
  set: jest.fn()
};

const mockBrowser = {
  storage: {
    local: mockStorageLocal
  }
};

// Set up global browser object
global.browser = mockBrowser;

// Load the AuthManager
require('../firebase/auth');

describe('AuthManager', () => {
  let authManager;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock console methods
    global.console = {
      ...global.console,
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Get the authManager instance - it's created as a singleton at the bottom of auth.js
    authManager = require('../firebase/auth').authManager || global.authManager;

    // Reset storage mocks
    mockStorageLocal.get.mockResolvedValue({});
    mockStorageLocal.set.mockResolvedValue();
  });

  describe('clearUserData', () => {
    it('should clear all user-specific data while preserving extension settings', async () => {
      // Mock current extension settings
      mockStorageLocal.get.mockResolvedValue({
        extensionActive: false // User had disabled extension
      });

      await authManager.clearUserData();

      // Verify storage.set was called with correct data
      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        citationTree: { nodes: [], currentNodeId: null },
        tabsData: null,
        nodeCounter: 0,
        lastModified: null,
        extensionActive: false // Should preserve the user's setting
      });

      expect(console.log).toHaveBeenCalledWith('Successfully cleared user data');
    });

    it('should default extensionActive to true if not set', async () => {
      // Mock no existing settings
      mockStorageLocal.get.mockResolvedValue({});

      await authManager.clearUserData();

      // Verify storage.set was called with default extensionActive
      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        citationTree: { nodes: [], currentNodeId: null },
        tabsData: null,
        nodeCounter: 0,
        lastModified: null,
        extensionActive: true // Should default to true
      });
    });

    it('should handle storage errors gracefully', async () => {
      // Mock storage error
      mockStorageLocal.get.mockRejectedValue(new Error('Storage error'));

      // Should not throw error
      await expect(authManager.clearUserData()).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalledWith('Error clearing user data:', expect.any(Error));
    });

    it('should handle storage set errors gracefully', async () => {
      // Mock get success but set failure
      mockStorageLocal.get.mockResolvedValue({ extensionActive: true });
      mockStorageLocal.set.mockRejectedValue(new Error('Set error'));

      // Should not throw error
      await expect(authManager.clearUserData()).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalledWith('Error clearing user data:', expect.any(Error));
    });
  });

  describe('signOut', () => {
    beforeEach(() => {
      // Mock a logged in user
      authManager.currentUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        authToken: 'test-token'
      };
    });

    it('should clear auth data and user data on signOut', async () => {
      mockStorageLocal.get.mockResolvedValue({ extensionActive: true });

      const result = await authManager.signOut();

      expect(result.success).toBe(true);
      
      // Verify clearStoredAuth was called (auth data cleared)
      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        isLoggedIn: false,
        userEmail: null,
        userId: null,
        authToken: null,
        tokenExpiry: null
      });

      // Verify clearUserData was called (user data cleared)
      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        citationTree: { nodes: [], currentNodeId: null },
        tabsData: null,
        nodeCounter: 0,
        lastModified: null,
        extensionActive: true
      });

      expect(console.log).toHaveBeenCalledWith('Successfully signed out');
      expect(console.log).toHaveBeenCalledWith('Successfully cleared user data');
      expect(authManager.currentUser).toBeNull();
    });

    it('should handle errors during signOut', async () => {
      // Mock storage error
      mockStorageLocal.set.mockRejectedValue(new Error('Storage error'));

      const result = await authManager.signOut();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
      expect(console.error).toHaveBeenCalledWith('Sign out error:', expect.any(Error));
    });

    it('should notify auth state listeners when signing out', async () => {
      const mockListener = jest.fn();
      authManager.onAuthStateChanged(mockListener);

      // Clear previous calls from onAuthStateChanged
      mockListener.mockClear();

      await authManager.signOut();

      // Should notify with null user
      expect(mockListener).toHaveBeenCalledWith(null);
    });
  });
});
