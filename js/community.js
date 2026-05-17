const Community = {
  socket: null,
  _eventsBound: false,
  _feedLoadGen: 0,
  _feedLoadAbort: null,
  _previewUrls: [],
  MAX_POST_IMAGES: 5,
  _commenting: new Set(),
  _liking: new Set(),
  _lastLocalPostAt: 0,

  getPostImages(p) {
    if (p?.image_urls?.length) return p.image_urls;
    if (p?.image_url) return [p.image_url];
    return [];
  },

  renderPostImages(p, syncing = false) {
    const urls = this.getPostImages(p);
    if (!urls.length) return '';
    const cells = urls.map((url) => `
      <div class="post-image-cell">
        <img src="${url}" alt="" class="post-image" loading="lazy">
        ${syncing ? '<span class="media-spinner" aria-label="Saving"></span>' : ''}
      </div>`).join('');
    return `<div class="post-images-grid">${cells}</div>`;
  },

  buildOptimisticPost({ id, content, imageUrls, youtubeId }) {
    const user = Auth.getUser();
    const urls = imageUrls || [];
    return {
      id,
      _optimistic: true,
      user_id: user?.id,
      author_name: user?.full_name || 'You',
      author_role: user?.role || 'student',
      content: content || (urls.length ? '📷' : '') || (youtubeId ? '🎬' : ''),
      image_url: urls[0] || null,
      image_urls: urls,
      youtube_video_id: youtubeId || null,
      like_count: 0,
      liked: false,
      comment_count: 0,
      comments: [],
      created_at: new Date().toISOString(),
      is_pinned: false,
      is_announcement: false,
    };
  },

  patchPostInCache(postId, patch) {
    const cached = BuxinEV.cacheGet('community_posts') || [];
    const idx = cached.findIndex((p) => String(p.id) === String(postId));
    if (idx < 0) return;
    cached[idx] = { ...cached[idx], ...patch };
    BuxinEV.cacheSet('community_posts', cached);
  },

  removePostFromCache(postId) {
    const cached = (BuxinEV.cacheGet('community_posts') || []).filter(
      (p) => String(p.id) !== String(postId),
    );
    BuxinEV.cacheSet('community_posts', cached);
  },

  canUse(user) {
    return user && (user.role === 'admin' || Auth.hasPaidAccess(user));
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

  linkifyContent(text) {
    const escaped = this.escape(text);
    return escaped.replace(
      /(https?:\/\/[^\s<]+)/gi,
      (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
  },

  renderPostBody(p) {
    const vid = p.youtube_video_id || this.parseYouTubeId(p.content);
    const raw = (p.content || '').trim();
    const isPlaceholder = raw === '📷' || raw === '🎬';
    let html = '';
    if (raw && !isPlaceholder) {
      html += `<p class="post-content">${this.linkifyContent(raw)}</p>`;
    }
    if (vid) html += this.renderVideoEmbed(vid);
    return html;
  },

  hydrateFeedFromCache() {
    const feed = document.getElementById('community-feed');
    const cachedPosts = BuxinEV.cacheGet('community_posts');
    const user = Auth.getUser();
    if (feed && cachedPosts?.length) {
      feed.innerHTML = cachedPosts.map((p) => this.renderPost(p, user)).join('');
    }
  },

  async init() {
    if (!Auth.requireAuth()) return;
    this.hydrateFeedFromCache();
    BuxinEV.initStudentNav('community');

    const cached = Auth.getUser();
    if (cached && this.canUse(cached) && !Auth.needsRenewal(cached)) {
      void Auth.refreshUserInBackground();
    } else {
      const user = await Auth.refreshUserFresh() || cached;
      if (!this.canUse(user) || Auth.needsRenewal(user)) {
        window.location.replace(await Auth.resolvePendingRedirect(user || cached));
        return;
      }
    }

    this.bindEvents();
    void this.loadPosts({ silent: BuxinEV.cacheFresh('community_posts') });
    setTimeout(() => this.initSocket(), 800);
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
      if (post?.id) this.replacePost(post);
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
      this.submitPost(e);
    });

    document.getElementById('post-image')?.addEventListener('change', (e) => {
      this.setImagesPreview(e.target.files);
    });

    document.getElementById('post-content')?.addEventListener('input', (e) => {
      this.setVideoPreview(this.parseYouTubeId(e.target.value));
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

  revokePreviewUrls() {
    this._previewUrls.forEach((u) => URL.revokeObjectURL(u));
    this._previewUrls = [];
  },

  setImagesPreview(fileList) {
    const wrap = document.getElementById('post-images-preview');
    if (!wrap) return;
    this.revokePreviewUrls();
    const files = [...(fileList || [])].filter((f) => f && BuxinEV.isImageFile(f)).slice(0, this.MAX_POST_IMAGES);
    if (!files.length) {
      wrap.innerHTML = '';
      wrap.classList.add('hidden');
      wrap.setAttribute('aria-hidden', 'true');
      return;
    }
    if ((fileList?.length || 0) > this.MAX_POST_IMAGES) {
      BuxinEV.showToast(`Only the first ${this.MAX_POST_IMAGES} photos are used`, 'info');
    }
    this._previewUrls = files.map((f) => URL.createObjectURL(f));
    wrap.className = 'post-images-preview post-images-grid';
    wrap.innerHTML = this._previewUrls.map((url) => `
      <div class="post-image-cell post-image-cell--preview">
        <img src="${url}" alt="" class="post-image">
      </div>`).join('');
    wrap.classList.remove('hidden');
    wrap.removeAttribute('aria-hidden');
  },

  setVideoPreview(videoId) {
    const el = document.getElementById('post-video-preview');
    if (!el) return;
    if (videoId) {
      el.innerHTML = this.renderVideoEmbed(videoId);
      el.classList.remove('hidden');
      el.removeAttribute('aria-hidden');
    } else {
      el.innerHTML = '';
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
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

  clearPostForm() {
    const form = document.getElementById('post-form');
    form?.reset();
    const imgInput = document.getElementById('post-image');
    if (imgInput) imgInput.value = '';
    this.revokePreviewUrls();
    const wrap = document.getElementById('post-images-preview');
    if (wrap) {
      wrap.innerHTML = '';
      wrap.classList.add('hidden');
    }
    this.setVideoPreview(null);
    this.setUploadStatus('');
    form?.classList.remove('is-submitting');
  },

  replaceOptimisticPost(pendingId, realPost) {
    const user = Auth.getUser();
    const el = document.querySelector(`[data-post-id="${pendingId}"]`);
    if (el) {
      el.outerHTML = this.renderPost(realPost, user);
    } else {
      this.prependPost(realPost);
    }
    const cached = BuxinEV.cacheGet('community_posts') || [];
    BuxinEV.cacheSet(
      'community_posts',
      [realPost, ...cached.filter((p) => String(p.id) !== String(pendingId) && p.id !== realPost.id)],
    );
  },

  removeOptimisticPost(pendingId) {
    document.querySelector(`[data-post-id="${pendingId}"]`)?.remove();
    this.removePostFromCache(pendingId);
  },

  submitPost(e) {
    e.preventDefault();
    this.cancelFeedLoad();

    const contentEl = document.getElementById('post-content');
    const content = contentEl?.value.trim() || '';
    const input = document.getElementById('post-image');
    const files = [...(input?.files || [])].filter((f) => BuxinEV.isImageFile(f)).slice(0, this.MAX_POST_IMAGES);
    const youtubeId = this.parseYouTubeId(content);
    if (!content && !files.length && !youtubeId) {
      BuxinEV.showToast('Write a message, paste a YouTube link, or add photos', 'error');
      return;
    }

    const pendingId = `pending-${Date.now()}`;
    const localPreviewUrls = files.map((f) => URL.createObjectURL(f));
    const savedContent = content;
    const savedFiles = files;

    const optimistic = this.buildOptimisticPost({
      id: pendingId,
      content,
      imageUrls: localPreviewUrls,
      youtubeId,
    });
    this._lastLocalPostAt = Date.now();
    this.prependPost(optimistic);
    this.clearPostForm();

    void (async () => {
      try {
        let result;
        if (savedFiles.length) {
          const fd = new FormData();
          fd.append('content', savedContent);
          for (let i = 0; i < savedFiles.length; i++) {
            const blob = await BuxinEV.compressImageToBlob(savedFiles[i]);
            fd.append('images', blob, `photo-${i}.jpg`);
          }
          result = await BuxinEV.apiMultipart('/api/community/posts', fd);
        } else {
          result = await BuxinEV.api('/api/community/posts', {
            method: 'POST',
            body: JSON.stringify({ content: savedContent }),
          });
        }
        if (result?.post) {
          this.replaceOptimisticPost(pendingId, result.post);
        } else {
          this.removeOptimisticPost(pendingId);
        }
      } catch (err) {
        this.removeOptimisticPost(pendingId);
        BuxinEV.showToast(err.error || 'Post did not save — refresh and try again', 'error');
      } finally {
        localPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
      }
    })();
  },

  replacePost(post) {
    const user = Auth.getUser();
    const html = this.renderPost(post, user);
    const existing = document.querySelector(`[data-post-id="${post.id}"]`);
    if (existing) {
      existing.outerHTML = html;
    } else {
      this.prependPost(post);
      return;
    }
    const cached = BuxinEV.cacheGet('community_posts') || [];
    BuxinEV.cacheSet('community_posts', [post, ...cached.filter((p) => p.id !== post.id)]);
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

  async loadPosts({ silent = false } = {}) {
    const feed = document.getElementById('community-feed');
    if (!feed) return;

    this._feedLoadAbort?.abort();
    const controller = new AbortController();
    this._feedLoadAbort = controller;
    const gen = ++this._feedLoadGen;

    const hasPosts = feed.querySelector('.post-card');
    if (!silent && !hasPosts) {
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
    const pending = c._pending || String(c.id).startsWith('comment-pending-');
    return `<div class="comment-item${pending ? ' comment-pending' : ''}" data-comment-id="${c.id}">
      <div class="comment-item__head">
        <strong>${this.escape(c.author_name)}</strong>
        <small>${pending ? 'Just now' : BuxinEV.formatDate(c.created_at)}</small>
        ${pending ? '<span class="media-spinner media-spinner--sm" aria-label="Saving"></span>' : ''}
      </div>
      <p>${this.escape(c.content)}</p>
    </div>`;
  },

  renderPost(p, user) {
    const isAdmin = user?.role === 'admin';
    const canDelete = isAdmin || p.user_id === user?.id;
    const comments = (p.comments || []).map((c) => this.renderComment(c)).join('');
    const adminBadge = p.author_role === 'admin' ? ' <span class="admin-badge">Admin</span>' : '';
    const syncing = !!p._optimistic;
    const timeLabel = syncing ? 'Just now' : BuxinEV.formatDate(p.created_at);

    return `
      <article class="post-card glass ${p.is_pinned ? 'pinned' : ''}${syncing ? ' post-syncing' : ''}" data-post-id="${p.id}">
        ${p.is_pinned ? '<span class="pin-badge">📌 Pinned</span>' : ''}
        ${p.is_announcement ? '<span class="announce-badge">📢 Announcement</span>' : ''}
        <header class="post-header">
          <div class="avatar-sm">${p.author_name?.[0] || '?'}</div>
          <div>
            <strong>${this.escape(p.author_name)}</strong>${adminBadge}
            <small>${timeLabel}</small>
          </div>
        </header>
        ${this.renderPostBody(p)}
        ${this.renderPostImages(p, syncing)}
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

  toggleLike(postId, btn) {
    const id = String(postId);
    if (String(postId).startsWith('pending-')) return;

    const countEl = document.querySelector(`[data-like-count="${postId}"]`);
    const wasLiked = btn?.classList.contains('liked');
    const prevCount = parseInt(countEl?.textContent || '0', 10) || 0;
    const nextLiked = !wasLiked;
    const nextCount = Math.max(0, prevCount + (wasLiked ? -1 : 1));

    if (btn) btn.classList.toggle('liked', nextLiked);
    if (countEl) countEl.textContent = String(nextCount);
    this.patchPostInCache(postId, { liked: nextLiked, like_count: nextCount });

    if (this._liking.has(id)) return;
    this._liking.add(id);

    void (async () => {
      try {
        const res = await BuxinEV.api(`/api/community/posts/${postId}/like`, { method: 'POST' });
        if (countEl) countEl.textContent = String(res.like_count ?? 0);
        if (btn) btn.classList.toggle('liked', !!res.liked);
        this.patchPostInCache(postId, { liked: !!res.liked, like_count: res.like_count ?? 0 });
      } catch (err) {
        if (btn) btn.classList.toggle('liked', wasLiked);
        if (countEl) countEl.textContent = String(prevCount);
        this.patchPostInCache(postId, { liked: wasLiked, like_count: prevCount });
        BuxinEV.showToast(err.error || 'Could not save like', 'error');
      } finally {
        this._liking.delete(id);
      }
    })();
  },

  submitComment(postId) {
    if (String(postId).startsWith('pending-')) return;

    const input = document.querySelector(`[data-comment-input="${postId}"]`);
    const content = input?.value.trim();
    if (!content) {
      BuxinEV.showToast('Write a comment first', 'error');
      input?.focus();
      return;
    }

    const user = Auth.getUser();
    const tempId = `comment-pending-${Date.now()}`;
    input.value = '';
    this.appendCommentToPost(postId, {
      id: tempId,
      _pending: true,
      author_name: user?.full_name || 'You',
      content,
      created_at: new Date().toISOString(),
    });

    void (async () => {
      try {
        const { comment } = await BuxinEV.api(`/api/community/posts/${postId}/comment`, {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
        document.getElementById(`comments-${postId}`)
          ?.querySelector(`[data-comment-id="${tempId}"]`)?.remove();
        this.appendCommentToPost(postId, comment);
      } catch (err) {
        document.getElementById(`comments-${postId}`)
          ?.querySelector(`[data-comment-id="${tempId}"]`)?.remove();
        const card = document.querySelector(`[data-post-id="${postId}"]`);
        const countEl = card?.querySelector('[data-comment-count]');
        if (countEl) {
          const n = Math.max(0, (parseInt(countEl.textContent, 10) || 1) - 1);
          countEl.textContent = String(n);
        }
        input.value = content;
        BuxinEV.showToast(err.error || 'Comment did not save', 'error');
      }
    })();
  },

  async deletePost(postId) {
    if (!confirm('Delete this post?')) return;
    this.cancelFeedLoad();
    if (String(postId).startsWith('pending-')) {
      this.removeOptimisticPost(postId);
      return;
    }
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
