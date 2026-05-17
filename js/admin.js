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
    await Courses.load();
    this.populateCourseFilters();
    await this.loadStats();
    await this.loadClassPeriodPanel();
    await this.loadStudents();
    await this.loadPayments();
    await this.loadAdminClasses();
    this.bindTabs();
    this.setupStudentModals();
    this.bindActions();
  },

  populateCourseFilters() {
    const filter = document.getElementById('filter-course');
    const list = Courses._list || Courses.FALLBACK;
    if (filter) {
      const current = filter.value;
      filter.innerHTML = '<option value="">All courses</option>'
        + list.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
      filter.value = current || '';
    }
    const editSel = document.getElementById('edit-selected_course');
    if (editSel) Courses.fillSelect(editSel);
  },

  syncEditCourseField() {
    const wrap = document.getElementById('edit-course-wrap');
    const isIndividual = document.getElementById('edit-class_type')?.value === 'individual';
    wrap?.classList.toggle('hidden', !isIndividual);
  },

  bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('main.container > section[id^="panel-"]').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.remove('hidden');
        if (tab.dataset.tab === 'panel-community') void this.loadCommunityPosts();
        if (tab.dataset.tab === 'panel-classes') void this.loadAdminClasses();
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
      if (body.class_type === 'individual') {
        body.selected_course = fd.get('selected_course') || '';
      }
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
    document.getElementById('filter-course')?.addEventListener('change', () => this.loadStudents());
    document.getElementById('edit-class_type')?.addEventListener('change', () => this.syncEditCourseField());

    document.getElementById('payment-filter')?.addEventListener('change', () => this.loadPayments());
    document.getElementById('payment-country-filter')?.addEventListener('change', () => this.loadPayments());
    document.getElementById('payment-class-filter')?.addEventListener('change', () => this.loadPayments());

    document.getElementById('start-class-period-btn')?.addEventListener('click', () => this.startClassPeriod());

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
        await this.loadAdminClasses();
      } catch (err) {
        BuxinEV.showToast(err.error || 'Failed', 'error');
      }
    });

    document.getElementById('announcement-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const content = [fd.get('title'), fd.get('message')].filter(Boolean).join('\n\n');
        const img = fd.get('image');
        if (img?.size) {
          const form = new FormData();
          form.append('content', content);
          form.append('image', img, img.name || 'photo.jpg');
          form.append('is_pinned', 'true');
          if (fd.get('meet_link')) form.append('meet_link', fd.get('meet_link'));
          if (fd.get('zoom_link')) form.append('zoom_link', fd.get('zoom_link'));
          await BuxinEV.apiMultipart('/api/community/announcements', form);
        } else {
          await BuxinEV.api('/api/community/announcements', {
            method: 'POST',
            body: JSON.stringify({
              content,
              meet_link: fd.get('meet_link') || undefined,
              zoom_link: fd.get('zoom_link') || undefined,
              is_pinned: true,
            }),
          });
        }
        BuxinEV.showToast('Announcement sent!', 'success');
        e.target.reset();
        await this.loadCommunityPosts();
      } catch (err) {
        BuxinEV.showToast(err.error || 'Failed', 'error');
      }
    });

    document.getElementById('admin-post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const content = (fd.get('content') || '').trim();
      const img = fd.get('image');
      const hasVideo = this.parseYouTubeId(content);
      if (!content && !img?.size && !hasVideo) {
        BuxinEV.showToast('Write a message, paste a YouTube link, or add a photo', 'error');
        return;
      }
      try {
        if (img?.size) {
          const form = new FormData();
          form.append('content', content);
          form.append('image', img, img.name || 'photo.jpg');
          if (fd.get('meet_link')) form.append('meet_link', fd.get('meet_link'));
          if (fd.get('zoom_link')) form.append('zoom_link', fd.get('zoom_link'));
          if (fd.get('is_pinned') === 'on') form.append('is_pinned', 'true');
          if (fd.get('is_announcement') === 'on') form.append('is_announcement', 'true');
          await BuxinEV.apiMultipart('/api/community/posts', form);
        } else {
          await BuxinEV.api('/api/community/posts', {
            method: 'POST',
            body: JSON.stringify({
              content,
              meet_link: fd.get('meet_link') || undefined,
              zoom_link: fd.get('zoom_link') || undefined,
              is_pinned: fd.get('is_pinned') === 'on',
              is_announcement: fd.get('is_announcement') === 'on',
            }),
          });
        }
        BuxinEV.showToast('Post published!', 'success');
        e.target.reset();
        await this.loadCommunityPosts();
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
        if (el && typeof val !== 'boolean' && key !== 'class_period_started_at') el.textContent = val;
      });
    } catch { /* silent */ }
  },

  async loadClassPeriodPanel() {
    const statusEl = document.getElementById('class-period-status-text');
    const waitingEl = document.getElementById('class-period-waiting-text');
    const btn = document.getElementById('start-class-period-btn');
    if (!statusEl || !btn) return;
    try {
      const data = await BuxinEV.api('/api/admin/class-period');
      if (data.class_period_started) {
        const when = data.class_period_started_at
          ? BuxinEV.formatDate(data.class_period_started_at)
          : '';
        statusEl.textContent = when
          ? `Class period is live since ${when}. Progress is counting (30 days group · 180 days individual).`
          : 'Class period is live. Progress is counting (30 days group · 180 days individual).';
        btn.disabled = true;
        btn.textContent = 'Class period started';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        if (waitingEl) waitingEl.classList.add('hidden');
      } else {
        statusEl.textContent = 'Registration is open. Progress bars have not started yet.';
        const n = data.students_waiting_start ?? 0;
        if (waitingEl) {
          waitingEl.textContent = n
            ? `${n} approved student${n === 1 ? '' : 's'} will begin at Day 1 when you press Start.`
            : 'Approve payments first, then press Start when classes begin.';
          waitingEl.classList.remove('hidden');
        }
        btn.disabled = false;
        btn.textContent = 'Start Day 1 for all classes';
      }
    } catch {
      statusEl.textContent = 'Could not load class period status.';
    }
  },

  async startClassPeriod() {
    const btn = document.getElementById('start-class-period-btn');
    if (!btn || btn.disabled) return;
    if (!confirm(
      'Start the class period for ALL active students now?\n\n'
      + 'Day 1 begins today. Group students run 30 days; individual students run 180 days (6 months) per payment.',
    )) return;
    btn.disabled = true;
    try {
      const res = await BuxinEV.api('/api/admin/class-period/start', { method: 'POST' });
      BuxinEV.showToast(res.message || 'Class period started', 'success');
      await this.loadClassPeriodPanel();
      await this.loadStats();
    } catch (err) {
      if (err.status === 409) {
        BuxinEV.showToast('Class period was already started', 'info');
        await this.loadClassPeriodPanel();
      } else {
        BuxinEV.showToast(err.error || 'Could not start class period', 'error');
        btn.disabled = false;
      }
    }
  },

  async loadStudents(search = '') {
    const country = document.getElementById('filter-country')?.value || '';
    const status = document.getElementById('filter-status')?.value || '';
    const classType = document.getElementById('filter-class')?.value || '';
    const courseId = document.getElementById('filter-course')?.value || '';
    const params = new URLSearchParams();
    if (search || document.getElementById('student-search')?.value) {
      params.set('search', search || document.getElementById('student-search').value);
    }
    if (country) params.set('country', country);
    if (status) params.set('status', status);
    if (classType) params.set('class_type', classType);
    if (courseId) params.set('selected_course', courseId);
    try {
      const { students } = await BuxinEV.api(`/api/admin/students?${params}`);
      const tbody = document.getElementById('students-table');
      if (!tbody) return;
      tbody.innerHTML = students.map(s => {
        const pic = s.profile_picture
          ? `<img src="${s.profile_picture}" class="receipt-thumb" alt="" style="border-radius:50%">`
          : '';
        return `<tr>
          <td data-label="Photo">${pic || '—'}</td>
          <td data-label="Name">${s.full_name}</td>
          <td data-label="Email">${s.email}</td>
          <td data-label="Country">${BuxinEV.formatUserCountry(s)}</td>
          <td data-label="Class">${this.classLabel(s.class_type)}</td>
          <td data-label="Course">${s.class_type === 'individual' ? (s.selected_course_name || '—') : '—'}</td>
          <td data-label="Status"><span class="status-badge status-${s.status}">${s.status}</span></td>
          <td data-label="Date">${BuxinEV.formatDate(s.created_at)}</td>
          <td data-label="Actions">
            <button type="button" class="btn btn-sm btn-secondary" onclick="Admin.openStudentView(${s.id})">View</button>
            <button type="button" class="btn btn-sm btn-primary" onclick="Admin.openStudentEdit(${s.id})">Edit</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="Admin.deleteStudent(${s.id})">Delete</button>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="9">No students found</td></tr>';
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
      const countryLabel = esc(BuxinEV.formatUserCountry(student));
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
          <div class="student-detail-row"><dt>Course</dt><dd>${student.class_type === 'individual' ? esc(student.selected_course_name || '—') : '—'}</dd></div>
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
      Courses.fillSelect(document.getElementById('edit-selected_course'), student.selected_course || '');
      this.syncEditCourseField();
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

  escape(text) {
    const d = document.createElement('div');
    d.textContent = text ?? '';
    return d.innerHTML;
  },

  async loadAdminClasses() {
    const el = document.getElementById('admin-classes-list');
    if (!el) return;
    try {
      const { classes } = await BuxinEV.api('/api/admin/classes');
      el.innerHTML = classes.length
        ? `<h4 class="mb-2">Scheduled classes</h4>${classes.map((c) => `
          <div class="admin-class-row" style="padding:0.75rem 0;border-bottom:1px solid var(--border)">
            <strong>${this.escape(c.title)}</strong>
            ${c.is_live ? ' <span class="live-badge">● LIVE</span>' : ''}
            <p class="text-sm opacity-70">${BuxinEV.formatDate(c.scheduled_at)} · ${c.class_type}</p>
            ${c.meet_link ? `<a href="${c.meet_link}" target="_blank" rel="noopener" class="text-sm">Meet</a> ` : ''}
            ${c.zoom_link ? `<a href="${c.zoom_link}" target="_blank" rel="noopener" class="text-sm">Zoom</a>` : ''}
            <button type="button" class="btn btn-sm btn-danger mt-2" onclick="Admin.deleteClass(${c.id})">Delete</button>
          </div>`).join('')}`
        : '<p class="opacity-70">No classes yet. Create one below.</p>';
    } catch {
      el.innerHTML = '<p class="opacity-70">Could not load classes.</p>';
    }
  },

  async deleteClass(id) {
    if (!confirm('Delete this class?')) return;
    try {
      await BuxinEV.api(`/api/admin/classes/${id}`, { method: 'DELETE' });
      BuxinEV.showToast('Class removed', 'success');
      await this.loadAdminClasses();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Delete failed', 'error');
    }
  },

  parseYouTubeId(text) {
    if (!text) return null;
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{11})/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]{11})/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([\w-]{11})/i,
      /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return m[1];
    }
    return null;
  },

  renderVideoEmbed(videoId) {
    if (!videoId) return '';
    const id = this.escape(videoId);
    return `<div class="post-video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`;
  },

  renderAdminPostBody(p) {
    const vid = p.youtube_video_id || this.parseYouTubeId(p.content);
    const raw = (p.content || '').trim();
    const isPlaceholder = raw === '📷' || raw === '🎬';
    let html = '';
    if (raw && !isPlaceholder) {
      html += `<p class="post-content">${this.escape(raw)}</p>`;
    }
    if (vid) html += this.renderVideoEmbed(vid);
    return html;
  },

  renderAdminPost(p) {
    return `
      <article class="post-card glass mb-3" data-admin-post="${p.id}">
        <p><strong>${this.escape(p.author_name)}</strong> · <small>${BuxinEV.formatDate(p.created_at)}</small></p>
        ${p.is_pinned ? '<span class="pin-badge">📌 Pinned</span> ' : ''}
        ${p.is_announcement ? '<span class="announce-badge">📢</span> ' : ''}
        ${this.renderAdminPostBody(p)}
        ${p.image_url ? `<img src="${p.image_url}" alt="" class="post-image" loading="lazy">` : ''}
        <p class="text-sm opacity-70">❤️ ${p.like_count || 0} · 💬 ${p.comment_count || 0}</p>
        <div class="flex gap-2 mt-2 flex-wrap">
          <button type="button" class="btn btn-sm btn-secondary" onclick="Admin.editPost(${p.id})">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="Admin.deletePost(${p.id})">Delete</button>
        </div>
      </article>`;
  },

  async loadCommunityPosts() {
    const feed = document.getElementById('admin-community-feed');
    if (!feed) return;
    feed.innerHTML = '<p class="opacity-70">Loading…</p>';
    try {
      const { posts } = await BuxinEV.api('/api/community/posts');
      feed.innerHTML = posts.length
        ? posts.map((p) => this.renderAdminPost(p)).join('')
        : '<p class="opacity-70">No posts yet.</p>';
    } catch {
      feed.innerHTML = '<p class="opacity-70">Could not load posts.</p>';
    }
  },

  async deletePost(id) {
    if (!confirm('Delete this post for everyone?')) return;
    try {
      await BuxinEV.api(`/api/community/posts/${id}`, { method: 'DELETE' });
      document.querySelector(`[data-admin-post="${id}"]`)?.remove();
      BuxinEV.showToast('Post deleted', 'success');
    } catch (err) {
      BuxinEV.showToast(err.error || 'Delete failed', 'error');
    }
  },

  async editPost(id) {
    const card = document.querySelector(`[data-admin-post="${id}"]`);
    const current = card?.querySelector('.post-content')?.textContent || '';
    const content = prompt('Edit post message:', current);
    if (content === null) return;
    try {
      await BuxinEV.api(`/api/community/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: content.trim() }),
      });
      BuxinEV.showToast('Post updated', 'success');
      await this.loadCommunityPosts();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Update failed', 'error');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'admin') Admin.init();
});
