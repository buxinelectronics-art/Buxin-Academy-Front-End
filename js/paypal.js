/**
 * PayPal — instant checkout (USD). Unlocks account immediately after capture.
 */
const BuxinPayPal = {
  PAYPAL_METHOD: 'PayPal',
  _config: null,
  _sdkLoaded: false,
  _rendering: false,

  async loadConfig() {
    if (this._config) return this._config;
    try {
      const res = await fetch(`${BuxinEV.API_URL}/api/payments/paypal/config`);
      this._config = await res.json();
    } catch {
      this._config = { enabled: false, client_id: '' };
    }
    return this._config;
  },

  isAvailable() {
    return Boolean(this._config?.enabled && this._config?.client_id);
  },

  isPayPalMethod(name) {
    return name === this.PAYPAL_METHOD;
  },

  async loadSdk() {
    if (this._sdkLoaded && window.paypal) return;
    await this.loadConfig();
    if (!this.isAvailable()) {
      throw { error: 'PayPal is not available right now.' };
    }
    if (window.paypal) {
      this._sdkLoaded = true;
      return;
    }
    await new Promise((resolve, reject) => {
      const existing = document.getElementById('paypal-sdk-script');
      if (existing) {
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.id = 'paypal-sdk-script';
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(this._config.client_id)}&currency=USD&intent=capture`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('PayPal SDK failed to load'));
      document.head.appendChild(script);
    });
    this._sdkLoaded = true;
  },

  ensureButtonContainer(afterEl) {
    let wrap = document.getElementById('paypal-buttons-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'paypal-buttons-wrap';
      wrap.className = 'paypal-buttons-wrap hidden';
      wrap.innerHTML = '<p class="text-sm opacity-70 mb-2">Complete payment with PayPal — instant access after approval.</p><div id="paypal-button-container"></div>';
      afterEl.insertAdjacentElement('afterend', wrap);
    }
    return wrap;
  },

  async renderButtons(classType, { beforeAuth } = {}) {
    if (this._rendering) return;
    this._rendering = true;
    const container = document.getElementById('paypal-button-container');
    if (!container) {
      this._rendering = false;
      return;
    }
    container.innerHTML = '<p class="text-sm opacity-70">Loading PayPal…</p>';

    try {
      if (beforeAuth) await beforeAuth();
      if (!localStorage.getItem('buxinev_token')) {
        throw { error: 'Please log in or complete registration first.' };
      }
      await this.loadSdk();
      container.innerHTML = '';
      let paymentId = null;

      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
        createOrder: async () => {
          const data = await BuxinEV.api('/api/payments/paypal/create-order', {
            method: 'POST',
            body: JSON.stringify({ class_type: classType }),
          });
          paymentId = data.payment_id;
          return data.order_id;
        },
        onApprove: async (data) => {
          BuxinEV.showToast('Confirming PayPal payment…', 'info');
          const result = await BuxinEV.api('/api/payments/paypal/capture', {
            method: 'POST',
            body: JSON.stringify({
              payment_id: paymentId,
              order_id: data.orderID,
            }),
          });
          if (result.user) {
            Auth.saveSession(localStorage.getItem('buxinev_token'), result.user);
          }
          BuxinEV.showToast('Payment successful! Welcome to Buxin Academy.', 'success');
          window.location.replace('dashboard.html');
        },
        onCancel: () => {
          BuxinEV.showToast('PayPal payment cancelled', 'info');
        },
        onError: (err) => {
          console.error('PayPal error:', err);
          BuxinEV.showToast('PayPal payment failed. Try again or use another method.', 'error');
        },
      }).render('#paypal-button-container');
    } catch (err) {
      container.innerHTML = '';
      if (!err.cancelled) {
        BuxinEV.showToast(err.error || err.message || 'Could not load PayPal', 'error');
      }
      throw err;
    } finally {
      this._rendering = false;
    }
  },

  async selectTier(classType, options = {}) {
    const methodsEl = document.getElementById('payment-methods');
    const wrap = this.ensureButtonContainer(methodsEl || document.getElementById('payment-form'));
    wrap.classList.remove('hidden');
    Payments._selectedTier = 'paypal';
    Payments._setActiveOption?.('paypal');
    Payments._setReceiptVisible?.(false);
    const hidden = document.getElementById('payment-method-value');
    if (hidden) hidden.value = this.PAYPAL_METHOD;
    const panel = document.getElementById('payment-details-panel');
    if (panel) {
      panel.innerHTML = '';
      panel.classList.add('hidden');
    }
    await this.renderButtons(classType, options);
  },
};
