/**
 * Deployment config — set PROD_API_URL to your Render backend URL after deploy.
 * Example: https://buxinev-academy-api.onrender.com
 */
window.BUXIN_CONFIG = {
  PROD_API_URL: 'https://buxin-academy.onrender.com',
};

(function () {
  // Force HTTPS on custom domain (http:// breaks CORS with the API)
  if (location.protocol === 'http:' && location.hostname.endsWith('techbuxin.com')) {
    location.replace('https://' + location.host + location.pathname + location.search);
    return;
  }
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (!isLocal && window.BUXIN_CONFIG?.PROD_API_URL) {
    localStorage.setItem('buxinev_api', window.BUXIN_CONFIG.PROD_API_URL);
  }

  // Wake Render + DB as soon as the site loads (before app.js / login / post).
  const api = localStorage.getItem('buxinev_api') || window.BUXIN_CONFIG?.PROD_API_URL;
  if (api && !isLocal) {
    fetch(`${api.replace(/\/$/, '')}/api/wake`, { method: 'GET', mode: 'cors', cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data?.db === 1) {
          sessionStorage.setItem('buxinev_last_wake', String(Date.now()));
          sessionStorage.setItem('buxinev_wake_ok', '1');
        }
      })
      .catch(() => {});
  }
})();
