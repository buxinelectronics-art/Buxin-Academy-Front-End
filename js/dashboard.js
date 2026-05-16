const Dashboard = {
  socket: null,

  async init() {
    if (!Auth.requireAuth()) return;
    BuxinEV.requireCountry();
    const user = await Auth.refreshUser();
    if (!user) return;
    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
      return;
    }
    if (user.status !== 'active') {
      window.location.href = 'waiting-approval.html';
      return;
    }
    this.renderProfile(user);
    if (user.class_type === 'individual') {
      document.getElementById('schedule-info')?.classList.remove('hidden');
    }
    await Promise.all([
      this.loadPayments(),
      this.loadNotifications(),
      this.loadClasses(),
      user.class_type === 'individual' ? this.loadSchedules() : Promise.resolve(),
    ]);
    this.initSocket(user.id);
    this.startCountdown();
  },

  renderProfile(user) {
    document.getElementById('user-name') && (document.getElementById('user-name').textContent = user.full_name);
    document.getElementById('user-email') && (document.getElementById('user-email').textContent = user.email);
    const statusEl = document.getElementById('user-status');
    if (statusEl) {
      statusEl.textContent = user.status;
      statusEl.className = `status-badge status-${user.status}`;
    }
    document.getElementById('user-class') && (document.getElementById('user-class').textContent =
      user.class_type === 'individual' ? 'Individual Mentorship' : 'Group Class (Sundays)');
    const avatar = document.getElementById('user-avatar');
    if (avatar && user.profile_picture) {
      avatar.src = user.profile_picture;
      avatar.classList.remove('hidden');
    }
    const country = BuxinEV.COUNTRIES[user.country_code];
    document.getElementById('user-country') && (document.getElementById('user-country').textContent =
      country ? `${country.flag} ${country.name}` : user.country_code);
  },

  async loadPayments() {
    try {
      const { payments } = await Payments.getMyPayments();
      const latest = payments[0];
      if (!latest) return;
      const el = document.getElementById('payment-status-card');
      if (el) {
        el.innerHTML = `
          <p class="status-badge status-${latest.status}">${latest.status}</p>
          <p>${latest.currency} ${latest.amount_local?.toLocaleString()}</p>
          <p class="text-sm opacity-70">${latest.payment_method || '—'}</p>
          ${latest.receipt_url ? `<img src="${latest.receipt_url}" alt="Receipt" class="receipt-thumb mt-2" loading="lazy">` : ''}
        `;
      }
    } catch { /* offline fallback */ }
  },

  async loadNotifications() {
    try {
      const { notifications } = await BuxinEV.api('/api/notifications');
      const list = document.getElementById('notifications-list');
      if (!list) return;
      list.innerHTML = notifications.length
        ? notifications.map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}">
            <strong>${n.title}</strong>
            <p>${n.message}</p>
            <small>${BuxinEV.formatDate(n.created_at)}</small>
          </div>
        `).join('')
        : '<p class="opacity-60">No notifications yet.</p>';
    } catch { /* silent */ }
  },

  async loadClasses() {
    try {
      const { classes } = await BuxinEV.api('/api/classes');
      const container = document.getElementById('class-links');
      if (!container) return;
      container.innerHTML = classes.length
        ? classes.map(c => `
          <div class="class-card glass">
            <h4>${c.title}</h4>
            <p class="text-sm">${BuxinEV.formatDate(c.scheduled_at)}</p>
            ${c.is_live ? '<span class="live-badge">● LIVE</span>' : ''}
            <div class="flex gap-2 mt-3 flex-wrap">
              ${c.meet_link ? `<a href="${c.meet_link}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Google Meet</a>` : ''}
              ${c.zoom_link ? `<a href="${c.zoom_link}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Zoom</a>` : ''}
            </div>
          </div>
        `).join('')
        : '<p class="opacity-60">No classes scheduled yet. Check back soon!</p>';
    } catch { /* silent */ }
  },

  async loadSchedules() {
    try {
      const { schedules } = await BuxinEV.api('/api/schedules/my');
      const el = document.getElementById('schedule-info');
      if (el && schedules.length) {
        el.innerHTML = schedules.map(s =>
          `<p>Preference ${s.preference_order}: <strong>${s.schedule?.label || '—'}</strong></p>`
        ).join('');
      }
    } catch { /* silent */ }
  },

  initSocket(userId) {
    if (typeof io === 'undefined') return;
    this.socket = io(BuxinEV.API_URL, { transports: ['websocket', 'polling'] });
    this.socket.emit('join_user', { user_id: userId });
    this.socket.on('notification', (data) => {
      BuxinEV.showToast(data.title, 'success');
      this.loadNotifications();
    });
  },

  startCountdown() {
    const el = document.getElementById('class-countdown');
    if (!el) return;
    const nextSunday = () => {
      const now = new Date();
      const d = new Date(now);
      d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
      d.setHours(14, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 7);
      return d;
    };
    const tick = () => {
      const diff = nextSunday() - new Date();
      if (diff < 3600000) {
        el.innerHTML = '<span class="soon-alert">🚀 Your class starts soon!</span>';
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        el.textContent = `${h}h ${m}m ${s}s until next Sunday class`;
      }
    };
    tick();
    setInterval(tick, 1000);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') Dashboard.init();
  if (document.body.dataset.page === 'waiting') WaitingPage.init();
});

const WaitingPage = {
  async init() {
    if (!Auth.requireAuth()) return;
    const user = await Auth.refreshUser();
    if (!user) return;
    if (user.status === 'active') {
      window.location.href = 'dashboard.html';
      return;
    }
    document.getElementById('waiting-name') && (document.getElementById('waiting-name').textContent = user.full_name);
    document.getElementById('waiting-class') && (document.getElementById('waiting-class').textContent =
      user.class_type === 'individual' ? 'Individual Mentorship' : 'Group Class');
    try {
      const { payments } = await Payments.getMyPayments();
      const p = payments[0];
      if (p) {
        document.getElementById('waiting-status') && (document.getElementById('waiting-status').textContent = p.status);
        const img = document.getElementById('waiting-receipt');
        if (img && p.receipt_url) {
          img.src = p.receipt_url;
          img.classList.remove('hidden');
          img.onerror = () => {
            img.alt = 'Receipt on file — open from email if image does not load';
          };
        }
      }
    } catch { /* silent */ }
  },
};

