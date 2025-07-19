// REST-based Authentication management for Citation Linker
// Uses Firebase Auth REST API for email/password authentication (Manifest V3 compliant)

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
    this.apiKey = null;
    this.projectId = null;
  }

  // Initialize auth and set up listeners
  async initialize() {
    // Get Firebase config from build-time environment
    await this.loadFirebaseConfig();
    
    // Check for existing auth state
    await this.checkStoredAuthState();
    
    return true;
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
        this.apiKey = process.env.FIREBASE_API_KEY;
        this.projectId = process.env.FIREBASE_PROJECT_ID;
      }
      console.log('Firebase config loaded for project:', this.projectId);
    } catch (error) {
      console.error('Error loading Firebase config:', error);
      throw new Error('Firebase configuration not available');
    }
  }

  // Check for stored authentication state
  async checkStoredAuthState() {
    try {
      const stored = await this.getStorageData(['isLoggedIn', 'userEmail', 'userId', 'authToken', 'tokenExpiry']);
      
      if (stored.isLoggedIn && stored.authToken && stored.tokenExpiry) {
        const now = Date.now();
        const expiry = new Date(stored.tokenExpiry).getTime();
        
        if (now < expiry) {
          // Token still valid, restore user state
          this.currentUser = {
            uid: stored.userId,
            email: stored.userEmail,
            authToken: stored.authToken
          };
          console.log('Restored auth state for user:', stored.userEmail);
          this.notifyAuthStateListeners(this.currentUser);
        } else {
          // Token expired, clear stored auth
          console.log('Stored auth token expired, clearing...');
          await this.clearStoredAuth();
        }
      }
    } catch (error) {
      console.error('Error checking stored auth state:', error);
      await this.clearStoredAuth();
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

  // Add auth state listener
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
    // Immediately call with current state
    callback(this.currentUser);
  }

  // Notify all auth state listeners
  notifyAuthStateListeners(user) {
    this.authStateListeners.forEach(callback => callback(user));
  }


  // Sign in with email and password using Firebase Auth REST API
  async signInWithEmail(email, password) {
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          password: password,
          returnSecureToken: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = this.getFirebaseErrorMessage(data.error?.message);
        throw new Error(errorMessage);
      }

      const user = {
        uid: data.localId,
        email: data.email,
        displayName: data.displayName || data.email
      };

      await this.setUserAuthState(user, data.idToken, parseInt(data.expiresIn) * 1000);
      console.log('Successfully signed in with email:', user.email);
      return { success: true, user: user };

    } catch (error) {
      console.error('Email sign-in error:', error);
      return { success: false, error: error.message };
    }
  }

  // Create account with email and password using Firebase Auth REST API
  async createAccount(email, password) {
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          password: password,
          returnSecureToken: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = this.getFirebaseErrorMessage(data.error?.message);
        throw new Error(errorMessage);
      }

      const user = {
        uid: data.localId,
        email: data.email,
        displayName: data.displayName || data.email
      };

      await this.setUserAuthState(user, data.idToken, parseInt(data.expiresIn) * 1000);
      console.log('Successfully created account:', user.email);
      return { success: true, user: user };

    } catch (error) {
      console.error('Account creation error:', error);
      return { success: false, error: error.message };
    }
  }

  // Set user authentication state and store it
  async setUserAuthState(user, authToken, expiresIn) {
    this.currentUser = {
      ...user,
      authToken: authToken
    };

    const expiry = new Date(Date.now() + expiresIn);

    await this.setStorageData({
      isLoggedIn: true,
      userEmail: user.email,
      userId: user.uid,
      authToken: authToken,
      tokenExpiry: expiry.toISOString()
    });

    this.notifyAuthStateListeners(this.currentUser);
  }

  // Convert Firebase error codes to user-friendly messages
  getFirebaseErrorMessage(errorCode) {
    const errorMessages = {
      'EMAIL_EXISTS': 'An account with this email already exists',
      'EMAIL_NOT_FOUND': 'No account found with this email address',
      'INVALID_PASSWORD': 'Incorrect password',
      'WEAK_PASSWORD': 'Password should be at least 6 characters',
      'INVALID_EMAIL': 'Invalid email address',
      'USER_DISABLED': 'This account has been disabled',
      'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many failed attempts. Please try again later'
    };

    return errorMessages[errorCode] || errorCode || 'Authentication failed';
  }

  // Sign out
  async signOut() {
    try {
      // Clear local auth state
      await this.clearStoredAuth();
      
      const wasLoggedIn = !!this.currentUser;
      this.currentUser = null;
      
      if (wasLoggedIn) {
        this.notifyAuthStateListeners(null);
      }

      console.log('Successfully signed out');
      return { success: true };

    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  }

  // Clear stored authentication
  async clearStoredAuth() {
    await this.setStorageData({
      isLoggedIn: false,
      userEmail: null,
      userId: null,
      authToken: null,
      tokenExpiry: null
    });
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if user is logged in
  isLoggedIn() {
    return !!this.currentUser;
  }

  // Send password reset email using Firebase Auth REST API
  async sendPasswordResetEmail(email) {
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: email
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = this.getFirebaseErrorMessage(data.error?.message);
        throw new Error(errorMessage);
      }

      console.log('Password reset email sent to:', email);
      return { success: true };

    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get auth token for API calls
  getAuthToken() {
    return this.currentUser?.authToken || null;
  }

  // Check if auth token is valid and refresh if needed
  async ensureValidToken() {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    const stored = await this.getStorageData(['tokenExpiry']);
    if (stored.tokenExpiry) {
      const expiry = new Date(stored.tokenExpiry).getTime();
      const now = Date.now();
      
      // If token expires in less than 5 minutes, try to refresh
      if (expiry - now < 5 * 60 * 1000) {
        console.log('Auth token expiring soon, user may need to re-authenticate');
        // For now, we'll let it expire and require re-authentication
        // Future enhancement: implement token refresh
      }
    }

    return this.currentUser.authToken;
  }
}

// Create singleton instance
const authManager = new AuthManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { authManager };
}
