const SchedulePicker = {
  selected: [],

  async init() {
    const container = document.getElementById('schedule-slots');
    if (!container) return;
    try {
      const { schedules } = await BuxinEV.api('/api/schedules');
      container.innerHTML = schedules.map(s => `
        <label class="schedule-slot glass">
          <input type="checkbox" name="schedule" value="${s.id}" data-max="2">
          <span class="slot-day">${s.day_of_week}</span>
          <span class="slot-time">${s.time_slot}</span>
        </label>
      `).join('');

      container.querySelectorAll('input[name=schedule]').forEach(input => {
        input.addEventListener('change', () => {
          const checked = [...container.querySelectorAll('input:checked')];
          if (checked.length > 2) {
            input.checked = false;
            BuxinEV.showToast('Select up to 2 preferred times', 'info');
            return;
          }
          this.selected = checked.map(c => parseInt(c.value));
        });
      });
    } catch {
      container.innerHTML = '<p>Could not load schedules. Try again later.</p>';
    }
  },

  async saveSelections() {
    if (this.selected.length < 1) {
      BuxinEV.showToast('Please select at least one schedule', 'error');
      return false;
    }
    await BuxinEV.api('/api/schedules/select', {
      method: 'POST',
      body: JSON.stringify({ schedule_ids: this.selected }),
    });
    return true;
  },
};

document.addEventListener('DOMContentLoaded', () => SchedulePicker.init());

