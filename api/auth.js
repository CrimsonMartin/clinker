// Authentication management for Citation Linker.
// Talks to the self-hosted Clinker API (see docs/API.md). Manifest V3 compliant:
// plain fetch() calls, no remote code.
//
// Session model:
//   - access token (JWT, ~15 min) + refresh token (opaque, rotated on every refresh)
//     are kept in storage.local.
//   - The access token is refreshed shortly before it expires (timer + on demand in
//     ensureValidToken), and once more if an authorized request comes back 401.

const DEFAULT_API_BASE_URL = 'https://clinker.lanerate.io';

// Refresh the access token when it has less than this much time left.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

// Storage keys that hold the auth session.
const AUTH_STORAGE_KEYS = ['isLoggedIn', 'userEmail', 'userId', 'authToken', 'tokenExpiry', 'refreshToken'];

function resolveApiBaseUrl() {
  let url = null;
  if (typeof window !== 'undefined' && window.CLINKER_CONFIG && window.CLINKER_CONFIG.apiBaseUrl) {
    url = window.CLINKER_CONFIG.apiBaseUrl;
  } else if (typeof process !== 'undefined' && process.env && process.env.API_BASE_URL) {
    url = process.env.API_BASE_URL;
  }
  return (url || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

// Error thrown for non-2xx API responses.
class ApiError extends Error {
  constructor(status, code, message, body) {
    super(message || code || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || null;
    this.body = body || null;
  }
}

// Parse a fetch Response into JSON (or null for empty bodies).
async function readJson(response) {
  if (response.status === 204) return null;
  try {
    const text = typeof response.text === 'function' ? await response.text() : null;
    if (text !== null) return text ? JSON.parse(text) : null;
    return typeof response.json === 'function' ? await response.json() : null;
  } catch (e) {
    return null;
  }
}

async function toApiError(response) {
  const body = await readJson(response);
  const err = body && body.error ? body.error : {};
  return new ApiError(response.status, err.code, err.message, body);
}

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
    this.apiBaseUrl = DEFAULT_API_BASE_URL;
    this.refreshToken = null;
    this.tokenExpiry = null; // ms since epoch
    this.refreshPromise = null;
    this.refreshTimer = null;
    this.loadConfig();
  }

  // Initialize auth and restore any stored session
  async initialize() {
    this.loadConfig();
    await this.checkStoredAuthState();
    return true;
  }

  loadConfig() {
    this.apiBaseUrl = resolveApiBaseUrl();
  }

  // Restore a stored session. Access tokens may have expired; as long as a refresh
  // token exists we keep the user signed in and refresh lazily.
  async checkStoredAuthState() {
    try {
      const stored = await this.getStorageData(AUTH_STORAGE_KEYS);

      if (stored.isLoggedIn && stored.refreshToken && stored.userId) {
        this.refreshToken = stored.refreshToken;
        this.tokenExpiry = stored.tokenExpiry ? new Date(stored.tokenExpiry).getTime() : 0;
        this.currentUser = {
          uid: stored.userId,
          email: stored.userEmail,
          displayName: stored.userEmail,
          authToken: stored.authToken || null
        };
        console.log('Restored auth state for user:', stored.userEmail);
        this.scheduleTokenRefresh();
        this.notifyAuthStateListeners(this.currentUser);
      } else if (stored.isLoggedIn) {
        // Session from an older version (no refresh token) - require a new sign-in
        console.log('Stored session is incomplete or from an older version, clearing...');
        await this.clearStoredAuth();
      }
    } catch (error) {
      console.error('Error checking stored auth state:', error);
      try { await this.clearStoredAuth(); } catch (e) { /* ignore */ }
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

  // Add auth state listener. Returns an unsubscribe function.
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
    // Immediately call with current state
    callback(this.currentUser);
    return () => {
      this.authStateListeners = this.authStateListeners.filter(cb => cb !== callback);
    };
  }

  // Notify all auth state listeners
  notifyAuthStateListeners(user) {
    this.authStateListeners.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    });
  }

  // Unauthenticated JSON request to the API. Throws ApiError on non-2xx.
  async apiRequest(method, path, body) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) options.body = JSON.stringify(body);
    const response = await fetch(`${this.apiBaseUrl}${path}`, options);
    if (!response.ok) throw await toApiError(response);
    return readJson(response);
  }

  // Authenticated fetch: adds the bearer token, refreshing it first if it is about
  // to expire, and retries once with a fresh token on 401. Returns the raw Response.
  async authorizedFetch(path, options = {}) {
    const doFetch = (token) => fetch(`${this.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        'Authorization': `Bearer ${token}`
      }
    });

    let token = await this.ensureValidToken();
    let response = await doFetch(token);
    if (response.status === 401) {
      token = await this.ensureValidToken(true);
      response = await doFetch(token);
    }
    return response;
  }

  // Sign in with email and password
  async signInWithEmail(email, password) {
    try {
      const data = await this.apiRequest('POST', '/v1/auth/login', { email, password });
      const user = await this.setSession(data);
      console.log('Successfully signed in with email:', user.email);
      return { success: true, user };
    } catch (error) {
      console.error('Email sign-in error:', error);
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  // Create account with email and password
  async createAccount(email, password) {
    try {
      const data = await this.apiRequest('POST', '/v1/auth/register', { email, password });
      const user = await this.setSession(data);
      console.log('Successfully created account:', user.email);
      return { success: true, user };
    } catch (error) {
      console.error('Account creation error:', error);
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  // Store a session from an AuthResponse and update current user.
  async setSession(authResponse, { notify = true } = {}) {
    if (!authResponse || !authResponse.user || !authResponse.accessToken || !authResponse.refreshToken) {
      throw new Error('Invalid response from server');
    }

    const user = {
      uid: authResponse.user.id,
      email: authResponse.user.email,
      displayName: authResponse.user.email,
      createdAt: authResponse.user.createdAt
    };

    const expiry = authResponse.accessTokenExpiresAt
      ? new Date(authResponse.accessTokenExpiresAt).getTime()
      : Date.now() + 15 * 60 * 1000;

    await this.setStorageData({
      isLoggedIn: true,
      userEmail: user.email,
      userId: user.uid,
      authToken: authResponse.accessToken,
      tokenExpiry: new Date(expiry).toISOString(),
      refreshToken: authResponse.refreshToken
    });

    this.refreshToken = authResponse.refreshToken;
    this.tokenExpiry = expiry;
    this.currentUser = { ...user, authToken: authResponse.accessToken };
    this.scheduleTokenRefresh();

    if (notify) {
      this.notifyAuthStateListeners(this.currentUser);
    }
    return this.currentUser;
  }

  // Backward-compatible wrapper (old signature: user, token, expiresInMs)
  async setUserAuthState(user, authToken, expiresIn, refreshToken) {
    return this.setSession({
      user: { id: user.uid, email: user.email, createdAt: user.createdAt },
      accessToken: authToken,
      accessTokenExpiresAt: new Date(Date.now() + expiresIn).toISOString(),
      refreshToken: refreshToken || this.refreshToken
    });
  }

  // Convert API error codes to user-friendly messages
  getErrorMessage(error) {
    const messages = {
      email_taken: 'An account with this email already exists',
      invalid_credentials: 'Incorrect email or password',
      invalid_refresh_token: 'Your session has expired. Please sign in again',
      invalid_token: 'This reset code is invalid or has expired',
      invalid_password: 'Incorrect password',
      registration_closed: 'New account registration is currently closed',
      rate_limited: 'Too many attempts. Please try again later',
      not_found: 'Not found'
    };

    if (error instanceof ApiError) {
      if (error.code && messages[error.code]) return messages[error.code];
      if (error.status === 429) return messages.rate_limited;
      return error.message || 'Request failed';
    }
    if (error && (error.name === 'TypeError' || /fetch|network/i.test(error.message || ''))) {
      return 'Unable to reach the sync server. Check your connection and try again';
    }
    return (error && error.message) || 'Authentication failed';
  }

  // Sign out: revoke the refresh token on the server (best effort), then clear
  // local auth state and user data.
  async signOut() {
    try {
      const refreshToken = this.refreshToken;
      this.cancelTokenRefresh();

      if (refreshToken) {
        try {
          await this.apiRequest('POST', '/v1/auth/logout', { refreshToken });
        } catch (error) {
          // Logging out locally must still succeed when the server is unreachable
          console.warn('Server logout failed (continuing with local sign out):', error.message);
        }
      }

      await this.endLocalSession();
      console.log('Successfully signed out');

      await this.clearUserData();

      return { success: true };

    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  }

  // Permanently delete the account and all synced data (DELETE /v1/me, which
  // requires the current password), then clear local auth state and user data.
  async deleteAccount(password) {
    if (!this.currentUser) {
      return { success: false, error: 'Not signed in' };
    }
    if (!password) {
      return { success: false, error: 'Enter your password to delete your account' };
    }
    try {
      const response = await this.authorizedFetch('/v1/me', {
        method: 'DELETE',
        body: JSON.stringify({ password })
      });
      if (!response.ok) {
        throw await toApiError(response);
      }

      this.cancelTokenRefresh();
      await this.endLocalSession();
      await this.clearUserData();
      console.log('Account deleted');
      return { success: true };
    } catch (error) {
      console.error('Delete account error:', error);
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  // Change the password (POST /v1/auth/password). The server signs out every
  // other session and returns a fresh token pair for this one.
  async changePassword(currentPassword, newPassword) {
    if (!this.currentUser) {
      return { success: false, error: 'Not signed in' };
    }
    try {
      const response = await this.authorizedFetch('/v1/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!response.ok) {
        throw await toApiError(response);
      }
      await this.setSession(await readJson(response), { notify: false });
      console.log('Password changed');
      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  // Sign out of every device (POST /v1/auth/logout-all), then end the local
  // session like signOut(). If the server call fails nothing is changed locally,
  // so the user can retry.
  async signOutEverywhere() {
    if (!this.currentUser) {
      return { success: false, error: 'Not signed in' };
    }
    try {
      const response = await this.authorizedFetch('/v1/auth/logout-all', { method: 'POST' });
      if (!response.ok) {
        throw await toApiError(response);
      }
      this.cancelTokenRefresh();
      await this.endLocalSession();
      await this.clearUserData();
      console.log('Signed out everywhere');
      return { success: true };
    } catch (error) {
      console.error('Sign out everywhere error:', error);
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  // Public server capabilities (GET /v1/config), e.g. whether password reset
  // mail can be sent. Returns null if the server can't be reached.
  async getServerConfig() {
    try {
      const data = await this.apiRequest('GET', '/v1/config');
      return {
        passwordReset: !!(data && data.passwordReset),
        registrationOpen: !!(data && data.registrationOpen)
      };
    } catch (error) {
      console.warn('Could not load server config:', error.message);
      return null;
    }
  }

  // Clear stored auth and notify listeners that the user is gone.
  async endLocalSession() {
    await this.clearStoredAuth();
    const wasLoggedIn = !!this.currentUser;
    this.currentUser = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    if (wasLoggedIn) {
      this.notifyAuthStateListeners(null);
    }
  }

  // Clear stored authentication
  async clearStoredAuth() {
    await this.setStorageData({
      isLoggedIn: false,
      userEmail: null,
      userId: null,
      authToken: null,
      tokenExpiry: null,
      refreshToken: null
    });
  }

  // Clear all user-specific citation data
  async clearUserData() {
    try {
      // Get current extension settings to preserve them
      const currentSettings = await this.getStorageData(['extensionActive']);

      // Clear all user-specific data while preserving system settings
      const dataToSet = {
        // Reset citation data (legacy format)
        citationTree: { nodes: [], currentNodeId: null },

        // Reset tab data (new format)
        tabsData: null,

        // Reset counters and timestamps
        nodeCounter: 0,
        lastModified: null,

        // Reset sync bookkeeping
        lastSyncTime: null,
        syncVersion: null,

        // Preserve extension settings
        extensionActive: currentSettings.extensionActive !== undefined ? currentSettings.extensionActive : true
      };

      await this.setStorageData(dataToSet);
      console.log('Successfully cleared user data');

    } catch (error) {
      console.error('Error clearing user data:', error);
      // Don't throw error - logout should still succeed even if data clearing fails
    }
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if user is logged in
  isLoggedIn() {
    return !!this.currentUser;
  }

  // Request a password reset email. The server always answers 202.
  async sendPasswordResetEmail(email) {
    try {
      await this.apiRequest('POST', '/v1/auth/password-reset/request', { email });
      console.log('Password reset requested for:', email);
      return { success: true };
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  // Set a new password using the token from the reset email.
  async confirmPasswordReset(token, password) {
    try {
      await this.apiRequest('POST', '/v1/auth/password-reset/confirm', { token, password });
      return { success: true };
    } catch (error) {
      console.error('Password reset confirm error:', error);
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  // Get auth token for API calls
  getAuthToken() {
    return this.currentUser?.authToken || null;
  }

  // Return a valid access token, refreshing it if it expires soon (or if
  // forceRefresh is set, e.g. after a 401).
  async ensureValidToken(forceRefresh = false) {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    const expiresSoon = !this.currentUser.authToken ||
      !this.tokenExpiry ||
      this.tokenExpiry - Date.now() < TOKEN_REFRESH_MARGIN_MS;

    if (forceRefresh || expiresSoon) {
      await this.refreshAccessToken();
    }

    if (!this.currentUser) {
      throw new Error('No user logged in');
    }
    return this.currentUser.authToken;
  }

  // Exchange the refresh token for a new token pair. Concurrent callers share
  // one request, since refresh tokens are single-use (rotated).
  async refreshAccessToken() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      // storage.local is the source of truth shared by all extension pages. If another page
      // already rotated the pair, use that instead of replaying our stale refresh token: the
      // server treats a late replay of a rotated token as theft and revokes the whole session.
      const current = await this.getStorageData(AUTH_STORAGE_KEYS);
      if (!current.isLoggedIn || !current.refreshToken) {
        await this.handleSessionExpired();
        throw new Error('Session expired. Please sign in again');
      }
      if (current.refreshToken !== this.refreshToken) {
        this.adoptStoredSession(current);
        if (this.currentUser && this.currentUser.authToken &&
            this.tokenExpiry - Date.now() >= TOKEN_REFRESH_MARGIN_MS) {
          return;
        }
      }

      const usedToken = this.refreshToken;

      try {
        const data = await this.apiRequest('POST', '/v1/auth/refresh', { refreshToken: usedToken });
        await this.setSession(data, { notify: false });
        console.log('Access token refreshed');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          // Another extension page may have rotated the token already; adopt it.
          const stored = await this.getStorageData(AUTH_STORAGE_KEYS);
          if (stored.isLoggedIn && stored.refreshToken && stored.refreshToken !== usedToken) {
            this.adoptStoredSession(stored);
            return;
          }
          await this.handleSessionExpired();
          throw new Error('Session expired. Please sign in again');
        }
        // Network or server error: keep the session; caller can retry later.
        throw error;
      }
    })();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  // Take over a token pair that another extension page stored.
  adoptStoredSession(stored) {
    this.refreshToken = stored.refreshToken;
    this.tokenExpiry = stored.tokenExpiry ? new Date(stored.tokenExpiry).getTime() : 0;
    if (this.currentUser) this.currentUser.authToken = stored.authToken || null;
    this.scheduleTokenRefresh();
  }

  // The refresh token was rejected: drop the session (keep local research data).
  async handleSessionExpired() {
    console.warn('Session expired, signing out locally');
    this.cancelTokenRefresh();
    await this.endLocalSession();
  }

  scheduleTokenRefresh() {
    this.cancelTokenRefresh();
    if (!this.tokenExpiry || typeof setTimeout === 'undefined') return;
    const delay = Math.max(this.tokenExpiry - Date.now() - TOKEN_REFRESH_MARGIN_MS, 0);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      if (!this.currentUser) return;
      this.refreshAccessToken().catch(error => {
        console.warn('Background token refresh failed:', error.message);
      });
    }, delay);
  }

  cancelTokenRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// Create singleton instance
const authManager = new AuthManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { authManager, AuthManager, ApiError };
}

// Also export to global scope for browser usage
if (typeof window !== 'undefined') {
  window.authManager = authManager;
  window.ClinkerApiError = ApiError;
} else if (typeof global !== 'undefined') {
  global.authManager = authManager;
}
