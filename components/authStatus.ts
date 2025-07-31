// authStatus.ts - Authentication status component

interface AuthElements {
  loginPrompt: HTMLElement | null;
  userSection: HTMLElement | null;
  userEmail: HTMLElement | null;
  loginButton: HTMLElement | null;
  logoutButton: HTMLElement | null;
}

interface User {
  email: string;
  uid?: string;
}

class AuthStatus {
  private elements: AuthElements;
  private initialized: boolean;

  constructor() {
    this.elements = {
      loginPrompt: null,
      userSection: null,
      userEmail: null,
      loginButton: null,
      logoutButton: null
    };
    this.initialized = false;
  }

  // Initialize auth status component
  initialize(): void {
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
  private setupEventListeners(): void {
    // Login button
    this.elements.loginButton?.addEventListener('click', () => {
      window.location.href = 'login.html';
    });

    // Logout button
    this.elements.logoutButton?.addEventListener('click', async () => {
      const result = await (window as any).authManager.signOut();
      if (result.success) {
        console.log('Successfully logged out');
      } else {
        console.error('Logout error:', result.error);
      }
    });
  }

  // Update auth UI based on user state
  updateUI(user: User | null): void {
    if (!this.initialized) {
      console.warn('AuthStatus not initialized');
      return;
    }

    if (user) {
      // User is logged in
      this.elements.loginPrompt?.classList.remove('show');
      this.elements.userSection?.classList.add('show');
      if (this.elements.userEmail) {
        this.elements.userEmail.textContent = user.email;
      }
    } else {
      // User is not logged in
      this.elements.loginPrompt?.classList.add('show');
      this.elements.userSection?.classList.remove('show');
      if (this.elements.userEmail) {
        this.elements.userEmail.textContent = '';
      }
    }
  }

  // Show login prompt
  showLoginPrompt(): void {
    this.elements.loginPrompt?.classList.add('show');
  }

  // Hide login prompt
  hideLoginPrompt(): void {
    this.elements.loginPrompt?.classList.remove('show');
  }
}

// Export as singleton for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).authStatus = new AuthStatus();
}
