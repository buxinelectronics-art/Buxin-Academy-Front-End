const Payments = {

  _submitting: false,

  _receiptFile: null,

  _selectedTier: null,

  _classType: 'group',



  TIERS: {

    wallet: { method: 'Mobile Wallet', label: 'Mobile Wallet' },

    bank: { method: 'Bank Transfer', label: 'Bank Transfer' },

    remittance: { method: 'Western Union / MoneyGram / Ria', label: 'Money Transfer' },

  },



  BANK_DETAILS: {

    title: 'International Bank Transfer',

    rows: [

      ['Account holder', 'Abdoukadir Jabbi'],

      ['Bank', 'Ecobank Gambia Ltd'],

      ['Account number', '6261010783'],

      ['IBAN', '008203626101078387'],

      ['SWIFT / BIC', 'ECOCGMGM'],

      ['Correspondent bank', 'Citibank US'],

      ['Correspondent SWIFT', 'CITIUS33'],

      ['Country', 'The Gambia'],

      ['Currency', 'USD / GMD'],

      ['Reference', 'Your full name + Buxin Academy'],

    ],

  },



  REMITTANCE_DETAILS: {

    title: 'International Money Transfer',

    rows: [

      ['Receiver name', 'ABDOUKADIR JABBI'],

      ['Country', 'India'],

      ['City', 'Greater Noida, Uttar Pradesh'],

      ['Phone', '+91 931 903 8312'],

      ['Services', 'Western Union · MoneyGram · Ria'],

    ],

  },



  getSelectedTier() {

    return this._selectedTier;

  },



  getSelectedMethod() {

    const tier = this.TIERS[this._selectedTier];

    return tier?.method || '';

  },



  isWalletTier() {

    return this._selectedTier === 'wallet';

  },



  _detailsHtml(details) {

    const rows = details.rows

      .map(([k, v]) => `<div class="pay-detail-row"><span class="pay-detail-key">${k}</span><span class="pay-detail-val">${v}</span></div>`)

      .join('');

    return `<div class="pay-details-inner"><h4 class="pay-details-title">${details.title}</h4>${rows}</div>`;

  },



  _setReceiptVisible(show) {

    const block = document.getElementById('manual-receipt-block');

    if (block) block.classList.toggle('hidden', !show);

  },



  _setActiveOption(tier) {

    document.querySelectorAll('.pay-option').forEach((el) => {

      el.classList.toggle('pay-option--active', el.dataset.tier === tier);

    });

  },



  _showDetailsPanel(tier) {

    const panel = document.getElementById('payment-details-panel');

    if (!panel) return;

    if (tier === 'bank') {

      panel.innerHTML = this._detailsHtml(this.BANK_DETAILS);

      panel.classList.remove('hidden');

    } else if (tier === 'remittance') {

      panel.innerHTML = this._detailsHtml(this.REMITTANCE_DETAILS);

      panel.classList.remove('hidden');

    } else {

      panel.innerHTML = '';

      panel.classList.add('hidden');

    }

  },



  _selectManualTier(tier) {

    this._selectedTier = tier;

    this._setActiveOption(tier);

    this._showDetailsPanel(tier);

    this._setReceiptVisible(true);

    const hidden = document.getElementById('payment-method-value');

    if (hidden) hidden.value = this.getSelectedMethod();

  },



  async renderPaymentMethods(container, classType, options = {}) {

    if (!container) return;

    this._classType = classType;

    this._selectedTier = null;

    await BuxinModemPay.loadConfig();



    if (BuxinEV.getCountryCode() === 'GM' && BuxinModemPay.isAvailable()) {

      this._renderGambiaOptions(container, classType, options);

      return;

    }



    this._renderLegacyOptions(container, classType, options);

  },



  _renderGambiaOptions(container, classType, options) {

    container.className = 'payment-methods payment-methods--tiers';

    container.innerHTML = `

      <p class="pay-options-intro">Choose how you want to pay</p>

      <div class="pay-options">

        <button type="button" class="pay-option pay-option--wallet" data-tier="wallet">

          <span class="pay-option-badges">

            <span class="pay-badge">Wave</span>

            <span class="pay-badge">AfriMoney</span>

            <span class="pay-badge">APS</span>

          </span>

          <span class="pay-option-title">Mobile Wallet</span>

          <span class="pay-option-desc">Pay instantly on the next page — no receipt upload</span>

          <span class="pay-option-cta">Continue to secure checkout →</span>

        </button>

        <button type="button" class="pay-option pay-option--bank" data-tier="bank">

          <span class="pay-option-icon" aria-hidden="true">🏦</span>

          <span class="pay-option-title">Bank Transfer</span>

          <span class="pay-option-desc">Ecobank international transfer — upload receipt after</span>

        </button>

        <button type="button" class="pay-option pay-option--remit" data-tier="remittance">

          <span class="pay-option-icon" aria-hidden="true">🌍</span>

          <span class="pay-option-title">Money Transfer</span>

          <span class="pay-option-desc">Western Union · MoneyGram · Ria — upload receipt after</span>

        </button>

      </div>

      <input type="hidden" name="payment_method" id="payment-method-value" value="">

    `;



    let panel = document.getElementById('payment-details-panel');

    if (!panel) {

      panel = document.createElement('div');

      panel.id = 'payment-details-panel';

      panel.className = 'payment-details-panel hidden';

      container.insertAdjacentElement('afterend', panel);

    } else {

      panel.classList.add('hidden');

      panel.innerHTML = '';

    }



    this._setReceiptVisible(false);



    container.querySelector('[data-tier="wallet"]').addEventListener('click', async () => {

      try {

        if (options.beforeAuth) await options.beforeAuth();

        await this.handleInstantPay(classType, BuxinModemPay.WALLET_METHOD, null);

      } catch (err) {

        if (!err.cancelled) {

          BuxinEV.showToast(err.error || err.message || 'Payment failed', 'error');

        }

      }

    });



    container.querySelector('[data-tier="bank"]').addEventListener('click', () => {

      this._selectManualTier('bank');

    });



    container.querySelector('[data-tier="remittance"]').addEventListener('click', () => {

      this._selectManualTier('remittance');

    });

  },



  _renderLegacyOptions(container, classType, options) {

    container.className = 'payment-methods';

    const all = BuxinEV.getCountry().payment_methods || [];

    let html = all.map((m) => `

      <label class="payment-method-card">

        <input type="radio" name="payment_method" value="${m}">

        <span class="method-icon">💳</span>

        <span>${m}</span>

      </label>

    `).join('');

    container.innerHTML = html;

    this._setReceiptVisible(all.length > 0);

  },



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



  async handleInstantPay(classType, method, btn) {

    if (this._submitting) return;

    if (!localStorage.getItem('buxinev_token')) {

      throw { error: 'Please log in or complete registration first.' };

    }

    this._submitting = true;

    if (btn) btn.disabled = true;

    BuxinEV.showToast('Opening secure checkout…', 'info');

    try {

      const result = await BuxinModemPay.startInstantPay(classType, method);

      if (result?.redirect) return;

      if (result?.user) {

        Auth.saveSession(localStorage.getItem('buxinev_token'), result.user);

      }

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
    BuxinEV.initStudentNav('payment');
    const cached = Auth.getUser();
    if (cached) void Auth.updateNavLinks(cached);

    const historyList = document.getElementById('payment-history-list');
    const cachedPay = BuxinEV.cacheGet('payments');
    if (cachedPay?.length && historyList) {
      historyList.innerHTML = this.renderHistoryList(cachedPay);
    }

    if (!Auth.isLoggedIn()) {

      const type = new URLSearchParams(location.search).get('type') || 'group';

      window.location.href = `login.html?next=${encodeURIComponent(`payment.html?type=${type}`)}&msg=exists`;

      return;

    }

    BuxinEV.requireCountry();



    if (cached && Auth.hasPaidAccess(cached)) {
      void Auth.refreshUserInBackground();
      void this.initPaymentHistory();
      return;
    }

    const user = cached || await Auth.refreshUserFresh();
    if (!user) return;

    if (Auth.hasPaidAccess(user)) {
      return this.initPaymentHistory();
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



    const isRenewal = user.status === 'expired' || new URLSearchParams(location.search).get('renew') === '1';
    const title = document.getElementById('payment-page-title');
    if (title) {
      title.textContent = isRenewal ? 'Renew monthly subscription' : 'Complete payment';
    }
    const renewBanner = document.getElementById('payment-renewal-notice');
    if (renewBanner) renewBanner.classList.toggle('hidden', !isRenewal);

    const intro = document.getElementById('payment-intro');
    if (intro) {
      if (isRenewal) {
        intro.textContent = 'Your 30-day subscription has ended. Choose a payment method below. After admin approves your receipt, you get Day 1 of 30 again — classes and community unlock.';
      } else if (BuxinEV.getCountryCode() === 'GM') {
        intro.textContent = 'Pick one option below — wallet is instant; bank and transfer need a receipt.';
      }
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

      const method = this.getSelectedMethod()

        || document.querySelector('input[name=payment_method]:checked')?.value;

      const file = this._receiptFile || document.getElementById('receipt-file')?.files?.[0];



      if (this.isWalletTier() || BuxinModemPay.isInstantMethod(method)) {

        return this.handleInstantPay(classType, method || BuxinModemPay.WALLET_METHOD);

      }

      if (!method) {

        BuxinEV.showToast('Select bank transfer or money transfer above', 'error');

        return;

      }

      if (!file?.size) {

        BuxinEV.showToast('Upload your payment receipt', 'error');

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

  async initPaymentHistory() {
    document.getElementById('payment-checkout')?.classList.add('hidden');
    document.getElementById('payment-amount')?.classList.add('hidden');
    document.getElementById('class-type-label')?.classList.add('hidden');
    const historyBlock = document.getElementById('payment-history');
    historyBlock?.classList.remove('hidden');

    const title = document.getElementById('payment-page-title');
    if (title) title.textContent = 'Payment History';
    const intro = document.getElementById('payment-intro');
    if (intro) intro.textContent = 'All your payments for Buxin Academy.';

    const list = document.getElementById('payment-history-list');
    const cached = BuxinEV.cacheGet('payments');
    if (cached?.length && list) {
      list.innerHTML = this.renderHistoryList(cached);
    } else if (list && !list.innerHTML.trim()) {
      list.innerHTML = '<p class="opacity-70">Loading payment history…</p>';
    }

    if (BuxinEV.cacheFresh('payments') && BuxinEV._recentlyConnected()) {
      return;
    }

    void (async () => {
      try {
        const { payments } = await this.getMyPayments();
        BuxinEV.cacheSet('payments', payments);
        if (list) {
          list.innerHTML = payments.length
            ? this.renderHistoryList(payments)
            : '<p class="opacity-70">No payments yet.</p>';
        }
      } catch {
        if (list && !list.querySelector('.payment-history-item')) {
          list.innerHTML = '<p class="opacity-70">Could not refresh — showing saved data if any.</p>';
        }
      }
    })();
  },

  renderHistoryList(payments) {
    return payments.map((p) => `
      <div class="payment-history-item glass" style="padding:1rem;margin-bottom:0.75rem;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
          <span class="status-badge status-${p.status}">${p.status}</span>
          <small class="opacity-70">${BuxinEV.formatDate(p.created_at)}</small>
        </div>
        <p class="mt-2"><strong>${p.currency || ''} ${Number(p.amount_local || 0).toLocaleString()}</strong></p>
        <p class="text-sm opacity-70">${p.payment_method || '—'} · ${p.class_type || '—'} class</p>
        ${p.receipt_url ? `<a href="${p.receipt_url}" target="_blank" rel="noopener" class="text-sm">View receipt</a>` : ''}
      </div>
    `).join('');
  },

};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('payment-form') || document.getElementById('payment-history')) {
    Payments.initPaymentPage();
  }
});

