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

  logout() {
    localStorage.removeItem('buxinev_token');
    localStorage.removeItem('buxinev_user');
    window.location.href = 'login.html';
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
    } catch {
      return this.getUser();
    }
  },

  redirectByStatus(user) {
    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
    } else if (user.status === 'active') {
      window.location.href = user.class_type === 'individual'
        ? 'dashboard.html'
        : 'dashboard.html';
    } else {
      window.location.href = 'waiting-approval.html';
    }
  },
};

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
    BuxinEV.showToast(err.error || 'Login failed', 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  Auth.logout();
});

