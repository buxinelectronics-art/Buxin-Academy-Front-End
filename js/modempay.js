/**
 * Modem Pay — hosted checkout redirect (same flow as Buxin Store).
 * Server returns payment_url → browser redirects to checkout.modempay.com
 */
const BuxinModemPay = {
  INSTANT: ['Wave', 'AfriMoney'],
  _config: null,

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

  async startInstantPay(classType, method) {
    await this.loadConfig();
    if (!this.isAvailable()) {
      throw { error: 'Wave / AfriMoney pay is only available in The Gambia.' };
    }

    const session = await BuxinEV.api('/api/payments/modempay/session', {
      method: 'POST',
      body: JSON.stringify({ class_type: classType, payment_method: method }),
    });

    const url = session.payment_url;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw {
        error: session.error || 'Could not open Modem Pay checkout. Try again or use bank transfer.',
      };
    }

    window.location.href = url;
    return { redirect: true };
  },
};
