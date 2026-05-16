const Auth = {
  isLoggedIn() {
    return !!localStorage.getItem('buxinev_token');
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('buxinev_user') || 'null');
    } catch { return null; }
  },

  saveSession(token, user) {
    localStorage.setItem('buxinev_token', token);
    localStorage.setItem('buxinev_user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('buxinev_token');
    localStorage.removeItem('buxinev_user');
    sessionStorage.removeItem('buxinev_wake_ok');
  },

  logout() {
    this.clearSession();
    window.location.href = 'login.html';
  },

  isAuthError(err) {
    return err?.status === 401
      || err?.error === 'User not found'
      || err?.error === 'Token expired'
      || err?.error === 'Invalid token';
  },

  requireAuth(redirect = 'login.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirect;
      return false;
    }
    return true;
  },

  requireAdmin() {
    const user = this.getUser();
    if (!user || user.role !== 'admin') {
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  },

  async login(email, password) {
    const data = await BuxinEV.api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.saveSession(data.token, data.user);
    return data.user;
  },

  async register(formData) {
    const data = await BuxinEV.api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    this.saveSession(data.token, data.user);
    return data.user;
  },

  async refreshUser() {
    try {
      const data = await BuxinEV.api('/api/auth/me');
      localStorage.setItem('buxinev_user', JSON.stringify(data.user));
      return data.user;
    } catch (err) {
      if (this.isAuthError(err)) {
        this.clearSession();
        window.location.href = 'login.html?msg=session';
        return null;
      }
      return this.getUser();
    }
  },

  redirectByStatus(user) {
    const next = new URLSearchParams(window.location.search).get('next');
    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
    } else if (user.status === 'active') {
      window.location.href = 'dashboard.html';
    } else if (next) {
      window.location.href = next;
    } else if (user.status === 'pending') {
      const t = user.class_type === 'individual' ? 'individual' : 'group';
      window.location.href = `payment.html?type=${t}`;
    } else {
      window.location.href = 'waiting-approval.html';
    }
  },

  handleRegisterError(err, email, paymentType) {
    if (err.status === 409) {
      BuxinEV.showToast('This email is already registered. Log in to continue payment.', 'info');
      const next = encodeURIComponent(`payment.html?type=${paymentType}`);
      setTimeout(() => {
        window.location.href = `login.html?email=${encodeURIComponent(email)}&next=${next}`;
      }, 1200);
      return true;
    }
    return false;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const emailEl = document.getElementById('email');
  if (emailEl && params.get('email')) emailEl.value = params.get('email');
  if (params.get('msg') === 'exists') {
    BuxinEV.showToast('Account exists — log in to complete payment.', 'info');
  }
  if (params.get('msg') === 'session') {
    BuxinEV.showToast('Your session expired — log in again.', 'info');
  }
});

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const user = await Auth.login(email, password);
    BuxinEV.showToast('Welcome back!', 'success');
    Auth.redirectByStatus(user);
  } catch (err) {
    let msg = err.error || 'Login failed';
    if (err.network) msg = err.error;
    else if (err.status === 401) msg = 'Invalid email or password';
    BuxinEV.showToast(msg, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  Auth.logout();
});

