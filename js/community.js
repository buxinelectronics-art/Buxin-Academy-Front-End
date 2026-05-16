const Community = {
  socket: null,
  _posting: false,
  _postingSince: 0,
  _previewUrl: null,
  _compressedBlob: null,
  _compressing: false,
  _commenting: new Set(),
  _liking: new Set(),
  _lastLocalPostAt: 0,

  canUse(user) {
    return user && (user.role === 'admin' || user.status === 'active');
  },

  async init() {
    if (!Auth.requireAuth()) return;

    const cached = Auth.getUser();
    if (!this.canUse(cached)) {
      const user = await Auth.refreshUserFresh() || cached;
      if (!this.canUse(user)) {
        window.location.replace(await Auth.resolvePendingRedirect(user || cached));
        return;
      }
    }

    BuxinEV.initStudentNav('community');

    const feed = document.getElementById('community-feed');
    const cachedPosts = BuxinEV.cacheGet('community_posts');
    if (cachedPosts?.length && feed) {
      feed.innerHTML = cachedPosts.map((p) => this.renderPost(p, Auth.getUser())).join('');
    }

    BuxinEV._startWakeInBackground();
    this.bindEvents();
    await this.loadPosts();
    this.initSocket();
  },

  initSocket() {
    if (typeof io === 'undefined') return;
    this.socket = io(BuxinEV.API_URL, { transports: ['websocket', 'polling'] });
    this.socket.emit('join', { room: 'community' });
    this.socket.on('new_post', (payload) => {
      if (this._posting) return;
      if (Date.now() - this._lastLocalPostAt < 4000) return;
      if (payload?.id && document.querySelector(`[data-post-id="${payload.id}"]`)) return;
      void this.loadPosts();
    });
    this.socket.on('new_comment', (data) => {
      if (data?.post_id) this.appendCommentToPost(data.post_id, data.comment);
    });
    this.socket.on('post_deleted', (data) => {
      if (data?.id) document.querySelector(`[data-post-id="${data.id}"]`)?.remove();
    });
    this.socket.on('post_updated', () => {
      if (!this._posting) void this.loadPosts();
    });
  },

  bindEvents() {
    const form = document.getElementById('post-form');
    form?.addEventListener('submit', (e) => {
      void this.submitPost(e);
    });

    document.getElementById('post-image')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      this.setImagePreview(file);
      this._compressedBlob = null;
      if (file) void this.prepareImageInBackground(file);
    });

    const feed = document.getElementById('community-feed');
    feed?.addEventListener('click', (e) => {
      const likeBtn = e.target.closest('[data-like]');
      if (likeBtn) {
        void this.toggleLike(likeBtn.dataset.like, likeBtn);
        return;
      }
      const commentBtn = e.target.closest('[data-comment-btn]');
      if (commentBtn) {
        void this.submitComment(commentBtn.dataset.commentBtn);
        return;
      }
      const delBtn = e.target.closest('[data-delete-post]');
      if (delBtn) void this.deletePost(delBtn.dataset.deletePost);
    });

    feed?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target.closest('[data-comment-input]');
      if (!input) return;
      e.preventDefault();
      void this.submitComment(input.dataset.commentInput);
    });
  },

  setImagePreview(file) {
    const preview = document.getElementById('post-image-preview');
    if (!preview) return;
    if (this._previewUrl) {
      URL.revokeObjectURL(this._previewUrl);
      this._previewUrl = null;
    }
    if (file) {
      this._previewUrl = URL.createObjectURL(file);
      preview.src = this._previewUrl;
      preview.classList.remove('hidden');
    } else {
      preview.removeAttribute('src');
      preview.classList.add('hidden');
    }
  },

  setUploadStatus(text) {
    const el = document.getElementById('post-upload-status');
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  },

  async prepareImageInBackground(file) {
    if (this._compressing) return;
    this._compressing = true;
    try {
      this._compressedBlob = await BuxinEV.compressImageToBlob(file);
      this.setUploadStatus('Photo ready to post');
    } catch {
      this._compressedBlob = null;
    } finally {
      this._compressing = false;
    }
  },

  clearPostForm() {
    const form = document.getElementById('post-form');
    form?.reset();
    const imgInput = document.getElementById('post-image');
    if (imgInput) imgInput.value = '';
    this.setImagePreview(null);
    this._compressedBlob = null;
    this.setUploadStatus('');
    form?.classList.remove('is-submitting');
  },

  prependPendingPost({ pendingId, content, localImageUrl }) {
    const user = Auth.getUser();
    const feed = document.getElementById('community-feed');
    if (!feed) return;
    feed.querySelector('.empty-state')?.remove();
    const html = `
      <article class="post-card glass post-pending" data-pending-id="${pendingId}">
        <p class="pending-label">Uploading your post…</p>
        <header class="post-header">
          <div class="avatar-sm">${user?.full_name?.[0] || '?'}</div>
          <div><strong>${this.escape(user?.full_name || 'You')}</strong><small>Just now</small></div>
        </header>
        ${content ? `<p class="post-content">${this.escape(content)}</p>` : ''}
        ${localImageUrl ? `<img src="${localImageUrl}" alt="" class="post-image">` : ''}
      </article>`;
    feed.insertAdjacentHTML('afterbegin', html);
  },

  removePendingPost(pendingId) {
    document.querySelector(`[data-pending-id="${pendingId}"]`)?.remove();
  },

  _resetPostingIfStuck() {
    if (this._posting && Date.now() - this._postingSince > 90000) {
      this._posting = false;
    }
  },

  async submitPost(e) {
    e.preventDefault();
    this._resetPostingIfStuck();
    if (this._posting) {
      BuxinEV.showToast('Still sending the last post — wait a moment', 'info');
      return;
    }

    const form = e.currentTarget;
    const contentEl = document.getElementById('post-content');
    const content = contentEl?.value.trim() || '';
    const file = document.getElementById('post-image')?.files?.[0];
    if (!content && !file) {
      BuxinEV.showToast('Write a message or add a photo', 'error');
      return;
    }

    const btn = document.getElementById('post-submit-btn') || form.querySelector('[type=submit]');
    const prevLabel = btn?.textContent || 'Post';
    const pendingId = `pending-${Date.now()}`;
    let localPreviewUrl = null;

    this._posting = true;
    this._postingSince = Date.now();
    if (btn) {
      btn.disabled = true;
      btn.textContent = file ? 'Preparing…' : 'Posting…';
    }
    form.classList.add('is-submitting');

    try {
      let result;
      if (file) {
        this.setUploadStatus('Preparing photo (smaller size for faster upload)…');
        let blob = this._compressedBlob;
        if (!blob) {
          blob = await BuxinEV.compressImageToBlob(file);
          this._compressedBlob = blob;
        }
        localPreviewUrl = URL.createObjectURL(blob);
        this.prependPendingPost({ pendingId, content, localImageUrl: localPreviewUrl });
        this.setUploadStatus('Uploading to server…');
        if (btn) btn.textContent = 'Uploading…';

        const fd = new FormData();
        fd.append('content', content);
        fd.append('image', blob, 'photo.jpg');
        result = await BuxinEV.apiMultipart('/api/community/posts', fd);
      } else {
        this.setUploadStatus('Sending…');
        result = await BuxinEV.api('/api/community/posts', {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
      }

      this.removePendingPost(pendingId);
      this.clearPostForm();
      if (result?.post) {
        this._lastLocalPostAt = Date.now();
        this.prependPost(result.post);
      }
      BuxinEV.showToast('Post shared!', 'success');
    } catch (err) {
      this.removePendingPost(pendingId);
      BuxinEV.showToast(err.error || 'Failed to post', 'error');
      this.setUploadStatus('');
    } finally {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      this._posting = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
      form.classList.remove('is-submitting');
    }
  },

  prependPost(post) {
    const feed = document.getElementById('community-feed');
    if (!feed) return;
    feed.querySelector('.empty-state')?.remove();
    feed.querySelector('.loading-pulse')?.remove();
    feed.insertAdjacentHTML('afterbegin', this.renderPost(post, Auth.getUser()));
    const cached = BuxinEV.cacheGet('community_posts') || [];
    BuxinEV.cacheSet('community_posts', [post, ...cached.filter((p) => p.id !== post.id)]);
  },

  appendCommentToPost(postId, comment) {
    const list = document.getElementById(`comments-${postId}`);
    if (!list || !comment) return;
    if (list.querySelector(`[data-comment-id="${comment.id}"]`)) return;
    list.insertAdjacentHTML('beforeend', this.renderComment(comment));
    const card = document.querySelector(`[data-post-id="${postId}"]`);
    const countEl = card?.querySelector('[data-comment-count]');
    if (countEl) {
      const n = parseInt(countEl.textContent, 10) || 0;
      countEl.textContent = String(n + 1);
    }
  },

  async loadPosts() {
    const feed = document.getElementById('community-feed');
    if (!feed || this._posting) return;
    const hasPosts = feed.querySelector('.post-card');
    if (!hasPosts) {
      feed.innerHTML = '<p class="loading-pulse opacity-70">Loading…</p>';
    }
    try {
      const { posts } = await BuxinEV.api('/api/community/posts');
      BuxinEV.cacheSet('community_posts', posts);
      const user = Auth.getUser();
      feed.innerHTML = posts.length
        ? posts.map((p) => this.renderPost(p, user)).join('')
        : '<div class="empty-state glass"><p>🤖 Be the first to share!</p></div>';
    } catch (err) {
      if (!feed.querySelector('.post-card')) {
        feed.innerHTML = `<p class="error-text">${err.error || 'Could not load feed.'}</p>`;
      }
    }
  },

  renderComment(c) {
    return `<div class="comment-item" data-comment-id="${c.id}"><strong>${this.escape(c.author_name)}</strong> <small>${BuxinEV.formatDate(c.created_at)}</small><p>${this.escape(c.content)}</p></div>`;
  },

  renderPost(p, user) {
    const isAdmin = user?.role === 'admin';
    const canDelete = isAdmin || p.user_id === user?.id;
    const comments = (p.comments || []).map((c) => this.renderComment(c)).join('');
    const adminBadge = p.author_role === 'admin' ? ' <span class="admin-badge">Admin</span>' : '';

    return `
      <article class="post-card glass ${p.is_pinned ? 'pinned' : ''}" data-post-id="${p.id}">
        ${p.is_pinned ? '<span class="pin-badge">📌 Pinned</span>' : ''}
        ${p.is_announcement ? '<span class="announce-badge">📢 Announcement</span>' : ''}
        <header class="post-header">
          <div class="avatar-sm">${p.author_name?.[0] || '?'}</div>
          <div>
            <strong>${this.escape(p.author_name)}</strong>${adminBadge}
            <small>${BuxinEV.formatDate(p.created_at)}</small>
          </div>
        </header>
        ${p.content && p.content !== '📷' ? `<p class="post-content">${this.escape(p.content)}</p>` : ''}
        ${p.image_url ? `<img src="${p.image_url}" alt="Post" class="post-image" loading="lazy">` : ''}
        ${p.meet_link || p.zoom_link ? `
          <div class="flex gap-2 mt-2 flex-wrap">
            ${p.meet_link ? `<a href="${p.meet_link}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Join Meet</a>` : ''}
            ${p.zoom_link ? `<a href="${p.zoom_link}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">Join Zoom</a>` : ''}
          </div>` : ''}
        <footer class="post-footer">
          <button type="button" data-like="${p.id}" class="like-btn ${p.liked ? 'liked' : ''}">❤️ <span data-like-count="${p.id}">${p.like_count || 0}</span></button>
          <span>💬 <span data-comment-count="${p.id}">${p.comment_count || 0}</span></span>
          ${canDelete ? `<button type="button" class="btn btn-sm btn-danger" data-delete-post="${p.id}">Delete</button>` : ''}
        </footer>
        <div class="comments-list" id="comments-${p.id}">${comments}</div>
        <div class="comment-section">
          <input type="text" data-comment-input="${p.id}" placeholder="Write a comment…" class="input" autocomplete="off">
          <button type="button" data-comment-btn="${p.id}" class="btn btn-sm btn-primary">Post</button>
        </div>
      </article>
    `;
  },

  escape(text) {
    const d = document.createElement('div');
    d.textContent = text ?? '';
    return d.innerHTML;
  },

  async toggleLike(postId, btn) {
    const id = String(postId);
    if (this._liking.has(id)) return;
    this._liking.add(id);
    if (btn) btn.disabled = true;
    try {
      const res = await BuxinEV.api(`/api/community/posts/${postId}/like`, { method: 'POST' });
      const countEl = document.querySelector(`[data-like-count="${postId}"]`);
      if (countEl) countEl.textContent = String(res.like_count ?? 0);
      if (btn) btn.classList.toggle('liked', !!res.liked);
    } catch (err) {
      BuxinEV.showToast(err.error || 'Could not like', 'error');
    } finally {
      this._liking.delete(id);
      if (btn) btn.disabled = false;
    }
  },

  async submitComment(postId) {
    const id = String(postId);
    if (this._commenting.has(id)) return;

    const input = document.querySelector(`[data-comment-input="${postId}"]`);
    const content = input?.value.trim();
    if (!content) {
      BuxinEV.showToast('Write a comment first', 'error');
      input?.focus();
      return;
    }
    const btn = document.querySelector(`[data-comment-btn="${postId}"]`);
    const prevLabel = btn?.textContent;

    this._commenting.add(id);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '…';
    }

    try {
      const { comment } = await BuxinEV.api(`/api/community/posts/${postId}/comment`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      input.value = '';
      this.appendCommentToPost(postId, comment);
    } catch (err) {
      BuxinEV.showToast(err.error || 'Comment failed', 'error');
    } finally {
      this._commenting.delete(id);
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || 'Post';
      }
    }
  },

  async deletePost(postId) {
    if (!confirm('Delete this post?')) return;
    try {
      await BuxinEV.api(`/api/community/posts/${postId}`, { method: 'DELETE' });
      document.querySelector(`[data-post-id="${postId}"]`)?.remove();
      const cached = (BuxinEV.cacheGet('community_posts') || []).filter((p) => p.id !== Number(postId));
      BuxinEV.cacheSet('community_posts', cached);
      BuxinEV.showToast('Post deleted', 'success');
    } catch (err) {
      BuxinEV.showToast(err.error || 'Delete failed', 'error');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'community') Community.init();
});
