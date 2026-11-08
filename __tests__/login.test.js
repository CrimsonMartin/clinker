/**
 * @jest-environment jsdom
 */

// Tests for the login / account page (login.html + login.js)

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function makeAuthManager({ user = null, serverConfig = { passwordReset: true, registrationOpen: true } } = {}) {
  return {
    initialize: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn(() => user),
    getServerConfig: jest.fn().mockResolvedValue(serverConfig),
    signInWithEmail: jest.fn(),
    createAccount: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    confirmPasswordReset: jest.fn(),
    signOut: jest.fn().mockResolvedValue({ success: true }),
    signOutEverywhere: jest.fn().mockResolvedValue({ success: true }),
    changePassword: jest.fn().mockResolvedValue({ success: true }),
    deleteAccount: jest.fn().mockResolvedValue({ success: true })
  };
}

async function loadPage(authManager) {
  document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html>/, '').replace(/<\/html>\s*$/, '');
  global.authManager = authManager;
  // Run this load's DOMContentLoaded handler directly, so handlers from earlier
  // tests (registered on the same document) don't fire again.
  let onReady = null;
  const spy = jest.spyOn(document, 'addEventListener').mockImplementation((type, fn) => {
    if (type === 'DOMContentLoaded') onReady = fn;
  });
  jest.isolateModules(() => {
    require('../login.js');
  });
  spy.mockRestore();
  await onReady();
  await flush();
  await flush();
}

const $ = (id) => document.getElementById(id);

describe('login page', () => {
  beforeEach(() => {
    global.console = { ...global.console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };
    window.confirm = jest.fn(() => true);
  });

  describe('forgot password', () => {
    it('is hidden when the server cannot send reset mail', async () => {
      await loadPage(makeAuthManager({ serverConfig: { passwordReset: false, registrationOpen: true } }));
      expect($('forgotPasswordLinks').hidden).toBe(true);
    });

    it('is hidden when the server config cannot be loaded', async () => {
      await loadPage(makeAuthManager({ serverConfig: null }));
      expect($('forgotPasswordLinks').hidden).toBe(true);
    });

    it('is shown when password reset is available', async () => {
      await loadPage(makeAuthManager({ serverConfig: { passwordReset: true, registrationOpen: true } }));
      expect($('forgotPasswordLinks').hidden).toBe(false);
    });
  });

  describe('account view', () => {
    const user = { uid: 'u1', email: 'me@example.com' };
    let am;

    beforeEach(async () => {
      am = makeAuthManager({ user });
      await loadPage(am);
    });

    it('is shown when signed in', () => {
      expect($('accountView').classList.contains('active')).toBe(true);
      expect($('accountEmail').textContent).toBe('me@example.com');
    });

    it('delete account requires the password and sends it', async () => {
      $('deleteAccountBtn').click();
      await flush();
      expect(am.deleteAccount).not.toHaveBeenCalled();
      expect($('account-error').textContent).toMatch(/password/i);

      $('delete-password').value = 'my password';
      $('deleteAccountBtn').click();
      await flush();
      expect(window.confirm).toHaveBeenCalled();
      expect(am.deleteAccount).toHaveBeenCalledWith('my password');
      expect($('accountView').classList.contains('active')).toBe(false);
    });

    it('delete account shows server errors and keeps the account view', async () => {
      am.deleteAccount.mockResolvedValue({ success: false, error: 'Incorrect password' });
      $('delete-password').value = 'wrong';
      $('deleteAccountBtn').click();
      await flush();
      expect($('account-error').textContent).toBe('Incorrect password');
      expect($('deleteAccountBtn').disabled).toBe(false);
      expect($('accountView').classList.contains('active')).toBe(true);
    });

    it('change password validates and calls the API', async () => {
      $('showChangePasswordBtn').click();
      expect($('changePasswordForm').classList.contains('active')).toBe(true);

      $('change-current-password').value = 'old password';
      $('change-new-password').value = 'short';
      $('change-confirm-password').value = 'short';
      $('changePasswordForm').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();
      expect(am.changePassword).not.toHaveBeenCalled();
      expect($('change-new-password-error').textContent).toMatch(/at least 8/);

      $('change-new-password').value = 'new password 1';
      $('change-confirm-password').value = 'new password 2';
      $('changePasswordForm').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();
      expect(am.changePassword).not.toHaveBeenCalled();
      expect($('change-confirm-password-error').textContent).toMatch(/do not match/);

      $('change-confirm-password').value = 'new password 1';
      $('changePasswordForm').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();
      expect(am.changePassword).toHaveBeenCalledWith('old password', 'new password 1');
      expect($('changePasswordForm').classList.contains('active')).toBe(false);
      expect($('successMessage').textContent).toMatch(/Password changed/);
    });

    it('sign out everywhere calls the API after confirmation', async () => {
      $('signOutEverywhereBtn').click();
      await flush();
      expect(window.confirm).toHaveBeenCalled();
      expect(am.signOutEverywhere).toHaveBeenCalled();
      expect($('accountView').classList.contains('active')).toBe(false);
    });

    it('sign out everywhere reports failures', async () => {
      am.signOutEverywhere.mockResolvedValue({ success: false, error: 'Unable to reach the sync server' });
      $('signOutEverywhereBtn').click();
      await flush();
      expect($('account-actions-error').textContent).toMatch(/Unable to reach/);
      expect($('accountView').classList.contains('active')).toBe(true);
    });
  });
});
