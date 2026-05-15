const Payments = {
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
    const res = await fetch(`${BuxinEV.API_URL}/api/payments/upload-receipt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  },

  async getMyPayments() {
    return BuxinEV.api('/api/payments/my');
  },

  renderPaymentMethods(container) {
    const methods = BuxinEV.getCountry().payment_methods || [];
    container.innerHTML = methods.map(m => `
      <label class="payment-method-card">
        <input type="radio" name="payment_method" value="${m}" required>
        <span class="method-icon">💳</span>
        <span>${m}</span>
      </label>
    `).join('');
  },

  initPaymentPage() {
    if (!Auth.requireAuth()) return;
    BuxinEV.requireCountry();

    const user = Auth.getUser();
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
      const btn = e.target.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const method = document.querySelector('input[name=payment_method]:checked')?.value;
        await this.createPayment(classType, method);
        const file = document.getElementById('receipt-file')?.files[0];
        if (file) await this.uploadReceipt(file);
        BuxinEV.showToast('Payment submitted! Awaiting approval.', 'success');
        window.location.href = 'waiting-approval.html';
      } catch (err) {
        BuxinEV.showToast(err.error || 'Payment failed', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('payment-form')) Payments.initPaymentPage();
});

