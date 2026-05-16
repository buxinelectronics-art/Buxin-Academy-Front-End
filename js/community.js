const Community = {
  socket: null,
  _eventsBound: false,
  _feedLoadGen: 0,
  _feedLoadAbort: null,
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

    void BuxinEV._startWakeInBackground();
    this.bindEvents();
    this.initSocket();
    void this.loadPosts();
  },

  initSocket() {
    if (typeof io === 'undefined') return;
    if (this.socket) return;
    this.socket = io(BuxinEV.API_URL, { transports: ['websocket', 'polling'] });
    this.socket.emit('join', { room: 'community' });
    this.socket.on('new_post', (post) => this.onSocketNewPost(post));
    this.socket.on('new_comment', (data) => {
      if (data?.post_id) this.appendCommentToPost(data.post_id, data.comment);
    });
    this.socket.on('post_deleted', (data) => {
      if (data?.id) document.querySelector(`[data-post-id="${data.id}"]`)?.remove();
    });
    this.socket.on('post_updated', (post) => {
      if (post?.id) this.onSocketNewPost(post);
    });
  },

  onSocketNewPost(post) {
    if (!post?.id) return;
    if (document.querySelector(`[data-post-id="${post.id}"]`)) return;
    if (Date.now() - this._lastLocalPostAt < 30000) {
      this.prependPost(post);
      return;
    }
    this.prependPost(post);
  },

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

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

  cancelFeedLoad() {
    this._feedLoadGen += 1;
    this._feedLoadAbort?.abort();
    this._feedLoadAbort = null;
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

  releasePostForm(form, btn, prevLabel) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || 'Post';
    }
    form?.classList.remove('is-submitting');
    this.setUploadStatus('');
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
    feed.insertAdjacentHTML('afterbegin', `
      <article class="post-card glass post-pending" data-pending-id="${pendingId}">
        <p class="pending-label">Uploading your post…</p>
        <header class="post-header">
          <div class="avatar-sm">${user?.full_name?.[0] || '?'}</div>
          <div><strong>${this.escape(user?.full_name || 'You')}</strong> <small>Just now</small></div>
        </header>
        ${content ? `<p class="post-content">${this.escape(content)}</p>` : ''}
        ${localImageUrl ? `<img src="${localImageUrl}" alt="" class="post-image">` : ''}
      </article>`);
  },

  removePendingPost(pendingId) {
    document.querySelector(`[data-pending-id="${pendingId}"]`)?.remove();
  },

  async submitPost(e) {
    e.preventDefault();
    this.cancelFeedLoad();

    const form = e.currentTarget;
    const btn = document.getElementById('post-submit-btn') || form.querySelector('[type=submit]');
    const contentEl = document.getElementById('post-content');
    const content = contentEl?.value.trim() || '';
    const file = document.getElementById('post-image')?.files?.[0];
    if (!content && !file) {
      BuxinEV.showToast('Write a message or add a photo', 'error');
      return;
    }

    const prevLabel = btn?.textContent || 'Post';
    const pendingId = `pending-${Date.now()}`;
    let localPreviewUrl = null;

    if (btn) {
      btn.disabled = true;
      btn.textContent = file ? 'Preparing…' : 'Posting…';
    }
    form.classList.add('is-submitting');

    if (!file) {
      contentEl.value = '';
      this.releasePostForm(form, btn, prevLabel);
    }

    try {
      let result;
      if (file) {
        this.setUploadStatus('Preparing photo…');
        let blob = this._compressedBlob;
        if (!blob) {
          blob = await BuxinEV.compressImageToBlob(file);
          this._compressedBlob = blob;
        }
        localPreviewUrl = URL.createObjectURL(blob);
        this.prependPendingPost({ pendingId, content, localImageUrl: localPreviewUrl });
        this.setUploadStatus('Uploading…');
        if (btn) btn.textContent = 'Uploading…';

        const fd = new FormData();
        fd.append('content', content);
        fd.append('image', blob, 'photo.jpg');
        result = await BuxinEV.apiMultipart('/api/community/posts', fd);
      } else {
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
      if (!file && content) contentEl.value = content;
      BuxinEV.showToast(err.error || 'Failed to post', 'error');
    } finally {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      this.releasePostForm(form, btn, prevLabel);
    }
  },

  prependPost(post) {
    const feed = document.getElementById('community-feed');
    if (!feed) return;
    feed.querySelector('.empty-state')?.remove();
    feed.querySelector('.loading-pulse')?.remove();
    if (document.querySelector(`[data-post-id="${post.id}"]`)) return;
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
    if (!feed) return;

    this._feedLoadAbort?.abort();
    const controller = new AbortController();
    this._feedLoadAbort = controller;
    const gen = ++this._feedLoadGen;

    const hasPosts = feed.querySelector('.post-card');
    if (!hasPosts) {
      feed.innerHTML = '<p class="loading-pulse opacity-70">Loading…</p>';
    }

    try {
      const { posts } = await BuxinEV.api('/api/community/posts', { signal: controller.signal });
      if (gen !== this._feedLoadGen) return;
      BuxinEV.cacheSet('community_posts', posts);
      const user = Auth.getUser();
      feed.innerHTML = posts.length
        ? posts.map((p) => this.renderPost(p, user)).join('')
        : '<div class="empty-state glass"><p>🤖 Be the first to share!</p></div>';
    } catch (err) {
      if (err?.aborted || err?.name === 'AbortError') return;
      if (gen !== this._feedLoadGen) return;
      if (!feed.querySelector('.post-card')) {
        feed.innerHTML = `<p class="error-text">${err.error || 'Could not load feed.'}</p>`;
      }
    } finally {
      if (this._feedLoadAbort === controller) this._feedLoadAbort = null;
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
    const prevLabel = btn?.textContent || 'Post';

    input.value = '';
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
      this.appendCommentToPost(postId, comment);
    } catch (err) {
      input.value = content;
      BuxinEV.showToast(err.error || 'Comment failed', 'error');
    } finally {
      this._commenting.delete(id);
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    }
  },

  async deletePost(postId) {
    if (!confirm('Delete this post?')) return;
    this.cancelFeedLoad();
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
