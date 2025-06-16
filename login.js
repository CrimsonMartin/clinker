// Login page functionality

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize authentication
  await authManager.initialize();
  
  // Tab switching
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active form
      forms.forEach(form => {
        form.classList.remove('active');
        if (form.id === `${targetTab}Form`) {
          form.classList.add('active');
        }
      });
      
      // Clear any error messages
      clearAllErrors();
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
    if (password.length < 6) {
      showError('signup-password', 'Password must be at least 6 characters');
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
  
  // Google Sign In buttons
  document.getElementById('googleSigninBtn').addEventListener('click', handleGoogleSignIn);
  document.getElementById('googleSignupBtn').addEventListener('click', handleGoogleSignIn);
  
  async function handleGoogleSignIn() {
    const result = await authManager.signInWithGoogle();
    
    if (result.success) {
      showSuccess('Successfully signed in with Google! Redirecting...');
      setTimeout(() => {
        window.location.href = 'sidebar.html';
      }, 1500);
    } else {
      showError('signin-email', result.error);
    }
  }
  
  // Forgot password
  document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
    const email = document.getElementById('signin-email').value;
    
    if (!email) {
      showError('signin-email', 'Please enter your email address');
      return;
    }
    
    const result = await authManager.sendPasswordResetEmail(email);
    
    if (result.success) {
      showSuccess('Password reset email sent! Check your inbox.');
    } else {
      showError('signin-email', result.error);
    }
  });
  
  // Continue offline
  document.getElementById('continueOfflineBtn').addEventListener('click', () => {
    window.location.href = 'sidebar.html';
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
      }
    }
  }
  
  // Check if already logged in
  const user = authManager.getCurrentUser();
  if (user) {
    // Already logged in, redirect to main sidebar
    window.location.href = 'sidebar.html';
  }
});
