// Login / account page functionality

const MIN_PASSWORD_LENGTH = 8;

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize authentication
  console.log('Initializing auth manager...');
  try {
    await authManager.initialize();
    console.log('Auth manager initialized successfully');
  } catch (error) {
    console.error('Error initializing auth manager:', error);
  }

  // Tab switching
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');

  function showForm(formId) {
    forms.forEach(form => {
      form.classList.toggle('active', form.id === formId);
    });
    clearAllErrors();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active form
      showForm(`${targetTab}Form`);
    });
  });

  // Sign In form submission
  document.getElementById('signinForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;
    const submitBtn = document.getElementById('signinBtn');

    clearAllErrors();
    setLoading(submitBtn, true);

    const result = await authManager.signInWithEmail(email, password);

    if (result.success) {
      showSuccess('Successfully signed in! Redirecting...');
      setTimeout(() => {
        window.location.href = 'sidebar.html';
      }, 1500);
    } else {
      setLoading(submitBtn, false);
      showError('signin-email', result.error);
    }
  });

  // Sign Up form submission
  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const submitBtn = document.getElementById('signupBtn');

    clearAllErrors();

    // Validate passwords match
    if (password !== confirmPassword) {
      showError('signup-confirm-password', 'Passwords do not match');
      return;
    }

    // Validate password strength
    if (password.length < MIN_PASSWORD_LENGTH) {
      showError('signup-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setLoading(submitBtn, true);

    const result = await authManager.createAccount(email, password);

    if (result.success) {
      showSuccess('Account created successfully! Redirecting...');
      setTimeout(() => {
        window.location.href = 'sidebar.html';
      }, 1500);
    } else {
      setLoading(submitBtn, false);
      showError('signup-email', result.error);
    }
  });

  // Forgot password
  document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
    const email = document.getElementById('signin-email').value;

    if (!email) {
      showError('signin-email', 'Please enter your email address');
      return;
    }

    const result = await authManager.sendPasswordResetEmail(email);

    if (result.success) {
      showSuccess('If an account exists for that email, a reset code has been sent. Check your inbox.');
      showForm('resetForm');
    } else {
      showError('signin-email', result.error);
    }
  });

  // Show the reset-code form directly
  document.getElementById('haveResetCodeBtn').addEventListener('click', () => {
    showForm('resetForm');
  });

  // Password reset confirmation
  document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const token = document.getElementById('reset-token').value.trim();
    const password = document.getElementById('reset-password').value;
    const submitBtn = document.getElementById('resetBtn');

    clearAllErrors();

    if (password.length < MIN_PASSWORD_LENGTH) {
      showError('reset-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setLoading(submitBtn, true);
    const result = await authManager.confirmPasswordReset(token, password);
    setLoading(submitBtn, false);

    if (result.success) {
      showSuccess('Password updated. You can now sign in.');
      showForm('signinForm');
    } else {
      showError('reset-token', result.error);
    }
  });

  // Continue offline
  document.getElementById('continueOfflineBtn').addEventListener('click', () => {
    window.location.href = 'sidebar.html';
  });

  // Account view actions
  document.getElementById('backToSidebarBtn').addEventListener('click', () => {
    window.location.href = 'sidebar.html';
  });

  document.getElementById('accountSignOutBtn').addEventListener('click', async () => {
    const result = await authManager.signOut();
    if (result.success) {
      window.location.href = 'sidebar.html';
    } else {
      showError('account', result.error);
    }
  });

  document.getElementById('signOutEverywhereBtn').addEventListener('click', async () => {
    const button = document.getElementById('signOutEverywhereBtn');
    clearAllErrors();

    const confirmed = window.confirm(
      'Sign out of Citation Linker on every device and browser, including this one?'
    );
    if (!confirmed) return;

    button.disabled = true;
    const result = await authManager.signOutEverywhere();
    button.disabled = false;
    if (result.success) {
      showSuccess('Signed out on all devices.');
      renderView(null);
    } else {
      showError('account-actions', result.error);
    }
  });

  document.getElementById('showChangePasswordBtn').addEventListener('click', () => {
    clearAllErrors();
    const form = document.getElementById('changePasswordForm');
    form.classList.toggle('active');
    if (form.classList.contains('active')) {
      document.getElementById('change-current-password').focus();
    }
  });

  document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const form = document.getElementById('changePasswordForm');
    const currentPassword = document.getElementById('change-current-password').value;
    const newPassword = document.getElementById('change-new-password').value;
    const confirmPassword = document.getElementById('change-confirm-password').value;
    const submitBtn = document.getElementById('changePasswordBtn');

    clearAllErrors();

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      showError('change-new-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('change-confirm-password', 'Passwords do not match');
      return;
    }

    setLoading(submitBtn, true);
    const result = await authManager.changePassword(currentPassword, newPassword);
    setLoading(submitBtn, false);

    if (result.success) {
      form.reset();
      form.classList.remove('active');
      showSuccess('Password changed. Other devices have been signed out.');
    } else {
      showError('change-current-password', result.error);
    }
  });

  document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
    const button = document.getElementById('deleteAccountBtn');
    const passwordInput = document.getElementById('delete-password');
    clearAllErrors();

    const password = passwordInput.value;
    if (!password) {
      showError('account', 'Enter your password to delete your account');
      passwordInput.classList.add('error');
      passwordInput.focus();
      return;
    }

    const confirmed = window.confirm(
      'Permanently delete your Citation Linker account and all synced research? This cannot be undone.'
    );
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = 'Deleting...';

    const result = await authManager.deleteAccount(password);
    if (result.success) {
      passwordInput.value = '';
      showSuccess('Your account has been deleted.');
      renderView(null);
    } else {
      button.disabled = false;
      button.textContent = 'Delete Account';
      showError('account', result.error);
    }
  });

  // Helper functions
  function showError(fieldId, message) {
    const errorElement = document.getElementById(`${fieldId}-error`);
    const inputElement = document.getElementById(fieldId);

    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.add('show');
    }

    if (inputElement) {
      inputElement.classList.add('error');
    }
  }

  function clearAllErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
      el.classList.remove('show');
      el.textContent = '';
    });

    document.querySelectorAll('.form-input').forEach(el => {
      el.classList.remove('error');
    });
  }

  function showSuccess(message) {
    const successElement = document.getElementById('successMessage');
    successElement.textContent = message;
    successElement.classList.add('show');
  }

  function setLoading(button, isLoading) {
    if (isLoading) {
      button.disabled = true;
      button.innerHTML = '<span class="loading-spinner"></span>Processing...';
    } else {
      button.disabled = false;
      // Restore original text based on button ID
      if (button.id === 'signinBtn') {
        button.textContent = 'Sign In';
      } else if (button.id === 'signupBtn') {
        button.textContent = 'Create Account';
      } else if (button.id === 'resetBtn') {
        button.textContent = 'Set New Password';
      } else if (button.id === 'changePasswordBtn') {
        button.textContent = 'Update Password';
      }
    }
  }

  // Show the account view when signed in, the sign-in forms otherwise
  function renderView(user) {
    const accountView = document.getElementById('accountView');
    const authTabs = document.getElementById('authTabs');
    const continueOffline = document.getElementById('continueOffline');

    if (user) {
      document.getElementById('accountEmail').textContent = user.email;
      accountView.classList.add('active');
      authTabs.style.display = 'none';
      continueOffline.style.display = 'none';
      forms.forEach(form => form.classList.remove('active'));
    } else {
      accountView.classList.remove('active');
      authTabs.style.display = '';
      continueOffline.style.display = '';
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'signin'));
      showForm('signinForm');
    }
  }

  // Already signed in: show account management instead of the sign-in forms
  renderView(authManager.getCurrentUser());

  // Only offer password reset when the server can actually send the email.
  const serverConfig = await authManager.getServerConfig();
  document.getElementById('forgotPasswordLinks').hidden = !(serverConfig && serverConfig.passwordReset);
});
