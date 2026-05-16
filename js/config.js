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
  const wakeUrl = `${base}/api/wake`;
  const pingUrl = `${base}/api/ping`;
  const backoff = [0, 1500, 3000, 5000, 8000, 12000];

  fetch(pingUrl, { method: 'GET', mode: 'cors', cache: 'no-store' }).catch(() => {});

  (async function earlyWake() {
    for (let i = 0; i < backoff.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, backoff[i]));
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 90000);
        const res = await fetch(wakeUrl, { method: 'GET', mode: 'cors', cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timer);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          sessionStorage.setItem('buxinev_last_wake', String(Date.now()));
          if (data?.db === 1) sessionStorage.setItem('buxinev_wake_ok', '1');
          return;
        }
      } catch {
        /* app.js will retry on first API call */
      }
    }
  })();
})();
