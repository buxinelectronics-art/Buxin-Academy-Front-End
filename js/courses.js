/** Individual 6-month course tracks (mirrors backend catalog). */
const Courses = {
  _list: null,

  FALLBACK: [
    { id: 'robotics', name: 'Robotics' },
    { id: 'iot', name: 'IoT (Internet of Things)' },
    { id: 'python', name: 'Python Programming' },
    { id: 'c_programming', name: 'C Programming' },
    { id: 'cpp', name: 'C++' },
    { id: 'arduino', name: 'Arduino Programming' },
    { id: 'frontend', name: 'Front-End Development' },
    { id: 'backend', name: 'Back-End Development' },
    { id: 'fullstack', name: 'Full Stack Development' },
    { id: 'ai_automation', name: 'AI & Automation' },
  ],

  async load() {
    if (this._list) return this._list;
    try {
      const { courses } = await BuxinEV.api('/api/courses/individual');
      this._list = courses?.length ? courses : this.FALLBACK;
    } catch {
      this._list = this.FALLBACK;
    }
    return this._list;
  },

  label(courseId) {
    if (!courseId) return '—';
    const c = (this._list || this.FALLBACK).find((x) => x.id === courseId);
    return c ? c.name : courseId;
  },

  fillSelect(selectEl, selectedId = '') {
    if (!selectEl) return;
    const list = this._list || this.FALLBACK;
    const placeholder = '<option value="">Select your course…</option>';
    selectEl.innerHTML = placeholder + list.map((c) => {
      const sel = c.id === selectedId ? ' selected' : '';
      return `<option value="${c.id}"${sel}>${c.name}</option>`;
    }).join('');
  },
};
