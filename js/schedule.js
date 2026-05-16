const SchedulePicker = {
  selected: [],

  async init() {
    const container = document.getElementById('schedule-slots');
    const rulesEl = document.getElementById('schedule-rules');
    if (!container) return;

    try {
      const data = await BuxinEV.api('/api/schedules');
      const schedules = data.schedules || [];

      if (rulesEl) {
        rulesEl.innerHTML = `
          <p class="schedule-rules__tz"><strong>All times: ${data.timezone || 'Indian Standard Time (IST)'}</strong></p>
          <ul class="schedule-rules__list text-sm opacity-80">
            <li>Each class = <strong>1 hour</strong></li>
            <li>Every student gets <strong>2 hours per week</strong></li>
            <li>Select <strong>exactly 2</strong> slots — 2 different days <em>or</em> 2 on the same day</li>
          </ul>
          <p class="text-sm opacity-70 mt-2">Examples: Mon 5–6 PM + Thu 5–6 PM · Sat 2–3 PM + Sat 3–4 PM</p>
        `;
      }

      const byDay = {};
      schedules.forEach((s) => {
        if (!byDay[s.day_of_week]) byDay[s.day_of_week] = [];
        byDay[s.day_of_week].push(s);
      });

      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      container.innerHTML = days
        .filter((d) => byDay[d]?.length)
        .map((day) => `
          <div class="schedule-day-group">
            <h3 class="schedule-day-title">${day}</h3>
            <div class="schedule-slots-grid">
              ${byDay[day].map((s) => `
                <label class="schedule-slot glass">
                  <input type="checkbox" name="schedule" value="${s.id}">
                  <span class="slot-time">${s.time_slot}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `).join('');

      this.bindSlotInputs(container);
      this.updateSelectionUI();
    } catch {
      container.innerHTML = '<p>Could not load schedules. Try again later.</p>';
    }
  },

  bindSlotInputs(container) {
    container.querySelectorAll('input[name=schedule]').forEach((input) => {
      input.addEventListener('change', () => {
        const checked = [...container.querySelectorAll('input:checked')];
        if (checked.length > 2) {
          input.checked = false;
          BuxinEV.showToast('Select exactly 2 time slots per week', 'info');
          return;
        }
        this.selected = checked.map((c) => parseInt(c.value, 10));
        this.updateSelectionUI();
      });
    });
  },

  updateSelectionUI() {
    const count = this.selected.length;
    const hint = document.getElementById('schedule-selection-hint');
    if (hint) {
      hint.textContent = count === 2
        ? '✓ 2 slots selected — continue to payment'
        : `Selected ${count} of 2 required slots`;
      hint.classList.toggle('schedule-hint--ok', count === 2);
    }
    const btn = document.getElementById('schedule-continue');
    if (btn) btn.disabled = count !== 2;
  },

  async saveSelections() {
    if (this.selected.length !== 2) {
      BuxinEV.showToast('Select exactly 2 time slots (2 hours per week, IST)', 'error');
      return false;
    }
    await BuxinEV.api('/api/schedules/select', {
      method: 'POST',
      body: JSON.stringify({ schedule_ids: this.selected }),
    });
    return true;
  },
};
