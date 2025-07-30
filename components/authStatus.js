// authStatus.js - Authentication status component

class AuthStatus {
  constructor() {
    this.elements = {};
    this.initialized = false;
  }

  // Initialize auth status component
  initialize() {
    this.elements = {
      loginPrompt: document.getElementById('loginPrompt'),
      userSection: document.getElementById('userSection'),
      userEmail: document.getElementById('userEmail'),
      loginButton: document.getElementById('loginButton'),
      logoutButton: document.getElementById('logoutButton')
    };

    // Verify all elements exist
    const missingElements = Object.entries(this.elements)
      .filter(([key, element]) => !element)
      .map(([key]) => key);
    
    if (missingElements.length > 0) {
      console.error('Missing auth elements:', missingElements);
      return;
    }

    this.setupEventListeners();
    this.initialized = true;
  }

  // Setup event listeners
  setupEventListeners() {
    // Login button
    this.elements.loginButton.addEventListener('click', () => {
      window.location.href = 'login.html';
    });

    // Logout button
    this.elements.logoutButton.addEventListener('click', async () => {
      const result = await window.authManager.signOut();
      if (result.success) {
        console.log('Successfully logged out');
      } else {
        console.error('Logout error:', result.error);
      }
    });
  }

  // Update auth UI based on user state
  updateUI(user) {
    if (!this.initialized) {
      console.warn('AuthStatus not initialized');
      return;
    }

    if (user) {
      // User is logged in
      this.elements.loginPrompt.classList.remove('show');
      this.elements.userSection.classList.add('show');
      this.elements.userEmail.textContent = user.email;
    } else {
      // User is not logged in
      this.elements.loginPrompt.classList.add('show');
      this.elements.userSection.classList.remove('show');
      this.elements.userEmail.textContent = '';
    }
  }

  // Show login prompt
  showLoginPrompt() {
    if (this.elements.loginPrompt) {
      this.elements.loginPrompt.classList.add('show');
    }
  }

  // Hide login prompt
  hideLoginPrompt() {
    if (this.elements.loginPrompt) {
      this.elements.loginPrompt.classList.remove('show');
    }
  }
}

// Export as singleton
window.authStatus = new AuthStatus();
