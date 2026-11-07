/**
 * @jest-environment jsdom
 */

// Tests for api/auth.js (AuthManager talking to the self-hosted Clinker API)

const API = 'https://api.test.example';

// In-memory storage.local mock
let storageData;
const mockStorageLocal = {
  get: jest.fn(),
  set: jest.fn()
};

global.browser = { storage: { local: mockStorageLocal } };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body)
  };
}

function authResponse(overrides = {}) {
  return {
    user: { id: 'user-uuid', email: 'test@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
    accessToken: 'access-1',
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    refreshToken: 'refresh-1',
    ...overrides
  };
}

const { AuthManager, ApiError } = require('../api/auth');

describe('AuthManager', () => {
  let authManager;

  beforeEach(() => {
    jest.clearAllMocks();
    storageData = {};
    mockStorageLocal.get.mockImplementation((keys) => {
      const result = {};
      const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || {});
      list.forEach(k => {
        if (storageData[k] !== undefined) result[k] = storageData[k];
        else if (keys && !Array.isArray(keys) && typeof keys === 'object') result[k] = keys[k];
      });
      return Promise.resolve(result);
    });
    mockStorageLocal.set.mockImplementation((data) => {
      Object.assign(storageData, data);
      return Promise.resolve();
    });

    global.console = { ...global.console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };

    window.CLINKER_CONFIG = { apiBaseUrl: API + '/' };
    global.fetch = jest.fn();

    authManager = new AuthManager();
    authManager.loadConfig();
  });

  afterEach(() => {
    authManager.cancelTokenRefresh();
  });

  it('exposes a singleton on window', () => {
    expect(window.authManager).toBeDefined();
    expect(typeof window.authManager.signInWithEmail).toBe('function');
  });

  it('reads the API base URL from CLINKER_CONFIG and strips trailing slashes', () => {
    expect(authManager.apiBaseUrl).toBe(API);
  });

  it('falls back to the default API base URL', () => {
    delete window.CLINKER_CONFIG;
    const saved = process.env.API_BASE_URL;
    delete process.env.API_BASE_URL;
    const am = new AuthManager();
    am.loadConfig();
    expect(am.apiBaseUrl).toBe('https://clinker.lanerate.io');
    if (saved !== undefined) process.env.API_BASE_URL = saved;
  });

  describe('signInWithEmail', () => {
    it('stores tokens and notifies listeners on success', async () => {
      global.fetch.mockResolvedValue(jsonResponse(200, authResponse()));
      const listener = jest.fn();
      authManager.onAuthStateChanged(listener);
      listener.mockClear();

      const result = await authManager.signInWithEmail('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.user).toMatchObject({ uid: 'user-uuid', email: 'test@example.com' });
      expect(global.fetch).toHaveBeenCalledWith(`${API}/v1/auth/login`, expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
      }));
      expect(storageData).toMatchObject({
        isLoggedIn: true,
        userEmail: 'test@example.com',
        userId: 'user-uuid',
        authToken: 'access-1',
        refreshToken: 'refresh-1'
      });
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user-uuid' }));
      expect(authManager.isLoggedIn()).toBe(true);
    });

    it('returns a friendly error for invalid credentials', async () => {
      global.fetch.mockResolvedValue(jsonResponse(401, { error: { code: 'invalid_credentials', message: 'nope' } }));
      const result = await authManager.signInWithEmail('test@example.com', 'bad');
      expect(result).toEqual({ success: false, error: 'Incorrect email or password' });
      expect(authManager.isLoggedIn()).toBe(false);
    });

    it('returns an error when the server is unreachable', async () => {
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const result = await authManager.signInWithEmail('test@example.com', 'pw');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unable to reach the sync server/);
    });
  });

  describe('createAccount', () => {
    it('registers and signs in', async () => {
      global.fetch.mockResolvedValue(jsonResponse(201, authResponse()));
      const result = await authManager.createAccount('test@example.com', 'password123');
      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(`${API}/v1/auth/register`, expect.objectContaining({ method: 'POST' }));
      expect(storageData.refreshToken).toBe('refresh-1');
    });

    it('maps email_taken', async () => {
      global.fetch.mockResolvedValue(jsonResponse(409, { error: { code: 'email_taken', message: 'taken' } }));
      const result = await authManager.createAccount('test@example.com', 'password123');
      expect(result).toEqual({ success: false, error: 'An account with this email already exists' });
    });
  });

  describe('password reset', () => {
    it('requests a reset email', async () => {
      global.fetch.mockResolvedValue(jsonResponse(202));
      const result = await authManager.sendPasswordResetEmail('test@example.com');
      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(`${API}/v1/auth/password-reset/request`, expect.objectContaining({
        body: JSON.stringify({ email: 'test@example.com' })
      }));
    });

    it('confirms a reset and maps invalid_token', async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse(204));
      expect(await authManager.confirmPasswordReset('tok', 'newpassword')).toEqual({ success: true });

      global.fetch.mockResolvedValueOnce(jsonResponse(400, { error: { code: 'invalid_token', message: 'bad' } }));
      const result = await authManager.confirmPasswordReset('tok', 'newpassword');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid or has expired/);
    });
  });

  describe('checkStoredAuthState', () => {
    it('restores a stored session even if the access token expired', async () => {
      storageData = {
        isLoggedIn: true,
        userEmail: 'test@example.com',
        userId: 'user-uuid',
        authToken: 'old-access',
        tokenExpiry: new Date(Date.now() - 1000).toISOString(),
        refreshToken: 'refresh-1'
      };
      await authManager.checkStoredAuthState();
      expect(authManager.getCurrentUser()).toMatchObject({ uid: 'user-uuid', email: 'test@example.com' });
      expect(authManager.refreshToken).toBe('refresh-1');
    });

    it('clears sessions without a refresh token (pre-2.0 sessions)', async () => {
      storageData = {
        isLoggedIn: true,
        userEmail: 'test@example.com',
        userId: 'old-uid',
        authToken: 'legacy-token',
        tokenExpiry: new Date(Date.now() + 100000).toISOString()
      };
      await authManager.checkStoredAuthState();
      expect(authManager.getCurrentUser()).toBeNull();
      expect(storageData.isLoggedIn).toBe(false);
      expect(storageData.authToken).toBeNull();
    });
  });

  describe('ensureValidToken / refresh', () => {
    beforeEach(async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse(200, authResponse()));
      await authManager.signInWithEmail('test@example.com', 'password123');
      global.fetch.mockReset();
    });

    it('throws when no user is logged in', async () => {
      const am = new AuthManager();
      await expect(am.ensureValidToken()).rejects.toThrow('No user logged in');
    });

    it('returns the current token without refreshing when it is still valid', async () => {
      await expect(authManager.ensureValidToken()).resolves.toBe('access-1');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refreshes (with rotation) when the token is about to expire', async () => {
      authManager.tokenExpiry = Date.now() + 10 * 1000;
      global.fetch.mockResolvedValue(jsonResponse(200, authResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' })));

      await expect(authManager.ensureValidToken()).resolves.toBe('access-2');

      expect(global.fetch).toHaveBeenCalledWith(`${API}/v1/auth/refresh`, expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-1' })
      }));
      expect(storageData.refreshToken).toBe('refresh-2');
      expect(storageData.authToken).toBe('access-2');
      expect(authManager.refreshToken).toBe('refresh-2');
    });

    it('shares one refresh request between concurrent callers', async () => {
      authManager.tokenExpiry = 0;
      global.fetch.mockResolvedValue(jsonResponse(200, authResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' })));

      const tokens = await Promise.all([
        authManager.ensureValidToken(),
        authManager.ensureValidToken(),
        authManager.ensureValidToken()
      ]);

      expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('signs out locally when the refresh token is rejected', async () => {
      const listener = jest.fn();
      authManager.onAuthStateChanged(listener);
      listener.mockClear();
      global.fetch.mockResolvedValue(jsonResponse(401, { error: { code: 'invalid_refresh_token', message: 'x' } }));

      await expect(authManager.ensureValidToken(true)).rejects.toThrow(/Session expired/);

      expect(authManager.getCurrentUser()).toBeNull();
      expect(storageData.isLoggedIn).toBe(false);
      expect(storageData.refreshToken).toBeNull();
      expect(listener).toHaveBeenCalledWith(null);
    });

    it('adopts a token rotated by another extension page instead of signing out', async () => {
      global.fetch.mockImplementation(async () => {
        // Another page refreshed first and stored a new pair
        Object.assign(storageData, {
          authToken: 'access-other',
          refreshToken: 'refresh-other',
          tokenExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        });
        return jsonResponse(401, { error: { code: 'invalid_refresh_token', message: 'x' } });
      });

      await expect(authManager.ensureValidToken(true)).resolves.toBe('access-other');
      expect(authManager.isLoggedIn()).toBe(true);
      expect(authManager.refreshToken).toBe('refresh-other');
    });

    it('keeps the session on network errors during refresh', async () => {
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(authManager.ensureValidToken(true)).rejects.toThrow('Failed to fetch');
      expect(authManager.isLoggedIn()).toBe(true);
    });

    it('authorizedFetch retries once with a refreshed token on 401', async () => {
      global.fetch
        .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'unauthorized', message: 'expired' } }))
        .mockResolvedValueOnce(jsonResponse(200, authResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' })))
        .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-uuid' } }));

      const response = await authManager.authorizedFetch('/v1/me', { method: 'GET' });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer access-1');
      expect(global.fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer access-2');
    });
  });

  describe('clearUserData', () => {
    it('should clear all user-specific data while preserving extension settings', async () => {
      storageData = { extensionActive: false };

      await authManager.clearUserData();

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        citationTree: { nodes: [], currentNodeId: null },
        tabsData: null,
        nodeCounter: 0,
        lastModified: null,
        lastSyncTime: null,
        syncVersion: null,
        extensionActive: false
      });
      expect(console.log).toHaveBeenCalledWith('Successfully cleared user data');
    });

    it('should default extensionActive to true if not set', async () => {
      await authManager.clearUserData();
      expect(mockStorageLocal.set).toHaveBeenCalledWith(expect.objectContaining({ extensionActive: true }));
    });

    it('should handle storage errors gracefully', async () => {
      mockStorageLocal.get.mockRejectedValue(new Error('Storage error'));
      await expect(authManager.clearUserData()).resolves.not.toThrow();
      expect(console.error).toHaveBeenCalledWith('Error clearing user data:', expect.any(Error));
    });
  });

  describe('signOut', () => {
    beforeEach(async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse(200, authResponse()));
      await authManager.signInWithEmail('test@example.com', 'password123');
      global.fetch.mockReset();
      storageData.extensionActive = true;
    });

    it('revokes the refresh token, then clears auth and user data', async () => {
      global.fetch.mockResolvedValue(jsonResponse(204));

      const result = await authManager.signOut();

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(`${API}/v1/auth/logout`, expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-1' })
      }));
      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        isLoggedIn: false,
        userEmail: null,
        userId: null,
        authToken: null,
        tokenExpiry: null,
        refreshToken: null
      });
      expect(mockStorageLocal.set).toHaveBeenCalledWith(expect.objectContaining({
        citationTree: { nodes: [], currentNodeId: null },
        tabsData: null,
        extensionActive: true
      }));
      expect(authManager.getCurrentUser()).toBeNull();
    });

    it('still signs out locally when the server is unreachable', async () => {
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const result = await authManager.signOut();
      expect(result.success).toBe(true);
      expect(storageData.isLoggedIn).toBe(false);
    });

    it('returns an error when local storage fails', async () => {
      global.fetch.mockResolvedValue(jsonResponse(204));
      mockStorageLocal.set.mockRejectedValue(new Error('Storage error'));
      const result = await authManager.signOut();
      expect(result).toEqual({ success: false, error: 'Storage error' });
    });

    it('notifies auth state listeners', async () => {
      global.fetch.mockResolvedValue(jsonResponse(204));
      const listener = jest.fn();
      authManager.onAuthStateChanged(listener);
      listener.mockClear();
      await authManager.signOut();
      expect(listener).toHaveBeenCalledWith(null);
    });
  });

  describe('deleteAccount', () => {
    it('fails when not signed in', async () => {
      expect(await authManager.deleteAccount()).toEqual({ success: false, error: 'Not signed in' });
    });

    it('calls DELETE /v1/me and clears everything locally', async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse(200, authResponse()));
      await authManager.signInWithEmail('test@example.com', 'password123');
      global.fetch.mockReset();
      global.fetch.mockResolvedValue(jsonResponse(204));

      const result = await authManager.deleteAccount();

      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(`${API}/v1/me`, expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer access-1' })
      }));
      expect(authManager.getCurrentUser()).toBeNull();
      expect(storageData.isLoggedIn).toBe(false);
      expect(storageData.tabsData).toBeNull();
    });

    it('keeps the session if the server refuses', async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse(200, authResponse()));
      await authManager.signInWithEmail('test@example.com', 'password123');
      global.fetch.mockReset();
      global.fetch.mockResolvedValue(jsonResponse(500, { error: { code: 'internal', message: 'boom' } }));

      const result = await authManager.deleteAccount();

      expect(result).toEqual({ success: false, error: 'boom' });
      expect(authManager.isLoggedIn()).toBe(true);
    });
  });

  it('ApiError carries status and code', () => {
    const err = new ApiError(409, 'email_taken', 'taken');
    expect(err.status).toBe(409);
    expect(err.code).toBe('email_taken');
  });
});
