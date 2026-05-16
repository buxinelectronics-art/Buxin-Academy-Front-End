const Auth = {
  PUBLIC_PAGES: [
    'index.html',
    'home.html',
    'login.html',
    'register.html',
    'group-class.html',
    'individual-class.html',
  ],

  currentPage() {
    const path = window.location.pathname.split('/').pop();
    return path || 'index.html';
  },

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

  async studentDestination(user) {
    if (user.role === 'admin') return 'admin-dashboard.html';
    if (user.status === 'active') return 'dashboard.html';
    if (user.status === 'rejected') return 'waiting-approval.html';
    try {
      const { payments } = await BuxinEV.api('/api/payments/my');
      const latest = payments?.[0];
      if (latest?.receipt_url) return 'waiting-approval.html';
    } catch {
      /* use payment page fallback */
    }
    const t = user.class_type === 'individual' ? 'individual' : 'group';
    return `payment.html?type=${t}`;
  },

  async goToStudentHome(user, nextOverride) {
    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
      return;
    }
    if (nextOverride) {
      window.location.href = nextOverride;
      return;
    }
    if (user.status === 'active') {
      window.location.href = 'dashboard.html';
      return;
    }
    window.location.href = await this.studentDestination(user);
  },

  redirectByStatus(user) {
    const next = new URLSearchParams(window.location.search).get('next');
    void this.goToStudentHome(user, next || null);
  },

  async updateNavLinks(user) {
    if (!user) return;
    const home = user.role === 'admin'
      ? 'admin-dashboard.html'
      : user.status === 'active'
        ? 'dashboard.html'
        : await this.studentDestination(user);
    document.querySelectorAll('a.logo').forEach((a) => {
      a.href = home;
    });
    document.querySelectorAll('[data-student-home]').forEach((a) => {
      a.href = home;
    });
    document.querySelectorAll('.nav-guest-only').forEach((el) => {
      el.classList.add('hidden');
    });
    document.querySelectorAll('.nav-student-only').forEach((el) => {
      el.classList.remove('hidden');
    });
  },

  /** Logged-in students/admins should not stay on marketing/login pages. */
  async guardPublicEntry() {
    if (!this.isLoggedIn()) return;
    const user = await this.refreshUser();
    if (!user) return;
    await this.updateNavLinks(user);
    if (this.PUBLIC_PAGES.includes(this.currentPage())) {
      await this.goToStudentHome(user);
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
  void Auth.guardPublicEntry().then(() => {
    if (Auth.isLoggedIn() && !Auth.PUBLIC_PAGES.includes(Auth.currentPage())) {
      void Auth.updateNavLinks(Auth.getUser());
    }
  });
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

document.querySelectorAll('#logout-btn, #logout-btn-side, [data-logout]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    Auth.logout();
  });
});

