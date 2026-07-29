/* Buxin Academy — Core Application */
const BuxinEV = {
  API_URL: localStorage.getItem('buxinev_api')
    || (window.BUXIN_CONFIG && window.BUXIN_CONFIG.PROD_API_URL)
    || 'http://localhost:5000',

  COUNTRIES: {
    GM: { name: 'The Gambia', flag: '🇬🇲', currency: 'GMD', symbol: 'D', rate: 72.5,
      payment_methods: ['Mobile Wallet', 'Bank Transfer', 'Western Union / MoneyGram / Ria'] },
    NG: { name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', symbol: '₦', rate: 1500,
      payment_methods: ['Bank Transfer', 'Opay', 'PalmPay', 'Kuda', 'Visa', 'Mastercard'] },
    SN: { name: 'Senegal', flag: '🇸🇳', currency: 'XOF', symbol: 'CFA', rate: 600,
      payment_methods: ['Wave', 'Orange Money', 'Bank Transfer', 'Western Union'] },
    GH: { name: 'Ghana', flag: '🇬🇭', currency: 'GHS', symbol: 'GH₵', rate: 15.5,
      payment_methods: ['MTN MoMo', 'Vodafone Cash', 'Bank Transfer', 'Visa', 'Mastercard'] },
    KE: { name: 'Kenya', flag: '🇰🇪', currency: 'KES', symbol: 'KSh', rate: 130,
      payment_methods: ['M-Pesa', 'Bank Transfer', 'Visa', 'Mastercard'] },
    UG: { name: 'Uganda', flag: '🇺🇬', currency: 'UGX', symbol: 'USh', rate: 3700,
      payment_methods: ['MTN MoMo', 'Airtel Money', 'Bank Transfer'] },
    TZ: { name: 'Tanzania', flag: '🇹🇿', currency: 'TZS', symbol: 'TSh', rate: 2600,
      payment_methods: ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Bank Transfer'] },
    SL: { name: 'Sierra Leone', flag: '🇸🇱', currency: 'SLL', symbol: 'Le', rate: 22000,
      payment_methods: ['Orange Money', 'Bank Transfer', 'Western Union'] },
    GN: { name: 'Guinea', flag: '🇬🇳', currency: 'GNF', symbol: 'FG', rate: 8600,
      payment_methods: ['Orange Money', 'MTN MoMo', 'Bank Transfer'] },
    CI: { name: "Côte d'Ivoire", flag: '🇨🇮', currency: 'XOF', symbol: 'CFA', rate: 600,
      payment_methods: ['Orange Money', 'MTN MoMo', 'Wave', 'Bank Transfer'] },
    ZA: { name: 'South Africa', flag: '🇿🇦', currency: 'ZAR', symbol: 'R', rate: 18.5,
      payment_methods: ['EFT', 'SnapScan', 'Visa', 'Mastercard', 'Bank Transfer'] },
    OTHER: { name: 'Other country', flag: '🌍', currency: 'USD', symbol: '$', rate: 1,
      payment_methods: ['PayPal', 'Bank Transfer', 'Visa', 'Mastercard', 'Western Union / MoneyGram / Ria'] },
  },

  GROUP_PRICE_USD: 1,
  INDIVIDUAL_PRICE_USD: 100,

  isOtherCountry(code = null) {
    return (code || this.getCountryCode()).toUpperCase() === 'OTHER';
  },

  getCountry() {
    const code = this.getCountryCode();
    if (this.isOtherCountry(code)) {
      const name = (localStorage.getItem('buxinev_country_name') || '').trim() || 'Other country';
      return { ...this.COUNTRIES.OTHER, name };
    }
    return this.COUNTRIES[code] || this.COUNTRIES.GM;
  },

  getCountryCode() {
    return (localStorage.getItem('buxinev_country') || 'GM').toUpperCase();
  },

  getCountryName() {
    return this.getCountry().name;
  },

  getRegistrationCountry() {
    const payload = { country_code: this.getCountryCode() };
    if (this.isOtherCountry()) {
      payload.country_name = (localStorage.getItem('buxinev_country_name') || '').trim();
    }
    return payload;
  },

  setCountry(code, customName = null) {
    const upper = String(code || 'GM').toUpperCase();
    localStorage.setItem('buxinev_country', upper);
    if (this.isOtherCountry(upper)) {
      const name = String(customName ?? localStorage.getItem('buxinev_country_name') ?? '').trim();
      if (name) localStorage.setItem('buxinev_country_name', name);
      localStorage.setItem('buxinev_currency', 'USD');
      localStorage.setItem('buxinev_symbol', '$');
      return;
    }
    const c = this.COUNTRIES[upper];
    if (c) {
      localStorage.setItem('buxinev_country_name', c.name);
      localStorage.setItem('buxinev_currency', c.currency);
      localStorage.setItem('buxinev_symbol', c.symbol);
    }
  },

  syncCountryFromUser(user) {
    if (!user?.country_code) return;
    if (this.isOtherCountry(user.country_code)) {
      this.setCountry('OTHER', user.country_name || '');
    } else {
      this.setCountry(user.country_code);
    }
  },

  formatUserCountry(user) {
    if (!user) return '—';
    if (this.isOtherCountry(user.country_code)) {
      const name = (user.country_name || '').trim();
      return name ? `🌍 ${name}` : '🌍 Other country';
    }
    const c = this.COUNTRIES[user.country_code];
    return c ? `${c.flag} ${c.name}` : user.country_code;
  },

  convertPrice(usd) {
    const c = this.getCountry();
    if (c.currency === 'USD') {
      const formatted = `$${Number(usd).toFixed(2)}`;
      return { usd, local: usd, formatted, currency: 'USD', symbol: '$' };
    }
    const local = usd * c.rate;
    const sym = c.symbol;
    const formatted = local >= 1000
      ? `${sym}${local.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${sym}${local.toFixed(2)}`;
    return { usd, local, formatted, currency: c.currency, symbol: sym };
  },

  requireCountry(redirect = 'index.html') {
    const code = localStorage.getItem('buxinev_country');
    if (!code) {
      window.location.href = redirect;
      return false;
    }
    if (this.isOtherCountry(code) && !(localStorage.getItem('buxinev_country_name') || '').trim()) {
      window.location.href = redirect;
      return false;
    }
    return true;
  },

  getTheme() {
    return localStorage.getItem('buxinev_theme') || 'light';
  },

  setTheme(theme) {
    localStorage.setItem('buxinev_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.body?.classList.toggle('light-mode', theme === 'light');
  },

  initTheme() {
    this.setTheme(this.getTheme());
  },

  toggleTheme() {
    const next = this.getTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    return next;
  },

  isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    return /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(file.name || '');
  },

  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject({ error: 'Could not read receipt file.' });
      r.readAsDataURL(file);
    });
  },

  /** Compress receipt images for upload (JPEG, max 1200px); FileReader fallback if canvas fails. */
  async compressReceiptFile(file) {
    if (!file) return null;
    if (!this.isImageFile(file)) {
      throw { error: 'Receipt must be an image (JPG or PNG).' };
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 1200;
          let w = img.width;
          let h = img.height;
          if (!w || !h) {
            URL.revokeObjectURL(url);
            reject(new Error('invalid dimensions'));
            return;
          }
          if (w > maxW) {
            h = (h * maxW) / w;
            w = maxW;
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('image load failed'));
        };
        img.src = url;
      });
      if (dataUrl && dataUrl.length > 80) return dataUrl;
    } catch {
      /* fallback below */
    }
    const raw = await this.readFileAsDataUrl(file);
    if (raw && String(raw).length > 80) return raw;
    throw { error: 'Could not read receipt image. Try JPG or PNG.' };
  },

  async dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
  },

  async compressImageFile(file) {
    if (!file) return null;
    if (!this.isImageFile(file)) {
      throw { error: 'Photo must be JPG, PNG, or WebP.' };
    }
    return this.compressReceiptFile(file);
  },

  /** Small JPEG blob for fast community uploads (max 1024px). */
  async compressImageToBlob(file, { maxWidth = 1024, quality = 0.8 } = {}) {
    if (!file) return null;
    if (!this.isImageFile(file)) {
      throw { error: 'Photo must be JPG or PNG.' };
    }
    const dataUrl = await this.compressReceiptFile(file);
    const blob = await this.dataUrlToBlob(dataUrl);
    if (blob.size > 900000) {
      return this._compressFileToJpegBlob(file, maxWidth, Math.min(quality, 0.72));
    }
    return blob;
  },

  async _compressFileToJpegBlob(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (!w || !h) {
          URL.revokeObjectURL(url);
          reject(new Error('invalid image'));
          return;
        }
        if (w > maxWidth) {
          h = (h * maxWidth) / w;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('compress failed'))),
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  },

  async fetchUploadWithRetry(url, options = {}, maxAttempts = 4) {
    const backoffMs = [400, 800, 1500];
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt - 1] || 4000));
      }
      try {
        const res = await fetch(url, options);
        if ([502, 503, 504].includes(res.status) && attempt < maxAttempts - 1) {
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  },

  async apiMultipart(endpoint, formData, method = 'POST') {
    const token = localStorage.getItem('buxinev_token');
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await this.fetchUploadWithRetry(`${this.API_URL}${endpoint}`, {
        method,
        headers,
        body: formData,
      }, 3);
    } catch {
      throw {
        error: 'Upload failed — check your connection and try again.',
        network: true,
      };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) this._markWakeSuccess(true);
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  },

  initStudentNav(activePage) {
    const toggle = document.getElementById('student-nav-toggle');
    const menu = document.getElementById('student-nav-menu');
    if (!toggle || !menu) return;

    const close = () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== toggle) close();
    });

    menu.querySelectorAll('a[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === activePage);
    });

    menu.querySelector('#student-nav-logout')?.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
    });
    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
    });
  },

  WARM_CONNECTION_MS: 5 * 60 * 1000,

  _recentlyConnected() {
    const last = parseInt(sessionStorage.getItem('buxinev_last_wake') || '0', 10) || 0;
    return last > 0 && Date.now() - last < this.WARM_CONNECTION_MS;
  },

  _inflightGets: new Map(),

  /** Warm = fast fail + cache. Cold = one long wait for Render boot (no retry chain). */
  _fetchPolicy(isWrite = false) {
    if (this._recentlyConnected()) {
      return { maxAttempts: isWrite ? 2 : 1, timeoutMs: isWrite ? 15000 : 12000 };
    }
    return { maxAttempts: 1, timeoutMs: 75000 };
  },

  async fetchWithRetry(url, options = {}, policy = {}) {
    const { maxAttempts = 1, timeoutMs = 90000 } = policy;
    const backoffMs = [400, 800];
    let lastNetworkError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt - 1] || 800));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const signals = [controller.signal];
      if (options.signal) signals.push(options.signal);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onAbort);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        if ([502, 503, 504].includes(res.status) && attempt < maxAttempts - 1) {
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        if (err?.name === 'AbortError' && options.signal?.aborted) throw err;
        lastNetworkError = err;
      }
    }
    throw lastNetworkError;
  },

  async api(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const dedupeKey = method === 'GET' ? endpoint : null;
    if (dedupeKey && this._inflightGets.has(dedupeKey)) {
      return this._inflightGets.get(dedupeKey);
    }
    const work = this._apiRequest(endpoint, options);
    if (dedupeKey) {
      this._inflightGets.set(dedupeKey, work);
      work.finally(() => this._inflightGets.delete(dedupeKey));
    }
    return work;
  },

  async _apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('buxinev_token');
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const method = (options.method || 'GET').toUpperCase();
    const read = !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isWrite = !read;

    let res;
    try {
      res = await this.fetchWithRetry(`${this.API_URL}${endpoint}`, {
        ...options,
        headers,
      }, this._fetchPolicy(isWrite));
    } catch (err) {
      if (err?.name === 'AbortError' || options.signal?.aborted) {
        throw { error: 'Request cancelled.', aborted: true };
      }
      throw {
        error: read
          ? 'Could not refresh feed. Try again.'
          : 'Cannot reach server — try again in a moment.',
        network: true,
      };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) this._markWakeSuccess(true);
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  },

  showToast(message, type = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `toast toast-${type} show`;
    setTimeout(() => el.classList.remove('show'), 3500);
  },

  formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  },

  updatePriceElements() {
    const group = this.convertPrice(this.GROUP_PRICE_USD);
    const individual = this.convertPrice(this.INDIVIDUAL_PRICE_USD);
    document.querySelectorAll('[data-price-group]').forEach(el => {
      el.textContent = group.formatted;
    });
    document.querySelectorAll('[data-price-individual]').forEach(el => {
      el.textContent = individual.formatted;
    });
    document.querySelectorAll('[data-community-tagline]').forEach(el => {
      el.textContent = `Just for ${group.formatted}`;
    });
    document.querySelectorAll('[data-country-name]').forEach(el => {
      el.textContent = this.getCountry().name;
    });
    document.querySelectorAll('[data-country-flag]').forEach(el => {
      el.textContent = this.getCountry().flag;
    });
  },

  initNav() {
    const menuBtn = document.getElementById('menu-toggle');
    const nav = document.getElementById('mobile-nav');
    menuBtn?.addEventListener('click', () => nav?.classList.toggle('open'));
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const t = this.toggleTheme();
      this.showToast(`${t === 'dark' ? '🌙' : '☀️'} ${t} mode`, 'info');
    });
    this.updatePriceElements();
  },

  _keepaliveTimer: null,
  _keepaliveStarted: false,
  KEEPALIVE_INTERVAL_MS: 2 * 60 * 1000,

  _markWakeSuccess(dbOk) {
    sessionStorage.setItem('buxinev_last_wake', String(Date.now()));
    if (dbOk) sessionStorage.setItem('buxinev_wake_ok', '1');
  },

  /** Lightweight ping only — used on a timer so we do not spam wake+DB on every API call. */
  _keepAlivePing() {
    const base = this.API_URL.replace(/\/$/, '');
    fetch(`${base}/api/ping`, { method: 'GET', mode: 'cors', cache: 'no-store' })
      .then((r) => { if (r.ok) this._markWakeSuccess(false); })
      .catch(() => {});
  },

  /** DB check only when Render may be cold — not on every page click. */
  _wakeOnce() {
    if (this._recentlyConnected()) return;
    const base = this.API_URL.replace(/\/$/, '');
    this._keepAlivePing();
    fetch(`${base}/api/wake`, { method: 'GET', mode: 'cors', cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => { if (data?.status) this._markWakeSuccess(data.db === 1); })
      .catch(() => {});
  },

  _startWakeInBackground() {
    if (!this._recentlyConnected()) this._wakeOnce();
  },

  startKeepalive() {
    if (this._keepaliveStarted) return;
    this._keepaliveStarted = true;
    if (!this._recentlyConnected()) this._wakeOnce();
    this._keepaliveTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      this._keepAlivePing();
    }, this.KEEPALIVE_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._keepAlivePing();
    });
  },

  wakeBackendIfNeeded() {
    this._keepAlivePing();
  },

  cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(`buxinev_cache_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  cacheSet(key, value) {
    try {
      sessionStorage.setItem(`buxinev_cache_${key}`, JSON.stringify(value));
      sessionStorage.setItem(`buxinev_cache_ts_${key}`, String(Date.now()));
    } catch {
      /* quota */
    }
  },

  cacheFresh(key, maxAgeMs = 5 * 60 * 1000) {
    const ts = parseInt(sessionStorage.getItem(`buxinev_cache_ts_${key}`) || '0', 10) || 0;
    return ts > 0 && Date.now() - ts < maxAgeMs;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  BuxinEV.initTheme();
  BuxinEV.initNav();
  BuxinEV.startKeepalive();
});

