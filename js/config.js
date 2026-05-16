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
})();
