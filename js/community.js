const Community = {
  socket: null,

  async init() {
    if (!Auth.requireAuth()) return;
    const user = await Auth.refreshUser();
    if (user.status !== 'active') {
      window.location.href = 'waiting-approval.html';
      return;
    }
    await this.loadPosts();
    this.bindEvents();
    this.initSocket();
  },

  initSocket() {
    if (typeof io === 'undefined') return;
    this.socket = io(BuxinEV.API_URL, { transports: ['websocket', 'polling'] });
    this.socket.emit('join', { room: 'community' });
    this.socket.on('new_post', () => this.loadPosts());
    this.socket.on('new_comment', () => this.loadPosts());
  },

  bindEvents() {
    document.getElementById('post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = document.getElementById('post-content').value.trim();
      if (!content) return;
      try {
        await BuxinEV.api('/api/community/posts', {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
        document.getElementById('post-content').value = '';
        BuxinEV.showToast('Post shared!', 'success');
        await this.loadPosts();
      } catch (err) {
        BuxinEV.showToast(err.error || 'Failed to post', 'error');
      }
    });
  },

  async loadPosts() {
    const feed = document.getElementById('community-feed');
    if (!feed) return;
    feed.innerHTML = '<p class="loading-pulse">Loading community...</p>';
    try {
      const { posts } = await BuxinEV.api('/api/community/posts');
      const user = Auth.getUser();
      feed.innerHTML = posts.length ? posts.map(p => this.renderPost(p, user)).join('') : `
        <div class="empty-state glass">
          <p>🤖 Be the first to share your robotics project!</p>
        </div>`;
      feed.querySelectorAll('[data-like]').forEach(btn => {
        btn.addEventListener('click', () => this.toggleLike(btn.dataset.like));
      });
      feed.querySelectorAll('[data-comment-btn]').forEach(btn => {
        btn.addEventListener('click', () => this.submitComment(btn.dataset.commentBtn));
      });
    } catch (err) {
      feed.innerHTML = `<p class="error-text">${err.error || 'Could not load feed. Check connection.'}</p>`;
    }
  },

  renderPost(p, user) {
    return `
      <article class="post-card glass ${p.is_pinned ? 'pinned' : ''}">
        ${p.is_pinned ? '<span class="pin-badge">📌 Pinned</span>' : ''}
        ${p.is_announcement ? '<span class="announce-badge">📢 Announcement</span>' : ''}
        <header class="post-header">
          <div class="avatar-sm">${p.author_name?.[0] || '?'}</div>
          <div>
            <strong>${p.author_name}</strong>
            <small>${BuxinEV.formatDate(p.created_at)}</small>
          </div>
        </header>
        <p class="post-content">${this.escape(p.content)}</p>
        ${p.image_url ? `<img src="${p.image_url}" alt="Project" class="post-image" loading="lazy">` : ''}
        ${p.meet_link || p.zoom_link ? `
          <div class="flex gap-2 mt-2">
            ${p.meet_link ? `<a href="${p.meet_link}" target="_blank" class="btn btn-sm btn-primary">Join Meet</a>` : ''}
            ${p.zoom_link ? `<a href="${p.zoom_link}" target="_blank" class="btn btn-sm btn-secondary">Join Zoom</a>` : ''}
          </div>` : ''}
        <footer class="post-footer">
          <button data-like="${p.id}" class="like-btn ${p.liked ? 'liked' : ''}">❤️ ${p.like_count}</button>
          <span>💬 ${p.comment_count}</span>
        </footer>
        <div class="comment-section">
          <input type="text" id="comment-${p.id}" placeholder="Write a comment..." class="input">
          <button data-comment-btn="${p.id}" class="btn btn-sm">Reply</button>
        </div>
      </article>
    `;
  },

  escape(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  },

  async toggleLike(postId) {
    try {
      await BuxinEV.api(`/api/community/posts/${postId}/like`, { method: 'POST' });
      await this.loadPosts();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Error', 'error');
    }
  },

  async submitComment(postId) {
    const input = document.getElementById(`comment-${postId}`);
    const content = input?.value.trim();
    if (!content) return;
    try {
      await BuxinEV.api(`/api/community/posts/${postId}/comment`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      input.value = '';
      await this.loadPosts();
    } catch (err) {
      BuxinEV.showToast(err.error || 'Comment failed', 'error');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'community') Community.init();
});


