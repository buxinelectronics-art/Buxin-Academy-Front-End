const Auth = {
  PUBLIC_PAGES: [
    'index.html',
    'home.html',
    'login.html',
    'register.html',
    'group-class.html',
    'individual-class.html',
  ],

  /** Pages allowed while payment is pending review or subscription expired */
  PENDING_ALLOWED_PAGES: ['waiting-approval.html', 'payment.html', 'payment-success.html', 'login.html'],

  /** Dashboard, community, etc. — only with an active monthly subscription */
  ACTIVE_ONLY_PAGES: ['dashboard.html', 'community.html'],

  /** True when Day 1–30 is running (admin has started the class period). */
  isSubscriptionActive(user) {
    if (!user || user.role === 'admin') return true;
    return user.subscription_active === true;
  },

  /** Paid and approved — community, dashboard, etc. (not after period ended). */
  hasPaidAccess(user) {
    if (!user || user.role === 'admin') return true;
    if (this.needsRenewal(user)) return false;
    if (user.has_app_access === true) return true;
    if (user.has_app_access === false) return false;
    return user.status === 'active';
  },

  /** Month ended after classes started — must pay and be approved again. */
  needsRenewal(user) {
    if (!user || user.role === 'admin') return false;
    if (user.needs_renewal === true) return true;
    return user.status === 'expired';
  },

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
    BuxinEV.syncCountryFromUser(user);
  },

  clearSession() {
    localStorage.removeItem('buxinev_token');
    localStorage.removeItem('buxinev_user');
    sessionStorage.removeItem('buxinev_wake_ok');
    sessionStorage.removeItem('buxinev_last_wake');
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

  async refreshUser({ allowStale = false } = {}) {
    try {
      const data = await BuxinEV.api(`/api/auth/me?_=${Date.now()}`);
      if (data?.user) {
        this.saveSession(localStorage.getItem('buxinev_token'), data.user);
        return data.user;
      }
      return null;
    } catch (err) {
      if (this.isAuthError(err)) {
        this.clearSession();
        window.location.href = 'login.html?msg=session';
        return null;
      }
      if (allowStale) return this.getUser();
      return null;
    }
  },

  /** Fetch fresh user; use cached profile first on pages that call this while UI is loading. */
  async refreshUserFresh() {
    return this.refreshUser({ allowStale: false });
  },

  refreshUserInBackground() {
    void this.refreshUser({ allowStale: true });
  },

  onApproved(user) {
    if (!user || !this.isSubscriptionActive(user)) return false;
    this.saveSession(localStorage.getItem('buxinev_token'), user);
    BuxinEV.showToast('Approved! Opening your dashboard…', 'success');
    window.location.replace('dashboard.html');
    return true;
  },

  startApprovalWatcher() {
    const check = async () => {
      const user = await this.refreshUserFresh();
      if (user && this.isSubscriptionActive(user)) this.onApproved(user);
    };

    void check();
    this._approvalPoll = setInterval(check, 8000);

    if (typeof io === 'undefined') return;
    const cached = this.getUser();
    if (!cached?.id) return;

    this._approvalSocket = io(BuxinEV.API_URL, { transports: ['websocket', 'polling'] });
    this._approvalSocket.emit('join_user', { user_id: cached.id });
    this._approvalSocket.on('notification', async (data) => {
      if (data?.user_status === 'active' || data?.status === 'active') {
        const user = await this.refreshUserFresh();
        if (user && this.isSubscriptionActive(user)) this.onApproved(user);
        return;
      }
      const user = await this.refreshUserFresh();
      if (user && this.isSubscriptionActive(user)) this.onApproved(user);
    });
  },

  stopApprovalWatcher() {
    if (this._approvalPoll) clearInterval(this._approvalPoll);
    this._approvalSocket?.disconnect();
    this._approvalPoll = null;
    this._approvalSocket = null;
  },

  async resolvePendingRedirect(user) {
    if (user.status === 'rejected') return 'waiting-approval.html';
    const cachedPay = BuxinEV.cacheGet('payments');
    const latestCached = cachedPay?.[0];
    if (latestCached?.status === 'pending' && latestCached?.receipt_url) {
      return 'waiting-approval.html';
    }
    try {
      const { payments } = await BuxinEV.api('/api/payments/my');
      BuxinEV.cacheSet('payments', payments);
      const latest = payments?.[0];
      if (latest?.status === 'pending' && latest?.receipt_url) return 'waiting-approval.html';
    } catch {
      /* use cache / payment page */
    }
    const t = user.class_type === 'individual' ? 'individual' : 'group';
    const renew = user.status === 'expired' ? '&renew=1' : '';
    return `payment.html?type=${t}${renew}`;
  },

  async studentDestination(user) {
    if (user.role === 'admin') return 'admin-dashboard.html';
    if (this.needsRenewal(user)) return this.resolvePendingRedirect(user);
    if (this.hasPaidAccess(user)) return 'dashboard.html';
    return this.resolvePendingRedirect(user);
  },

  isSafeNextForUser(user, next) {
    if (!next) return null;
    if (this.hasPaidAccess(user)) return next;
    const path = next.split('?')[0];
    if (path === 'payment.html' || path === 'waiting-approval.html') return next;
    return null;
  },

  async goToStudentHome(user, nextOverride) {
    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
      return;
    }
    if (this.hasPaidAccess(user)) {
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
    if (this.hasPaidAccess(user)) {
      return page !== 'waiting-approval.html';
    }
    if (user.status === 'expired') {
      if (page === 'payment.html' || page === 'waiting-approval.html' || page === 'login.html') return true;
      return false;
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
    const cached = this.getUser();

    const appPages = [...this.ACTIVE_ONLY_PAGES, 'dashboard.html', 'payment.html'];
    if (cached && this.hasPaidAccess(cached) && !this.needsRenewal(cached) && appPages.includes(page)) {
      void this.updateNavLinks(cached);
      void this.refreshUser({ allowStale: true }).then((fresh) => {
        if (!fresh) return;
        this.saveSession(localStorage.getItem('buxinev_token'), fresh);
        if (this.needsRenewal(fresh)) {
          void this.resolvePendingRedirect(fresh).then((dest) => { window.location.href = dest; });
          return;
        }
        if (page === 'dashboard.html' && typeof Dashboard !== 'undefined') {
          Dashboard.renderProfile(fresh);
        }
      });
      return;
    }

    if (cached) void this.updateNavLinks(cached);
    const user = cached || await this.refreshUserFresh();
    if (!user) return;
    void this.refreshUserInBackground();

    if (user.role === 'admin') {
      if (this.ACTIVE_ONLY_PAGES.includes(page)) {
        window.location.href = 'admin-dashboard.html';
      }
      return;
    }

    await this.updateNavLinks(user);

    if (this.needsRenewal(user)) {
      if (page === 'payment.html') return;
      if (this.ACTIVE_ONLY_PAGES.includes(page) || page === 'dashboard.html') {
        window.location.href = await this.resolvePendingRedirect(user);
        return;
      }
    }

    if (this.hasPaidAccess(user) && !this.needsRenewal(user)) {
      if (page === 'waiting-approval.html') {
        window.location.href = 'dashboard.html';
        return;
      }
      if (page === 'dashboard.html' || page === 'community.html' || page === 'payment.html') {
        return;
      }
    }

    if (user.status === 'expired' && page === 'payment.html') {
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
      : (this.hasPaidAccess(user) && !this.needsRenewal(user))
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
    const page = this.currentPage();
    const cached = this.getUser();
    if (cached) void this.updateNavLinks(cached);
    if (!this.PUBLIC_PAGES.includes(page)) return;

    const user = cached || await this.refreshUserFresh();
    if (!user) return;
    await this.updateNavLinks(user);

    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
      return;
    }
    if (this.hasPaidAccess(user)) {
      await this.goToStudentHome(user);
      return;
    }
    if (user.status === 'expired') {
      const page = this.currentPage();
      if (this.PUBLIC_PAGES.includes(page)) {
        window.location.href = await this.resolvePendingRedirect(user);
      }
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
  if (params.get('msg') === 'renew') {
    BuxinEV.showToast('Your monthly subscription ended — renew payment to access classes.', 'info');
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

