const Community = {

  socket: null,



  async init() {

    if (!Auth.requireAuth()) return;



    const cached = Auth.getUser();

    if (cached?.status !== 'active') {

      const user = await Auth.refreshUserFresh() || cached;

      if (!user || user.status !== 'active') {

        window.location.replace(await Auth.resolvePendingRedirect(user || cached));

        return;

      }

    }



    const feed = document.getElementById('community-feed');

    const cachedPosts = BuxinEV.cacheGet('community_posts');

    if (cachedPosts?.length && feed) {

      feed.innerHTML = cachedPosts.map((p) => this.renderPost(p, Auth.getUser())).join('');

      this.bindFeedEvents();

    }



    void BuxinEV.ensureAwake();

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

    document.getElementById('post-form')?.addEventListener('submit', (e) => {

      void this.submitPost(e);

    });

    document.getElementById('post-image')?.addEventListener('change', (e) => {

      const preview = document.getElementById('post-image-preview');

      const file = e.target.files?.[0];

      if (preview && file) {

        preview.src = URL.createObjectURL(file);

        preview.classList.remove('hidden');

      } else if (preview) {

        preview.classList.add('hidden');

      }

    });

  },



  bindFeedEvents() {

    const feed = document.getElementById('community-feed');

    if (!feed) return;

    feed.querySelectorAll('[data-like]').forEach((btn) => {

      btn.addEventListener('click', () => this.toggleLike(btn.dataset.like));

    });

    feed.querySelectorAll('[data-comment-btn]').forEach((btn) => {

      btn.addEventListener('click', () => this.submitComment(btn.dataset.commentBtn));

    });

  },



  async submitPost(e) {

    e.preventDefault();

    const content = document.getElementById('post-content')?.value.trim() || '';

    const file = document.getElementById('post-image')?.files?.[0];

    if (!content && !file) {

      BuxinEV.showToast('Write a message or add a photo', 'error');

      return;

    }



    const btn = e.target.querySelector('[type=submit]');

    if (btn) btn.disabled = true;



    try {

      const body = { content };

      if (file) {

        body.image_base64 = await BuxinEV.compressImageFile(file);

      }

      const { post } = await BuxinEV.api('/api/community/posts', {

        method: 'POST',

        body: JSON.stringify(body),

      });



      document.getElementById('post-content').value = '';

      const imgInput = document.getElementById('post-image');

      if (imgInput) imgInput.value = '';

      document.getElementById('post-image-preview')?.classList.add('hidden');



      if (post) this.prependPost(post);

      BuxinEV.showToast('Post shared!', 'success');

      void this.loadPosts();

    } catch (err) {

      BuxinEV.showToast(err.error || 'Failed to post', 'error');

    } finally {

      if (btn) btn.disabled = false;

    }

  },



  prependPost(post) {

    const feed = document.getElementById('community-feed');

    if (!feed) return;

    const empty = feed.querySelector('.empty-state');

    if (empty) empty.remove();

    const user = Auth.getUser();

    feed.insertAdjacentHTML('afterbegin', this.renderPost(post, user));

    this.bindFeedEvents();

    const cached = BuxinEV.cacheGet('community_posts') || [];

    BuxinEV.cacheSet('community_posts', [post, ...cached.filter((p) => p.id !== post.id)]);

  },



  async loadPosts() {

    const feed = document.getElementById('community-feed');

    if (!feed) return;

    if (!feed.querySelector('.post-card')) {

      feed.innerHTML = '<p class="loading-pulse opacity-70">Loading…</p>';

    }

    try {

      const { posts } = await BuxinEV.api('/api/community/posts');

      BuxinEV.cacheSet('community_posts', posts);

      const user = Auth.getUser();

      feed.innerHTML = posts.length

        ? posts.map((p) => this.renderPost(p, user)).join('')

        : `<div class="empty-state glass"><p>🤖 Be the first to share your robotics project!</p></div>`;

      this.bindFeedEvents();

    } catch (err) {

      if (!feed.querySelector('.post-card')) {

        feed.innerHTML = `<p class="error-text">${err.error || 'Could not load feed. Pull to refresh.'}</p>`;

      }

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

        ${p.content && p.content !== '📷' ? `<p class="post-content">${this.escape(p.content)}</p>` : ''}

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

