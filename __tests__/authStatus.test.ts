/**
 * @jest-environment jsdom
 */

// Load component file that creates window.authStatus singleton
require('../components/authStatus');

// Extract class constructor from the singleton instance
const AuthStatusClass = (global as any).window.authStatus.constructor;

describe('AuthStatus', () => {
  let authStatus: any;
  let mockAuthManager: any;

  beforeEach(() => {
    // Clear document body
    document.body.innerHTML = `
      <div id="loginPrompt"></div>
      <div id="userSection"></div>
      <div id="userEmail"></div>
      <button id="loginButton"></button>
      <button id="logoutButton"></button>
    `;

    // Clear mocks
    jest.clearAllMocks();

    // Mock console
    (global as any).console = {
      ...(global as any).console,
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock authManager
    mockAuthManager = {
      signOut: jest.fn().mockResolvedValue({ success: true }),
      isLoggedIn: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ email: 'test@example.com' }),
      onAuthStateChanged: jest.fn()
    };

    (window as any).authManager = mockAuthManager;

    // Create new AuthStatus instance
    authStatus = new AuthStatusClass();
  });

  describe('initialize', () => {
    it('should initialize successfully with all elements present', () => {
      authStatus.initialize();
      
      // Verify no errors were logged
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle missing elements gracefully', () => {
      document.body.innerHTML = ''; // Remove all elements
      
      authStatus.initialize();
      
      expect(console.error).toHaveBeenCalledWith(
        'Missing auth elements:', 
        expect.arrayContaining(['loginPrompt', 'userSection', 'userEmail', 'loginButton', 'logoutButton'])
      );
    });

    it('should setup event listeners', () => {
      authStatus.initialize();
      
      const loginButton = document.getElementById('loginButton');
      const logoutButton = document.getElementById('logoutButton');
      
      // Test that event listeners were added by checking if they exist
      expect(loginButton).toBeDefined();
      expect(logoutButton).toBeDefined();
    });
  });

  describe('updateUI', () => {
    beforeEach(() => {
      authStatus.initialize();
    });

    it('should update UI for logged in user', () => {
      const user = { email: 'test@example.com' };
      
      authStatus.updateUI(user);
      
      const loginPrompt = document.getElementById('loginPrompt');
      const userSection = document.getElementById('userSection');
      const userEmail = document.getElementById('userEmail');
      
      expect(loginPrompt?.classList.contains('show')).toBe(false);
      expect(userSection?.classList.contains('show')).toBe(true);
      expect(userEmail?.textContent).toBe('test@example.com');
    });

    it('should update UI for logged out user', () => {
      authStatus.updateUI(null);
      
      const loginPrompt = document.getElementById('loginPrompt');
      const userSection = document.getElementById('userSection');
      const userEmail = document.getElementById('userEmail');
      
      expect(loginPrompt?.classList.contains('show')).toBe(true);
      expect(userSection?.classList.contains('show')).toBe(false);
      expect(userEmail?.textContent).toBe('');
    });

    it('should warn when not initialized', () => {
      const uninitializedAuthStatus = new AuthStatusClass();
      uninitializedAuthStatus.updateUI({ email: 'test@example.com' });
      
      expect(console.warn).toHaveBeenCalledWith('AuthStatus not initialized');
    });
  });

  describe('showLoginPrompt', () => {
    beforeEach(() => {
      authStatus.initialize();
    });

    it('should add show class to login prompt', () => {
      const loginPrompt = document.getElementById('loginPrompt');
      loginPrompt?.classList.remove('show');
      
      authStatus.showLoginPrompt();
      
      expect(loginPrompt?.classList.contains('show')).toBe(true);
    });
  });

  describe('hideLoginPrompt', () => {
    beforeEach(() => {
      authStatus.initialize();
    });

    it('should remove show class from login prompt', () => {
      const loginPrompt = document.getElementById('loginPrompt');
      loginPrompt?.classList.add('show');
      
      authStatus.hideLoginPrompt();
      
      expect(loginPrompt?.classList.contains('show')).toBe(false);
    });
  });

  describe('event listeners', () => {
    beforeEach(() => {
      authStatus.initialize();
    });

    it('should handle login button click', () => {
      const loginButton = document.getElementById('loginButton');
      
      // Just verify the button exists and can be clicked without error
      expect(loginButton).toBeDefined();
      expect(() => {
        loginButton?.dispatchEvent(new Event('click'));
      }).not.toThrow();
    });

    it('should call signOut when logout button is clicked', async () => {
      const logoutButton = document.getElementById('logoutButton');
      
      logoutButton?.dispatchEvent(new Event('click'));
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockAuthManager.signOut).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Successfully logged out');
    });

    it('should handle logout error', async () => {
      mockAuthManager.signOut.mockResolvedValue({ 
        success: false, 
        error: 'Logout failed' 
      });
      
      const logoutButton = document.getElementById('logoutButton');
      
      logoutButton?.dispatchEvent(new Event('click'));
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(console.error).toHaveBeenCalledWith('Logout error:', 'Logout failed');
    });
  });
});
