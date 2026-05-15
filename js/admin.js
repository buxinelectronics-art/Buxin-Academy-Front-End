const Admin = {
  async init() {
    if (!Auth.requireAuth() || !Auth.requireAdmin()) return;
    await this.loadStats();
    await this.loadStudents();
    await this.loadPayments();
    this.bindTabs();
    this.bindActions();
  },

  bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('[data-panel]').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.remove('hidden');
      });
    });
  },

  bindActions() {
    document.getElementById('student-search')?.addEventListener('input', (e) => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.loadStudents(e.target.value), 400);
    });
    document.getElementById('filter-country')?.addEventListener('change', () => this.loadStudents());
    document.getElementById('filter-status')?.addEventListener('change', () => this.loadStudents());

    document.getElementById('create-class-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await BuxinEV.api('/api/admin/classes', {
          method: 'POST',
          body: JSON.stringify({
            title: fd.get('title'),
            class_type: fd.get('class_type'),
            meet_link: fd.get('meet_link'),
            zoom_link: fd.get('zoom_link'),
            scheduled_at: fd.get('scheduled_at'),
            is_live: fd.get('is_live') === 'on',
          }),
        });
        BuxinEV.showToast('Class created!', 'success');
        e.target.reset();
      } catch (err) {
        BuxinEV.showToast(err.error || 'Failed', 'error');
      }
    });

    document.getElementById('announcement-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await BuxinEV.api('/api/admin/announcements', {
          method: 'POST',
          body: JSON.stringify({ title: fd.get('title'), message: fd.get('message') }),
        });
        await BuxinEV.api('/api/community/announcements', {
          method: 'POST',
          body: JSON.stringify({
            content: fd.get('message'),
            meet_link: fd.get('meet_link'),
            zoom_link: fd.get('zoom_link'),
            is_pinned: true,
          }),
        });
        BuxinEV.showToast('Announcement sent!', 'success');
        e.target.reset();
      } catch (err) {
        BuxinEV.showToast(err.error || 'Failed', 'error');
      }
    });

    document.getElementById('schedule-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await BuxinEV.api('/api/schedules', {
          method: 'POST',
          body: JSON.stringify({
            day_of_week: fd.get('day'),
            time_slot: fd.get('time'),
          }),
        });
        BuxinEV.showToast('Schedule slot added!', 'success');
        e.target.reset();
      } catch (err) {
        BuxinEV.showToast(err.error || 'Failed', 'error');
      }
    });
  },

  async loadStats() {
    try {
      const stats = await BuxinEV.api('/api/admin/stats');
      Object.entries(stats).forEach(([key, val]) => {
        const el = document.getElementById(`stat-${key.replace(/_/g, '-')}`);
        if (el) el.textContent = val;
      });
    } catch { /* silent */ }
  },

  async loadStudents(search = '') {
    const country = document.getElementById('filter-country')?.value || '';
    const status = document.getElementById('filter-status')?.value || '';
    const params = new URLSearchParams();
    if (search || document.getElementById('student-search')?.value) {
      params.set('search', search || document.getElementById('student-search').value);
    }
    if (country) params.set('country', country);
    if (status) params.set('status', status);
    try {
      const { students } = await BuxinEV.api(`/api/admin/students?${params}`);
      const tbody = document.getElementById('students-table');
      if (!tbody) return;
      tbody.innerHTML = students.map(s => {
        const c = BuxinEV.COUNTRIES[s.country_code];
        return `<tr>
          <td data-label="Name">${s.full_name}</td>
          <td data-label="Email">${s.email}</td>
          <td data-label="Country">${c ? c.flag + ' ' + c.name : s.country_code}</td>
          <td data-label="Class">${s.class_type || '—'}</td>
          <td data-label="Status"><span class="status-badge status-${s.status}">${s.status}</span></td>
          <td data-label="Date">${BuxinEV.formatDate(s.created_at)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No students found</td></tr>';
    } catch { /* silent */ }
  },

  async loadPayments() {
    const status = document.getElementById('payment-filter')?.value || '';
    const country = document.getElementById('payment-country-filter')?.value || '';
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (country) params.set('country', country);
    try {
      const { payments } = await BuxinEV.api(`/api/payments/admin/all?${params}`);
      const tbody = document.getElementById('payments-table');
      if (!tbody) return;
      tbody.innerHTML = payments.map(p => `
        <tr>
          <td data-label="Student">${p.student_name}</td>
          <td data-label="Email">${p.email}</td>
          <td data-label="Country">${p.country_code}</td>
          <td data-label="Method">${p.payment_method || '—'}</td>
          <td data-label="Receipt">${p.receipt_url
            ? `<a href="${p.receipt_url}" target="_blank"><img src="${p.receipt_url}" class="receipt-thumb" alt="Receipt" loading="lazy"></a>`
            : '—'}</td>
          <td data-label="Status"><span class="status-badge status-${p.status}">${p.status}</span></td>
          <td data-label="Date">${BuxinEV.formatDate(p.created_at)}</td>
          <td data-label="Actions">
            ${p.status === 'pending' ? `
              <button class="btn btn-sm btn-primary" onclick="Admin.approve(${p.id})">Approve</button>
              <button class="btn btn-sm btn-danger" onclick="Admin.reject(${p.id})">Reject</button>
            ` : '—'}
          </td>
        </tr>
      `).join('') || '<tr><td colspan="8">No payments</td></tr>';
    } catch { /* silent */ }
  },

  async approve(id) {
    try {
      await BuxinEV.api(`/api/payments/admin/${id}/approve`, { method: 'POST' });
      BuxinEV.showToast('Payment approved!', 'success');
      await this.loadPayments();
      await this.loadStats();
      await this.loadStudents();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Failed', 'error');
    }
  },

  async reject(id) {
    const reason = prompt('Rejection reason (optional):') || 'Payment could not be verified.';
    try {
      await BuxinEV.api(`/api/payments/admin/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      BuxinEV.showToast('Payment rejected', 'info');
      await this.loadPayments();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Failed', 'error');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'admin') Admin.init();
  document.getElementById('payment-filter')?.addEventListener('change', () => Admin.loadPayments());
  document.getElementById('payment-country-filter')?.addEventListener('change', () => Admin.loadPayments());
});

