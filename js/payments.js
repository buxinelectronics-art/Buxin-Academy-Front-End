const Payments = {
  _submitting: false,

  async submitWithReceipt(classType, method, file) {
    if (!localStorage.getItem('buxinev_token')) {
      throw { error: 'Please log in first.' };
    }
    const receipt_base64 = await BuxinEV.compressReceiptFile(file);
    if (!receipt_base64) {
      throw { error: 'Could not read receipt image. Use JPG or PNG under 5MB.' };
    }
    try {
      return await BuxinEV.api('/api/payments/submit', {
        method: 'POST',
        body: JSON.stringify({
          class_type: classType,
          payment_method: method,
          receipt_base64,
        }),
      });
    } catch (err) {
      if (Auth.isAuthError(err)) {
        Auth.clearSession();
        throw {
          ...err,
          error: 'Session expired — log in and submit your receipt again.',
        };
      }
      if (err.status === 413) {
        throw { error: 'Receipt file is too large. Try a smaller screenshot.' };
      }
      throw err;
    }
  },

  async createPayment(classType, method) {
    return BuxinEV.api('/api/payments', {
      method: 'POST',
      body: JSON.stringify({ class_type: classType, payment_method: method }),
    });
  },

  async uploadReceipt(file) {
    const form = new FormData();
    form.append('receipt', file);
    const token = localStorage.getItem('buxinev_token');
    if (!token) throw { error: 'Please log in first.' };
    let res;
    try {
      res = await BuxinEV.fetchWithColdStartRetry(`${BuxinEV.API_URL}/api/payments/upload-receipt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    } catch {
      throw {
        error: 'Upload failed — server may be starting; wait and try again.',
        network: true,
      };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data;
    return data;
  },

  async getMyPayments() {
    return BuxinEV.api('/api/payments/my');
  },

  renderPaymentMethods(container) {
    if (!container) return;
    const methods = BuxinEV.getCountry().payment_methods || [];
    container.innerHTML = methods.map(m => `
      <label class="payment-method-card">
        <input type="radio" name="payment_method" value="${m}" required>
        <span class="method-icon">💳</span>
        <span>${m}</span>
      </label>
    `).join('');
  },

  async initPaymentPage() {
    if (!Auth.isLoggedIn()) {
      const type = new URLSearchParams(location.search).get('type') || 'group';
      window.location.href = `login.html?next=${encodeURIComponent(`payment.html?type=${type}`)}&msg=exists`;
      return;
    }
    BuxinEV.requireCountry();

    const user = await Auth.refreshUser();
    if (!user) return;
    const classType = new URLSearchParams(location.search).get('type')
      || user?.class_type || 'group';
    const price = classType === 'individual'
      ? BuxinEV.convertPrice(BuxinEV.INDIVIDUAL_PRICE_USD)
      : BuxinEV.convertPrice(BuxinEV.GROUP_PRICE_USD);

    const priceEl = document.getElementById('payment-amount');
    if (priceEl) priceEl.textContent = price.formatted;

    const typeEl = document.getElementById('class-type-label');
    if (typeEl) {
      typeEl.textContent = classType === 'individual'
        ? 'Individual Mentorship Class'
        : 'Group Robotics Class (Sundays)';
    }

    const methodsContainer = document.getElementById('payment-methods');
    if (methodsContainer) this.renderPaymentMethods(methodsContainer);

    const preview = document.getElementById('receipt-preview');
    document.getElementById('receipt-file')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && preview) {
        preview.src = URL.createObjectURL(file);
        preview.classList.remove('hidden');
      }
    });

    document.getElementById('payment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this._submitting) return;
      const btn = e.target.querySelector('[type=submit]');
      const method = document.querySelector('input[name=payment_method]:checked')?.value;
      const file = document.getElementById('receipt-file')?.files[0];
      if (!method) { BuxinEV.showToast('Select a payment method', 'error'); return; }
      if (!file) { BuxinEV.showToast('Upload receipt', 'error'); return; }

      this._submitting = true;
      btn.disabled = true;
      try {
        const result = await this.submitWithReceipt(classType, method, file);
        if (result?.upload_warning) {
          BuxinEV.showToast('Payment saved. Admin may ask for a clearer receipt if needed.', 'info');
        }
        BuxinEV.showToast('Submitted! Waiting for approval.', 'success');
        window.location.replace('waiting-approval.html');
      } catch (err) {
        this._submitting = false;
        btn.disabled = false;
        let msg = err.error || err.message || 'Payment failed';
        if (err.network) msg = err.error;
        if (err.upload_warning) BuxinEV.showToast(err.upload_warning, 'info');
        if (Auth.isAuthError(err)) {
          msg = err.error || 'Session expired — log in and try again.';
          setTimeout(() => {
            window.location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
          }, 1500);
        }
        BuxinEV.showToast(msg, 'error');
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('payment-form')) Payments.initPaymentPage();
});
