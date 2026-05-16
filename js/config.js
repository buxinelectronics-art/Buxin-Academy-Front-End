/**
 * Deployment config — set PROD_API_URL to your Render backend URL after deploy.
 */
window.BUXIN_CONFIG = {
  PROD_API_URL: 'https://buxin-academy.onrender.com',
};

(function () {
  if (location.protocol === 'http:' && location.hostname.endsWith('techbuxin.com')) {
    location.replace('https://' + location.host + location.pathname + location.search);
    return;
  }
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (!isLocal && window.BUXIN_CONFIG?.PROD_API_URL) {
    localStorage.setItem('buxinev_api', window.BUXIN_CONFIG.PROD_API_URL);
  }

  const api = localStorage.getItem('buxinev_api') || window.BUXIN_CONFIG?.PROD_API_URL;
  if (!api || isLocal) return;

  const base = api.replace(/\/$/, '');
  // Fire-and-forget only — never blocks page load or data requests.
  fetch(`${base}/api/ping`, { method: 'GET', mode: 'cors', cache: 'no-store' }).catch(() => {});
  fetch(`${base}/api/wake`, { method: 'GET', mode: 'cors', cache: 'no-store' })
    .then((r) => r.json().catch(() => ({})))
    .then((data) => {
      sessionStorage.setItem('buxinev_last_wake', String(Date.now()));
      if (data?.db === 1) sessionStorage.setItem('buxinev_wake_ok', '1');
    })
    .catch(() => {});
})();
