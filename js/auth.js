const Auth = {
  PUBLIC_PAGES: [
    'index.html',
    'home.html',
    'login.html',
    'register.html',
    'group-class.html',
    'individual-class.html',
  ],

  /** Pages allowed while payment is pending review */
  PENDING_ALLOWED_PAGES: ['waiting-approval.html', 'payment.html', 'login.html'],

  /** Dashboard, community, etc. — only after admin approves payment */
  ACTIVE_ONLY_PAGES: ['dashboard.html', 'community.html'],

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
      window.location.href = 'login.html';
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

  async resolvePendingRedirect(user) {
    if (user.status === 'rejected') return 'waiting-approval.html';
    try {
      const { payments } = await BuxinEV.api('/api/payments/my');
      const latest = payments?.[0];
      if (latest?.receipt_url) return 'waiting-approval.html';
    } catch {
      /* fall through */
    }
    const t = user.class_type === 'individual' ? 'individual' : 'group';
    return `payment.html?type=${t}`;
  },

  async studentDestination(user) {
    if (user.role === 'admin') return 'admin-dashboard.html';
    if (user.status === 'active') return 'dashboard.html';
    return this.resolvePendingRedirect(user);
  },

  isSafeNextForUser(user, next) {
    if (!next) return null;
    if (user.status === 'active') return next;
    const path = next.split('?')[0];
    if (path === 'payment.html' || path === 'waiting-approval.html') return next;
    return null;
  },

  async goToStudentHome(user, nextOverride) {
    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
      return;
    }
    if (user.status === 'active') {
      window.location.href = nextOverride || 'dashboard.html';
      return;
    }
    const safeNext = this.isSafeNextForUser(user, nextOverride);
    if (safeNext) {
      window.location.href = safeNext;
      return;
    }
    window.location.href = await this.resolvePendingRedirect(user);
  },

  redirectByStatus(user) {
    const next = new URLSearchParams(window.location.search).get('next');
    void this.goToStudentHome(user, this.isSafeNextForUser(user, next));
  },

  /** Pending students may only complete payment or wait; active students use the app. */
  async canAccessPage(user, page) {
    if (!user || user.role === 'admin') return true;
    if (user.status === 'active') {
      return page !== 'waiting-approval.html';
    }
    const dest = await this.resolvePendingRedirect(user);
    if (page === 'waiting-approval.html') return dest === 'waiting-approval.html';
    if (page === 'payment.html') return dest.startsWith('payment.html');
    if (page === 'individual-class.html') {
      return dest.startsWith('payment.html') && user.class_type === 'individual';
    }
    if (page === 'login.html') return true;
    return false;
  },

  async enforceStudentAccess() {
    if (!this.isLoggedIn()) return;
    const page = this.currentPage();
    const user = await this.refreshUser();
    if (!user) return;

    if (user.role === 'admin') {
      if (this.ACTIVE_ONLY_PAGES.includes(page)) {
        window.location.href = 'admin-dashboard.html';
      }
      return;
    }

    await this.updateNavLinks(user);

    if (user.status === 'active') {
      if (page === 'waiting-approval.html') {
        window.location.href = 'dashboard.html';
      }
      return;
    }

    if (this.ACTIVE_ONLY_PAGES.includes(page) || page === 'dashboard.html') {
      window.location.href = await this.resolvePendingRedirect(user);
      return;
    }

    if (!(await this.canAccessPage(user, page))) {
      window.location.href = await this.resolvePendingRedirect(user);
    }
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

  /** Logged-in users should not stay on marketing/signup pages (except individual schedule step). */
  async guardPublicEntry() {
    if (!this.isLoggedIn()) return;
    const user = await this.refreshUser();
    if (!user) return;
    await this.updateNavLinks(user);
    const page = this.currentPage();
    if (!this.PUBLIC_PAGES.includes(page)) return;

    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
      return;
    }
    if (user.status === 'active') {
      await this.goToStudentHome(user);
      return;
    }
    if (!(await this.canAccessPage(user, page))) {
      window.location.href = await this.resolvePendingRedirect(user);
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
  void Auth.guardPublicEntry().then(() => Auth.enforceStudentAccess());
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

