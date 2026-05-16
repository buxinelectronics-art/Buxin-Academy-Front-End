/**
 * Modem Pay — hosted checkout redirect (Wave, AfriMoney, APS on one checkout page).
 */
const BuxinModemPay = {
  WALLET_METHOD: 'Mobile Wallet',
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
    return name === this.WALLET_METHOD
      || ['Wave', 'AfriMoney', 'APS Wallet'].includes(name);
  },

  async startInstantPay(classType, method) {
    await this.loadConfig();
    if (!this.isAvailable()) {
      throw { error: 'Mobile wallet pay is only available in The Gambia.' };
    }

    const payMethod = this.isInstantMethod(method) ? this.WALLET_METHOD : method;
    const session = await BuxinEV.api('/api/payments/modempay/session', {
      method: 'POST',
      body: JSON.stringify({ class_type: classType, payment_method: payMethod }),
    });

    const url = session.payment_url;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw {
        error: session.error || 'Could not open checkout. Try again or use bank transfer.',
      };
    }

    window.location.href = url;
    return { redirect: true };
  },
};
