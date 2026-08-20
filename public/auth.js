// ===== AUTH HELPERS =====
const showAlert = (id, msg, type = 'error') => {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
};

const hideAlert = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
};

const setFieldError = (inputId, msg) => {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(inputId + 'Error');
  if (input) input.classList.add('error');
  if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
};

const clearFieldErrors = (...ids) => {
  ids.forEach((id) => {
    const input = document.getElementById(id);
    const errEl = document.getElementById(id + 'Error');
    if (input) input.classList.remove('error');
    if (errEl) errEl.classList.remove('show');
  });
};

// ===== SWITCH BETWEEN LOGIN & SIGNUP =====
const switchToSignup = () => {
  showPage('signupPage');
  hideAlert('loginAlert');
};

const switchToLogin = () => {
  showPage('loginPage');
  hideAlert('signupAlert');
};

// ===== LOGIN =====
const handleLogin = async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  clearFieldErrors('loginEmail', 'loginPassword');
  hideAlert('loginAlert');

  let valid = true;
  if (!email) { setFieldError('loginEmail', 'Email is required'); valid = false; }
  if (!password) { setFieldError('loginPassword', 'Password is required'); valid = false; }
  if (!valid) return;

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    const data = await authAPI.login(email, password);
    setAuth(data.token, data.user);
    toast('Welcome back, ' + data.user.name + '! 🎓', 'success');
    initApp(); // decides between the onboarding wizard and the dashboard
  } catch (err) {
    showAlert('loginAlert', err.message || 'Login failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
};

// ===== SIGNUP =====
const handleSignup = async (e) => {
  e.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;

  clearFieldErrors('signupName', 'signupEmail', 'signupPassword', 'signupConfirm');
  hideAlert('signupAlert');

  let valid = true;
  if (!name || name.length < 2) { setFieldError('signupName', 'Name must be at least 2 characters'); valid = false; }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) { setFieldError('signupEmail', 'Please enter a valid email'); valid = false; }
  if (!password || password.length < 6) { setFieldError('signupPassword', 'Password must be at least 6 characters'); valid = false; }
  if (password !== confirm) { setFieldError('signupConfirm', 'Passwords do not match'); valid = false; }
  if (!valid) return;

  const btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account...';

  try {
    const data = await authAPI.signup(name, email, password);
    setAuth(data.token, data.user);
    toast('Account created! Welcome, ' + data.user.name + '! 🎉', 'success');
    initApp(); // brand-new account -> straight into the onboarding wizard
  } catch (err) {
    showAlert('signupAlert', err.message || 'Signup failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
};
