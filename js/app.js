/* Buxin Academy — Core Application */
const BuxinEV = {
  API_URL: localStorage.getItem('buxinev_api')
    || (window.BUXIN_CONFIG && window.BUXIN_CONFIG.PROD_API_URL)
    || 'http://localhost:5000',

  COUNTRIES: {
    GM: { name: 'The Gambia', flag: '🇬🇲', currency: 'GMD', symbol: 'D', rate: 72.5,
      payment_methods: ['Wave', 'Bank Transfer', 'Western Union', 'MoneyGram', 'Ria'] },
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
  },

  GROUP_PRICE_USD: 5,
  INDIVIDUAL_PRICE_USD: 100,

  getCountry() {
    const code = localStorage.getItem('buxinev_country') || 'GM';
    return this.COUNTRIES[code] || this.COUNTRIES.GM;
  },

  getCountryCode() {
    return localStorage.getItem('buxinev_country') || 'GM';
  },

  setCountry(code) {
    localStorage.setItem('buxinev_country', code);
    const c = this.COUNTRIES[code];
    if (c) {
      localStorage.setItem('buxinev_country_name', c.name);
      localStorage.setItem('buxinev_currency', c.currency);
      localStorage.setItem('buxinev_symbol', c.symbol);
    }
  },

  convertPrice(usd) {
    const c = this.getCountry();
    const local = usd * c.rate;
    const sym = c.symbol;
    const formatted = local >= 1000
      ? `${sym}${local.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${sym}${local.toFixed(2)}`;
    return { usd, local, formatted, currency: c.currency, symbol: sym };
  },

  requireCountry(redirect = 'index.html') {
    if (!localStorage.getItem('buxinev_country')) {
      window.location.href = redirect;
      return false;
    }
    return true;
  },

  getTheme() {
    return localStorage.getItem('buxinev_theme') || 'dark';
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

  /** Compress receipt images for upload (always JPEG, max 1200px). */
  async compressReceiptFile(file) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) {
      throw { error: 'Receipt must be an image (JPG or PNG).' };
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1200;
        let w = img.width;
        let h = img.height;
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
        reject({ error: 'Could not read receipt image. Try another file.' });
      };
      img.src = url;
    });
  },

  async compressImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return null;
    if (file.size < 400000) {
      return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(file);
      });
    }
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = (h * maxW) / w;
          w = maxW;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },

  /**
   * Render free tier can take 30–90s to cold-start. Retry network errors and 502/503/504.
   */
  async fetchWithColdStartRetry(url, options = {}) {
    const maxAttempts = 6;
    const backoffMs = [3000, 5000, 8000, 12000, 15000];
    let lastNetworkError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt - 1]));
      }
      try {
        const res = await fetch(url, options);
        if ([502, 503, 504].includes(res.status) && attempt < maxAttempts - 1) {
          continue;
        }
        return res;
      } catch (err) {
        lastNetworkError = err;
      }
    }
    throw lastNetworkError;
  },

  async api(endpoint, options = {}) {
    const token = localStorage.getItem('buxinev_token');
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await this.fetchWithColdStartRetry(`${this.API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } catch {
      throw {
        error:
          'Cannot reach API — the server may still be starting (free hosting). Wait a minute and try again.',
        network: true,
      };
    }
    const data = await res.json().catch(() => ({}));
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

  /**
   * Free hosts (e.g. Render) sleep until traffic hits the API. Static site open ≠ API traffic.
   * Ping once per tab so opening the site starts wake + confirms DB (`db: 1` from SELECT 1).
   */
  async wakeBackendIfNeeded() {
    if (sessionStorage.getItem('buxinev_wake_ok')) return;
    try {
      const res = await this.fetchWithColdStartRetry(`${this.API_URL}/api/wake`, {
        method: 'GET',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.db === 1) sessionStorage.setItem('buxinev_wake_ok', '1');
    } catch {
      /* Login and other actions still use api() retries */
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  BuxinEV.initTheme();
  BuxinEV.initNav();
  void BuxinEV.wakeBackendIfNeeded();
});

