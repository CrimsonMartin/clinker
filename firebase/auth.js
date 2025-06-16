// Authentication management for Citation Linker

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
  }

  // Initialize auth and set up listeners
  async initialize() {
    // Firebase is guaranteed to be loaded from vendor folder
    // and initialized by firebase-config.js, so we can directly use it
    
    // Set up auth state listener
    firebase.auth().onAuthStateChanged((user) => {
      this.currentUser = user;
      this.notifyAuthStateListeners(user);
      
      // Store auth state in browser storage
      browser.storage.local.set({ 
        isLoggedIn: !!user,
        userEmail: user?.email || null,
        userId: user?.uid || null
      });
    });

    // Check initial auth state
    const storedAuth = await browser.storage.local.get(['isLoggedIn', 'userEmail', 'userId']);
    if (storedAuth.isLoggedIn && storedAuth.userId) {
      // Verify the stored auth is still valid
      const user = firebase.auth().currentUser;
      if (!user) {
        // Clear invalid stored auth
        await this.clearStoredAuth();
      }
    }
    
    return true;
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

  // Sign in with Google
  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      
      const result = await firebase.auth().signInWithPopup(provider);
      console.log('Successfully signed in with Google:', result.user.email);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Google sign-in error:', error);
      return { success: false, error: error.message };
    }
  }

  // Sign in with email and password
  async signInWithEmail(email, password) {
    try {
      const result = await firebase.auth().signInWithEmailAndPassword(email, password);
      console.log('Successfully signed in with email:', result.user.email);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Email sign-in error:', error);
      return { success: false, error: error.message };
    }
  }

  // Create account with email and password
  async createAccount(email, password) {
    try {
      const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
      console.log('Successfully created account:', result.user.email);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Account creation error:', error);
      return { success: false, error: error.message };
    }
  }

  // Sign out
  async signOut() {
    try {
      await firebase.auth().signOut();
      await this.clearStoredAuth();
      console.log('Successfully signed out');
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  }

  // Clear stored authentication
  async clearStoredAuth() {
    await browser.storage.local.set({ 
      isLoggedIn: false,
      userEmail: null,
      userId: null 
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

  // Send password reset email
  async sendPasswordResetEmail(email) {
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      console.log('Password reset email sent to:', email);
      return { success: true };
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const authManager = new AuthManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { authManager };
}
