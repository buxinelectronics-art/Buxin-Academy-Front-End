const Dashboard = {

  socket: null,



  async init() {

    if (!Auth.requireAuth()) return;

    BuxinEV.requireCountry();
    BuxinEV.initStudentNav('dashboard');



    const cached = Auth.getUser();

    if (cached) {

      this.renderProfile(cached);

      this.hydrateFromCache();

    }



    BuxinEV._startWakeInBackground();



    const user = await Auth.refreshUserFresh() || cached;

    if (!user) return;

    if (user.role === 'admin') {

      window.location.href = 'admin-dashboard.html';

      return;

    }

    if (!Auth.isSubscriptionActive(user)) {

      window.location.replace(await Auth.resolvePendingRedirect(user));

      return;

    }



    this.renderProfile(user);

    if (user.class_type === 'individual') {

      document.getElementById('schedule-info')?.classList.remove('hidden');

    }



    void Promise.all([

      this.loadPayments(),

      this.loadNotifications(),

      this.loadClasses(),

      user.class_type === 'individual' ? this.loadSchedules() : Promise.resolve(),

    ]);



    this.initSocket(user.id);

    this.startCountdown();

  },



  hydrateFromCache() {

    const payments = BuxinEV.cacheGet('payments');

    if (payments?.length) this.renderPaymentCard(payments[0]);



    const notifications = BuxinEV.cacheGet('notifications');

    if (notifications) this.renderNotifications(notifications);



    const classes = BuxinEV.cacheGet('classes');

    if (classes) this.renderClasses(classes);

  },



  renderProfile(user) {

    const set = (id, text) => {

      const el = document.getElementById(id);

      if (el && text != null && text !== '') el.textContent = text;

    };

    set('user-name', user.full_name);

    set('user-email', user.email);

    set('user-phone', user.phone || '—');

    set('user-city', user.city || '—');

    set('user-experience', user.experience_level || '—');

    set('user-goals', user.learning_goals || '—');



    const statusEl = document.getElementById('user-status');

    if (statusEl) {

      statusEl.textContent = user.status;

      statusEl.className = `status-badge status-${user.status}`;

    }

    set('user-class', user.class_type === 'individual'

      ? 'Individual Mentorship'

      : 'Group Class (Sundays)');



    const avatar = document.getElementById('user-avatar');

    if (avatar && user.profile_picture) {

      avatar.src = user.profile_picture;

      avatar.classList.remove('hidden');

    }

    const country = BuxinEV.COUNTRIES[user.country_code];

    set('user-country', country ? `${country.flag} ${country.name}` : user.country_code);

    const subEl = document.getElementById('subscription-status');
    if (subEl && user.subscription_expires_at) {
      const exp = new Date(user.subscription_expires_at);
      const daysLeft = Math.ceil((exp - Date.now()) / 86400000);
      if (daysLeft > 0) {
        subEl.textContent = `Monthly access until ${exp.toLocaleDateString()} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`;
        subEl.classList.remove('hidden', 'subscription-warning');
        if (daysLeft <= 7) subEl.classList.add('subscription-warning');
      } else {
        subEl.textContent = 'Subscription ended — renew on the Payment page.';
        subEl.classList.add('subscription-warning');
        subEl.classList.remove('hidden');
      }
    }

  },



  renderPaymentCard(latest) {

    const el = document.getElementById('payment-status-card');

    if (!el || !latest) return;

    el.innerHTML = `

      <p class="status-badge status-${latest.status}">${latest.status}</p>

      <p>${latest.currency} ${Number(latest.amount_local || 0).toLocaleString()}</p>

      <p class="text-sm opacity-70">${latest.payment_method || '—'}</p>

      ${latest.receipt_url ? `<img src="${latest.receipt_url}" alt="Receipt" class="receipt-thumb mt-2" loading="lazy">` : ''}

    `;

  },



  async loadPayments() {

    try {

      const { payments } = await Payments.getMyPayments();

      BuxinEV.cacheSet('payments', payments);

      if (payments?.[0]) this.renderPaymentCard(payments[0]);

    } catch {

      /* keep cache */

    }

  },



  renderNotifications(notifications) {

    const list = document.getElementById('notifications-list');

    if (!list) return;

    list.innerHTML = notifications.length

      ? notifications.map((n) => `

          <div class="notification-item ${n.is_read ? '' : 'unread'}">

            <strong>${n.title}</strong>

            <p>${n.message}</p>

            <small>${BuxinEV.formatDate(n.created_at)}</small>

          </div>

        `).join('')

      : '<p class="opacity-60">No notifications yet.</p>';

  },



  async loadNotifications() {

    try {

      const { notifications } = await BuxinEV.api('/api/notifications');

      BuxinEV.cacheSet('notifications', notifications);

      this.renderNotifications(notifications);

    } catch {

      /* keep cache */

    }

  },



  renderClasses(classes) {

    const container = document.getElementById('class-links');

    if (!container) return;

    container.innerHTML = classes.length

      ? classes.map((c) => `

          <div class="class-card glass">

            <h4>${c.title}</h4>

            <p class="text-sm">${BuxinEV.formatDate(c.scheduled_at)}</p>

            ${c.is_live ? '<span class="live-badge">● LIVE</span>' : ''}

            <div class="class-join-actions mt-3">
              ${c.meet_link ? `<a href="${c.meet_link}" target="_blank" rel="noopener" class="btn btn-primary btn-block">Join Google Meet</a>` : ''}
              ${c.zoom_link ? `<a href="${c.zoom_link}" target="_blank" rel="noopener" class="btn btn-secondary btn-block mt-2">Join Zoom</a>` : ''}
              ${!c.meet_link && !c.zoom_link ? '<p class="text-sm opacity-60">Admin will add links soon.</p>' : ''}
            </div>

          </div>

        `).join('')

      : '<p class="opacity-60">No classes scheduled yet. Check back soon!</p>';

  },



  async loadClasses() {

    try {

      const { classes } = await BuxinEV.api('/api/classes');

      BuxinEV.cacheSet('classes', classes);

      this.renderClasses(classes);

    } catch {

      /* keep cache */

    }

  },



  async loadSchedules() {

    try {

      const { schedules } = await BuxinEV.api('/api/schedules/my');

      const el = document.getElementById('schedule-info');

      if (el && schedules.length) {

        el.innerHTML = schedules.map((s) =>

          `<p>Preference ${s.preference_order}: <strong>${s.schedule?.label || '—'}</strong></p>`

        ).join('');

      }

    } catch { /* silent */ }

  },



  initSocket(userId) {

    if (typeof io === 'undefined') return;

    this.socket = io(BuxinEV.API_URL, { transports: ['websocket', 'polling'] });

    this.socket.emit('join_user', { user_id: userId });

    this.socket.on('notification', async (data) => {

      BuxinEV.showToast(data.title || 'Update', 'success');

      if (data?.user_status === 'active' || data?.status === 'active') {

        const user = await Auth.refreshUserFresh();

        if (user) Auth.saveSession(localStorage.getItem('buxinev_token'), user);

      }

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



    const cached = Auth.getUser();

    if (cached) {

      document.getElementById('waiting-name') && (document.getElementById('waiting-name').textContent = cached.full_name);

      document.getElementById('waiting-class') && (document.getElementById('waiting-class').textContent =

        cached.class_type === 'individual' ? 'Individual Mentorship' : 'Group Class');

    }



    BuxinEV._startWakeInBackground();

    Auth.startApprovalWatcher();



    const user = await Auth.refreshUserFresh() || cached;

    if (!user) return;

    if (Auth.isSubscriptionActive(user)) {

      Auth.onApproved(user);

      return;

    }



    await Auth.updateNavLinks(user);

    document.getElementById('waiting-name') && (document.getElementById('waiting-name').textContent = user.full_name);

    document.getElementById('waiting-class') && (document.getElementById('waiting-class').textContent =

      user.class_type === 'individual' ? 'Individual Mentorship' : 'Group Class');



    const cachedPay = BuxinEV.cacheGet('payments');

    if (cachedPay?.[0]) this.showPayment(cachedPay[0]);



    try {

      const { payments } = await Payments.getMyPayments();

      BuxinEV.cacheSet('payments', payments);

      if (payments[0]) this.showPayment(payments[0]);

    } catch { /* silent */ }

  },



  showPayment(p) {

    document.getElementById('waiting-status') && (document.getElementById('waiting-status').textContent = p.status);

    const img = document.getElementById('waiting-receipt');

    if (img && p.receipt_url) {

      img.src = p.receipt_url;

      img.classList.remove('hidden');

      img.onerror = () => {

        img.alt = 'Receipt on file';

      };

    }

  },

};



window.addEventListener('pagehide', () => Auth.stopApprovalWatcher());

