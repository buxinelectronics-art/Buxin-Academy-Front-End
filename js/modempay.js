/**
 * Modem Pay — Wave & AfriMoney instant checkout (The Gambia).
 * Docs: https://docs.modempay.com/documentation/payments/modem-inline
 */
const BuxinModemPay = {
  INSTANT: ['Wave', 'AfriMoney'],
  _config: null,
  _scriptLoaded: false,

  async loadConfig() {
    if (this._config) return this._config;
    const res = await fetch(`${BuxinEV.API_URL}/api/payments/modempay/config`);
    this._config = await res.json();
    return this._config;
  },

  isAvailable() {
    return (
      BuxinEV.getCountryCode() === 'GM'
      && this._config?.enabled
      && this._config?.public_key
    );
  },

  isInstantMethod(name) {
    return this.INSTANT.includes(name);
  },

  loadScript() {
    if (this._scriptLoaded || typeof window.ModemPayCheckout === 'function') {
      this._scriptLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-modempay]')) {
        resolve();
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.modempay.com/dist/main.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://api.modempay.com/js/v1.js';
      s.dataset.modempay = '1';
      s.onload = () => {
        this._scriptLoaded = true;
        resolve();
      };
      s.onerror = () => reject(new Error('Could not load Modem Pay'));
      document.head.appendChild(s);
    });
  },

  async startInstantPay(classType, method) {
    await this.loadConfig();
    if (!this.isAvailable()) {
      throw { error: 'Wave / AfriMoney pay is only available in The Gambia.' };
    }
    await this.loadScript();
    if (typeof window.ModemPayCheckout !== 'function') {
      throw { error: 'Modem Pay failed to load. Refresh and try again.' };
    }

    const session = await BuxinEV.api('/api/payments/modempay/session', {
      method: 'POST',
      body: JSON.stringify({ class_type: classType, payment_method: method }),
    });

    const user = Auth.getUser();
    const title = classType === 'individual'
      ? 'Buxin Academy — Individual Class'
      : 'Buxin Academy — Group Class';

    return new Promise((resolve, reject) => {
      const modal = window.ModemPayCheckout({
        amount: session.amount,
        currency: session.currency || 'GMD',
        public_key: session.public_key,
        payment_methods: 'wallet',
        title,
        description: `${method} — ${title}`,
        customer_email: user?.email,
        customer_name: user?.full_name,
        customer_phone: user?.phone || '',
        metadata: {
          payment_id: session.payment_id,
          user_id: user?.id,
          class_type: classType,
        },
        callback: async (transaction) => {
          try {
            const result = await BuxinEV.api('/api/payments/modempay/verify', {
              method: 'POST',
              body: JSON.stringify({
                transaction_id: transaction.id,
                payment_id: session.payment_id,
              }),
            });
            Auth.saveSession(localStorage.getItem('buxinev_token'), result.user);
            modal?.close?.();
            resolve(result);
          } catch (err) {
            modal?.close?.();
            reject(err);
          }
        },
        onClose: (cancelled) => {
          if (cancelled) {
            reject({ error: 'Payment cancelled', cancelled: true });
          }
        },
      });
    });
  },
};
