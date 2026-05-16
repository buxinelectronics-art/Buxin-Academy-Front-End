const Payments = {
  _submitting: false,
  _receiptFile: null,

  async submitWithReceipt(classType, method, file) {
    if (!file?.size) {
      throw { error: 'Choose a receipt image before submitting.' };
    }
    const token = localStorage.getItem('buxinev_token');
    if (!token) throw { error: 'Please log in first.' };

    const receipt_base64 = await BuxinEV.compressReceiptFile(file);
    const url = `${BuxinEV.API_URL}/api/payments/submit`;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const parseResponse = async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = { status: res.status, ...data };
        if (Auth.isAuthError(err)) {
          Auth.clearSession();
          err.error = 'Session expired — log in and submit your receipt again.';
        }
        throw err;
      }
      return data;
    };

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
      const msg = (err.error || '').toLowerCase();
      const retryMultipart = err.status === 400 && msg.includes('receipt');
      if (!retryMultipart) {
        if (err.status === 413) {
          throw { error: 'Receipt file is too large. Try a smaller screenshot.' };
        }
        throw err;
      }
    }

    const blob = await BuxinEV.dataUrlToBlob(receipt_base64);
    const form = new FormData();
    form.append('class_type', classType);
    form.append('payment_method', method);
    form.append('receipt', blob, 'receipt.jpg');
    const res = await fetch(url, { method: 'POST', headers: authHeaders, body: form });
    return parseResponse(res);
  },

  async getMyPayments() {
    return BuxinEV.api('/api/payments/my');
  },

  async renderPaymentMethods(container, classType, options = {}) {
    if (!container) return;
    await BuxinModemPay.loadConfig();

    const all = BuxinEV.getCountry().payment_methods || [];
    const instant = all.filter((m) => BuxinModemPay.isInstantMethod(m));
    const manual = all.filter((m) => !BuxinModemPay.isInstantMethod(m));

    let html = '';
    if (BuxinModemPay.isAvailable() && instant.length) {
      html += `<p class="text-sm mb-2" style="color:var(--primary)"><strong>Pay instantly</strong> — Wave or AfriMoney via Modem Pay (no receipt)</p>`;
      html += '<div class="payment-methods instant-methods mb-3">';
      instant.forEach((m) => {
        html += `<button type="button" class="payment-method-card instant-pay-btn" data-method="${m}">
          <span class="method-icon">📱</span>
          <span>Pay with ${m}</span>
        </button>`;
      });
      html += '</div>';
    }

    if (manual.length) {
      html += `<p class="text-sm mb-2 mt-3"><strong>Other methods</strong> — transfer, then upload receipt below</p>`;
      html += manual.map((m) => `
        <label class="payment-method-card">
          <input type="radio" name="payment_method" value="${m}">
          <span class="method-icon">💳</span>
          <span>${m}</span>
        </label>
      `).join('');
    }

    container.innerHTML = html;

    const receiptBlock = document.getElementById('manual-receipt-block');
    if (receiptBlock) receiptBlock.classList.toggle('hidden', manual.length === 0);

    container.querySelectorAll('.instant-pay-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          if (options.beforeAuth) await options.beforeAuth();
          await this.handleInstantPay(classType, btn.dataset.method, btn);
        } catch (err) {
          if (!err.cancelled) {
            BuxinEV.showToast(err.error || err.message || 'Payment failed', 'error');
          }
        }
      });
    });
  },

  async handleInstantPay(classType, method, btn) {
    if (this._submitting) return;
    if (!localStorage.getItem('buxinev_token')) {
      throw { error: 'Please log in or complete registration first.' };
    }
    this._submitting = true;
    if (btn) btn.disabled = true;
    BuxinEV.showToast(`Opening Modem Pay (${method})…`, 'info');
    try {
      const result = await BuxinModemPay.startInstantPay(classType, method);
      Auth.saveSession(localStorage.getItem('buxinev_token'), result.user);
      BuxinEV.showToast('Payment successful! Welcome to Buxin Academy.', 'success');
      window.location.replace('dashboard.html');
    } catch (err) {
      if (!err.cancelled) {
        const msg = err.error || err.message || 'Payment failed';
        BuxinEV.showToast(msg, 'error');
        throw err;
      }
    } finally {
      this._submitting = false;
      if (btn) btn.disabled = false;
    }
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
    if (user.status === 'active') {
      window.location.replace('dashboard.html');
      return;
    }
    const pendingDest = await Auth.resolvePendingRedirect(user);
    if (pendingDest === 'waiting-approval.html') {
      window.location.replace('waiting-approval.html');
      return;
    }

    const classType = new URLSearchParams(location.search).get('type')
      || user?.class_type || 'group';
    const price = classType === 'individual'
      ? BuxinEV.convertPrice(BuxinEV.INDIVIDUAL_PRICE_USD)
      : BuxinEV.convertPrice(BuxinEV.GROUP_PRICE_USD);

    document.getElementById('payment-amount') && (document.getElementById('payment-amount').textContent = price.formatted);
    const typeEl = document.getElementById('class-type-label');
    if (typeEl) {
      typeEl.textContent = classType === 'individual'
        ? 'Individual Mentorship Class'
        : 'Group Robotics Class (Sundays)';
    }

    const intro = document.getElementById('payment-intro');
    if (intro && BuxinEV.getCountryCode() === 'GM') {
      intro.textContent = 'Pay with Wave or AfriMoney instantly, or use another method and upload your receipt.';
    }

    await this.renderPaymentMethods(document.getElementById('payment-methods'), classType);

    const preview = document.getElementById('receipt-preview');
    document.getElementById('receipt-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      this._receiptFile = file || null;
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
      const file = this._receiptFile || document.getElementById('receipt-file')?.files?.[0];

      if (!method) {
        BuxinEV.showToast('Select a payment method or use Wave / AfriMoney above', 'error');
        return;
      }
      if (BuxinModemPay.isInstantMethod(method)) {
        return this.handleInstantPay(classType, method);
      }
      if (!file?.size) {
        BuxinEV.showToast('Upload receipt', 'error');
        return;
      }

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
