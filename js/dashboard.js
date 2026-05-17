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

    const user = (await Auth.refreshUserFresh()) || cached;
    if (!user) return;

    this.renderProfile(user);

    if (user.role === 'admin') {
      window.location.href = 'admin-dashboard.html';
      return;
    }

    if (Auth.needsRenewal(user)) {
      window.location.replace(await Auth.resolvePendingRedirect(user));
      return;
    }

    if (!Auth.hasPaidAccess(user)) {
      window.location.replace(await Auth.resolvePendingRedirect(user));
      return;
    }

    if (user.class_type === 'individual') {
      document.getElementById('schedule-info')?.classList.remove('hidden');
    }

    const cacheOk = BuxinEV._recentlyConnected()
      && (BuxinEV.cacheFresh('payments') || BuxinEV.cacheFresh('notifications') || BuxinEV.cacheFresh('classes'));
    void this.refreshAllSections(user, { useCache: cacheOk });

    void Auth.refreshUser({ allowStale: true }).then((fresh) => {
      if (fresh) this.renderProfile(fresh);
    });

    setTimeout(() => this.initSocket(user.id), 800);
    this.startCountdown();
  },

  refreshAllSections(user, { useCache = false } = {}) {
    if (useCache && BuxinEV._recentlyConnected()) return;
    void Promise.all([
        this.loadPayments(),
        this.loadNotifications(),
        this.loadClasses(),
        user.class_type === 'individual' ? this.loadSchedules() : Promise.resolve(),
    ]);
  },

  hydrateFromCache() {

    const payments = BuxinEV.cacheGet('payments');

    if (payments?.length) this.renderPaymentCard(payments[0]);



    const notifications = BuxinEV.cacheGet('notifications');

    if (notifications) this.renderNotifications(notifications);



    const classes = BuxinEV.cacheGet('classes');
    if (classes) this.renderClasses(classes);

    const schedules = BuxinEV.cacheGet('student_schedules');
    if (schedules?.length) {
      const el = document.getElementById('schedule-info');
      const list = document.getElementById('schedule-info-list');
      if (el) el.classList.remove('hidden');
      if (list) {
        list.innerHTML = schedules.map((s) => {
          const sch = s.schedule;
          const line = sch
            ? `<strong>${sch.day_of_week}</strong> · ${sch.time_slot} <span class="opacity-70">(IST)</span>`
            : '—';
          return `<p class="mb-2">Session ${s.preference_order}: ${line}</p>`;
        }).join('');
      }
    }
  },



  renderProfile(user) {
    if (!user) return;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text != null && text !== '' ? text : '—';
    };

    setText('user-name', user.full_name);
    setText('user-email', user.email);
    setText('user-phone', user.phone);
    setText('user-city', user.city);
    setText('user-experience', user.experience_level);
    setText('user-goals', user.learning_goals);

    const statusEl = document.getElementById('user-status');
    if (statusEl) {
      statusEl.textContent = user.status || 'pending';
      statusEl.className = `status-badge status-${user.status || 'pending'}`;
    }

    const classLabel = user.class_type === 'individual'
      ? 'Individual Mentorship (6 months)'
      : user.class_type === 'group'
        ? 'Group Class (Sundays)'
        : '—';
    setText('user-class', classLabel);

    const courseRow = document.getElementById('user-course-row');
    if (user.class_type === 'individual') {
      courseRow?.classList.remove('hidden');
      setText('user-course', user.selected_course_name);
    } else {
      courseRow?.classList.add('hidden');
    }

    const avatar = document.getElementById('user-avatar');
    if (avatar) {
      if (user.profile_picture) {
        avatar.src = user.profile_picture;
        avatar.classList.remove('hidden');
      } else {
        avatar.classList.add('hidden');
        avatar.removeAttribute('src');
      }
    }

    setText('user-country', BuxinEV.formatUserCountry(user));

    this.renderSubscription(user);

  },

  renderSubscription(user) {
    const card = document.getElementById('subscription-card');
    if (!card || !Auth.hasPaidAccess(user)) {
      card?.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    const progressWrap = card.querySelector('.subscription-progress');
    const awaitingEl = document.getElementById('subscription-awaiting-msg');
    const renew = document.getElementById('subscription-renew-link');

    const isIndividual = user.class_type === 'individual';
    const totalDays = user.subscription_days_total || (isIndividual ? 180 : 30);
    const titleEl = document.getElementById('subscription-card-title');
    if (titleEl) {
      titleEl.textContent = isIndividual ? '6-month course access' : 'Monthly subscription';
    }

    if (user.awaiting_class_start) {
      card.classList.remove('subscription-card--warning');
      const dayLabel = document.getElementById('subscription-day-label');
      if (dayLabel) dayLabel.textContent = 'Class period not started yet';
      if (progressWrap) progressWrap.classList.add('hidden');
      if (awaitingEl) {
        awaitingEl.textContent = isIndividual
          ? `You have full access to the community now. Day 1 of ${totalDays} starts when your instructor begins the class period.`
          : 'You have full access to the community now. Day 1 of 30 starts when your instructor begins the class period.';
        awaitingEl.classList.remove('hidden');
      }
      const detail = document.getElementById('subscription-status');
      if (detail) detail.textContent = 'Live classes will show “coming very soon” until then.';
      document.getElementById('subscription-expiry-warning')?.classList.add('hidden');
      renew?.classList.add('hidden');
      return;
    }

    if (awaitingEl) awaitingEl.classList.add('hidden');
    if (progressWrap) progressWrap.classList.remove('hidden');

    if (!Auth.isSubscriptionActive(user)) {
      card.classList.add('hidden');
      return;
    }

    const total = user.subscription_days_total || (user.class_type === 'individual' ? 180 : 30);
    const day = user.subscription_day || 1;
    const daysLeft = user.subscription_days_left ?? 0;
    const exp = user.subscription_expires_at ? new Date(user.subscription_expires_at) : null;
    const expiringSoon = user.subscription_expiring_soon || daysLeft <= 7;

    card.classList.remove('hidden');
    card.classList.toggle('subscription-card--warning', expiringSoon);

    const dayLabel = document.getElementById('subscription-day-label');
    if (dayLabel) dayLabel.textContent = `Day ${day} of ${total}`;

    const fill = document.getElementById('subscription-progress-fill');
    const bar = card.querySelector('.subscription-progress');
    const pct = Math.min(100, Math.max(0, (day / total) * 100));
    if (fill) fill.style.width = `${pct}%`;
    if (bar) {
      bar.setAttribute('aria-valuenow', String(day));
      bar.setAttribute('aria-valuetext', `Day ${day} of ${total}`);
    }

    const detail = document.getElementById('subscription-status');
    if (detail) {
      const expText = exp ? exp.toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
      const periodLabel = user.class_type === 'individual' ? '6-month' : '30-day';
      detail.textContent = expText
        ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · access ends ${expText}. Pay or use a new coupon before then for the next period.`
        : `Your ${periodLabel} access is active.`;
    }

    const warn = document.getElementById('subscription-expiry-warning');
    if (warn) {
      if (expiringSoon && daysLeft > 0) {
        const renewLabel = user.class_type === 'individual' ? '6-month course' : 'monthly subscription';
        warn.textContent = `Your ${renewLabel} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew on the Payment page (pay or use a new coupon) before access stops.`;
        warn.classList.remove('hidden');
      } else {
        warn.textContent = '';
        warn.classList.add('hidden');
      }
    }

    const renew = document.getElementById('subscription-renew-link');
    if (renew) {
      const t = user.class_type === 'individual' ? 'individual' : 'group';
      renew.href = `payment.html?type=${t}&renew=1`;
      renew.classList.toggle('hidden', !expiringSoon);
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



  renderClassesComingSoon() {
    const container = document.getElementById('class-links');
    if (!container) return;
    container.innerHTML = `
      <div class="class-card glass class-card--soon">
        <span class="live-badge live-badge--soon">Starting soon</span>
        <h4>Live class coming very soon</h4>
        <p class="text-sm opacity-80">You are registered and approved. Your instructor will start the class period soon — then Day 1 of 30 and join links will appear here.</p>
      </div>`;
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
    const user = Auth.getUser();
    if (user?.awaiting_class_start) {
      this.renderClassesComingSoon();
      return;
    }

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
      const list = document.getElementById('schedule-info-list');

      BuxinEV.cacheSet('student_schedules', schedules);
      if (el && schedules.length) {
        el.classList.remove('hidden');
        const html = schedules.map((s) => {
          const sch = s.schedule;
          const line = sch
            ? `<strong>${sch.day_of_week}</strong> · ${sch.time_slot} <span class="opacity-70">(IST)</span>`
            : '—';
          return `<p class="mb-2">Session ${s.preference_order}: ${line}</p>`;
        }).join('');
        if (list) list.innerHTML = html;
        else el.innerHTML = `<h3>Your class times (IST)</h3>${html}`;
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

