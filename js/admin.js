const Admin = {
  classLabel(type) {
    if (type === 'group') return '<span class="class-badge group-badge">Group</span>';
    if (type === 'individual') return '<span class="class-badge individual-badge">Individual</span>';
    return '—';
  },

  receiptCell(url) {
    if (!url) return '<span class="opacity-60">No receipt</span>';
    return `<a href="${url}" target="_blank" rel="noopener" class="receipt-link">
      <img src="${url}" class="receipt-thumb" alt="Receipt" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
      <span style="display:none">View receipt</span>
    </a>`;
  },

  async init() {
    if (!Auth.requireAuth() || !Auth.requireAdmin()) return;
    await this.loadStats();
    await this.loadStudents();
    await this.loadPayments();
    this.bindTabs();
    this.setupStudentModals();
    this.bindActions();
  },

  bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('main.container > section[id^="panel-"]').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.remove('hidden');
      });
    });
  },

  closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  },

  setupStudentModals() {
    ['student-view-modal', 'student-edit-modal'].forEach((modalId) => {
      const el = document.getElementById(modalId);
      el?.addEventListener('click', (e) => {
        if (e.target === el) this.closeModal(modalId);
      });
    });
    document.getElementById('student-view-close')?.addEventListener('click', () => this.closeModal('student-view-modal'));
    document.getElementById('student-edit-close')?.addEventListener('click', () => this.closeModal('student-edit-modal'));

    document.getElementById('student-edit-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = fd.get('id');
      const body = {
        full_name: fd.get('full_name'),
        phone: fd.get('phone') || '',
        city: fd.get('city') || '',
        country_code: fd.get('country_code'),
        class_type: fd.get('class_type'),
        experience_level: fd.get('experience_level') || '',
        learning_goals: fd.get('learning_goals') || '',
        status: fd.get('status'),
      };
      const np = fd.get('new_password');
      if (np && String(np).trim()) body.new_password = String(np).trim();
      try {
        await BuxinEV.api(`/api/admin/students/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        BuxinEV.showToast('Student updated', 'success');
        this.closeModal('student-edit-modal');
        await this.loadStudents();
        await this.loadStats();
      } catch (err) {
        BuxinEV.showToast(err.error || 'Update failed', 'error');
      }
    });
  },

  bindActions() {
    document.getElementById('student-search')?.addEventListener('input', (e) => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.loadStudents(e.target.value), 400);
    });
    document.getElementById('filter-country')?.addEventListener('change', () => this.loadStudents());
    document.getElementById('filter-status')?.addEventListener('change', () => this.loadStudents());
    document.getElementById('filter-class')?.addEventListener('change', () => this.loadStudents());

    document.getElementById('payment-filter')?.addEventListener('change', () => this.loadPayments());
    document.getElementById('payment-country-filter')?.addEventListener('change', () => this.loadPayments());
    document.getElementById('payment-class-filter')?.addEventListener('change', () => this.loadPayments());

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
          body: JSON.stringify({ day_of_week: fd.get('day'), time_slot: fd.get('time') }),
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
    const classType = document.getElementById('filter-class')?.value || '';
    const params = new URLSearchParams();
    if (search || document.getElementById('student-search')?.value) {
      params.set('search', search || document.getElementById('student-search').value);
    }
    if (country) params.set('country', country);
    if (status) params.set('status', status);
    if (classType) params.set('class_type', classType);
    try {
      const { students } = await BuxinEV.api(`/api/admin/students?${params}`);
      const tbody = document.getElementById('students-table');
      if (!tbody) return;
      tbody.innerHTML = students.map(s => {
        const c = BuxinEV.COUNTRIES[s.country_code];
        const pic = s.profile_picture
          ? `<img src="${s.profile_picture}" class="receipt-thumb" alt="" style="border-radius:50%">`
          : '';
        return `<tr>
          <td data-label="Photo">${pic || '—'}</td>
          <td data-label="Name">${s.full_name}</td>
          <td data-label="Email">${s.email}</td>
          <td data-label="Country">${c ? c.flag + ' ' + c.name : s.country_code}</td>
          <td data-label="Class">${this.classLabel(s.class_type)}</td>
          <td data-label="Status"><span class="status-badge status-${s.status}">${s.status}</span></td>
          <td data-label="Date">${BuxinEV.formatDate(s.created_at)}</td>
          <td data-label="Actions">
            <button type="button" class="btn btn-sm btn-secondary" onclick="Admin.openStudentView(${s.id})">View</button>
            <button type="button" class="btn btn-sm btn-primary" onclick="Admin.openStudentEdit(${s.id})">Edit</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="Admin.deleteStudent(${s.id})">Delete</button>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="8">No students found</td></tr>';
    } catch { /* silent */ }
  },

  async loadPayments() {
    const status = document.getElementById('payment-filter')?.value || '';
    const country = document.getElementById('payment-country-filter')?.value || '';
    const classType = document.getElementById('payment-class-filter')?.value || '';
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (country) params.set('country', country);
    if (classType) params.set('class_type', classType);
    try {
      const { payments } = await BuxinEV.api(`/api/payments/admin/all?${params}`);
      const tbody = document.getElementById('payments-table');
      if (!tbody) return;
      tbody.innerHTML = payments.map(p => `
        <tr>
          <td data-label="Student">${p.student_name}</td>
          <td data-label="Email">${p.email}</td>
          <td data-label="Class">${this.classLabel(p.class_type)}</td>
          <td data-label="Country">${p.country_code}</td>
          <td data-label="Method">${p.payment_method || '—'}</td>
          <td data-label="Receipt">${this.receiptCell(p.receipt_url)}</td>
          <td data-label="Status"><span class="status-badge status-${p.status}">${p.status}</span></td>
          <td data-label="Date">${BuxinEV.formatDate(p.created_at)}</td>
          <td data-label="Actions">${(() => {
            if (p.status === 'pending' && p.receipt_url) {
              return `
              <button class="btn btn-sm btn-primary" onclick="Admin.approve(${p.id})">Approve</button>
              <button class="btn btn-sm btn-danger" onclick="Admin.reject(${p.id})">Reject</button>`;
            }
            if (p.status === 'pending') {
              return '<span class="opacity-60">No receipt</span>';
            }
            if (p.status === 'rejected' && p.user_id) {
              return `<button type="button" class="btn btn-sm btn-danger" onclick="Admin.deleteStudent(${p.user_id}, { reloadPayments: true })">Delete student</button>`;
            }
            return '—';
          })()}</td>
        </tr>
      `).join('') || '<tr><td colspan="9">No payments</td></tr>';
    } catch { /* silent */ }
  },

  async openStudentView(id) {
    const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    try {
      const { student } = await BuxinEV.api(`/api/admin/students/${id}`);
      const c = BuxinEV.COUNTRIES[student.country_code];
      const countryLabel = esc(c ? `${c.flag} ${c.name}` : student.country_code);
      const pic = student.profile_picture
        ? `<p class="mb-3"><img src="${esc(student.profile_picture)}" alt="" class="receipt-thumb" style="border-radius:50%"></p>`
        : '';
      document.getElementById('student-view-body').innerHTML = `
        ${pic}
        <dl>
          <div class="student-detail-row"><dt>Name</dt><dd>${esc(student.full_name)}</dd></div>
          <div class="student-detail-row"><dt>Email</dt><dd>${esc(student.email)}</dd></div>
          <div class="student-detail-row"><dt>Phone</dt><dd>${esc(student.phone) || '—'}</dd></div>
          <div class="student-detail-row"><dt>City</dt><dd>${esc(student.city) || '—'}</dd></div>
          <div class="student-detail-row"><dt>Country</dt><dd>${countryLabel}</dd></div>
          <div class="student-detail-row"><dt>Class</dt><dd>${this.classLabel(student.class_type)}</dd></div>
          <div class="student-detail-row"><dt>Experience</dt><dd>${esc(student.experience_level) || '—'}</dd></div>
          <div class="student-detail-row"><dt>Goals</dt><dd>${esc(student.learning_goals) || '—'}</dd></div>
          <div class="student-detail-row"><dt>Status</dt><dd><span class="status-badge status-${student.status}">${esc(student.status)}</span></dd></div>
          <div class="student-detail-row"><dt>Joined</dt><dd>${esc(BuxinEV.formatDate(student.created_at))}</dd></div>
        </dl>`;
      document.getElementById('student-view-modal').classList.remove('hidden');
    } catch (err) {
      BuxinEV.showToast(err.error || 'Failed to load student', 'error');
    }
  },

  async openStudentEdit(id) {
    try {
      const { student } = await BuxinEV.api(`/api/admin/students/${id}`);
      document.getElementById('edit-student-id').value = student.id;
      document.getElementById('edit-email').value = student.email || '';
      document.getElementById('edit-full_name').value = student.full_name || '';
      document.getElementById('edit-phone').value = student.phone || '';
      document.getElementById('edit-city').value = student.city || '';
      document.getElementById('edit-country_code').value = student.country_code || '';
      document.getElementById('edit-class_type').value = student.class_type || 'group';
      document.getElementById('edit-experience_level').value = student.experience_level || '';
      document.getElementById('edit-learning_goals').value = student.learning_goals || '';
      document.getElementById('edit-status').value = student.status || 'pending';
      document.getElementById('edit-new_password').value = '';
      document.getElementById('student-edit-modal').classList.remove('hidden');
    } catch (err) {
      BuxinEV.showToast(err.error || 'Failed to load student', 'error');
    }
  },

  async deleteStudent(userId, opts = {}) {
    if (!confirm('Remove this student and all related data (payments, schedules, notifications, posts)? They can register again with the same email and a new password.')) return;
    try {
      await BuxinEV.api(`/api/admin/students/${userId}`, { method: 'DELETE' });
      BuxinEV.showToast('Student removed', 'success');
      if (opts.reloadPayments) await this.loadPayments();
      await this.loadStudents();
      await this.loadStats();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Delete failed', 'error');
    }
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
      await this.loadStudents();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Failed', 'error');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'admin') Admin.init();
});
