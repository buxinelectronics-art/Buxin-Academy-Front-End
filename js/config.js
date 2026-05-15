/**
 * Deployment config — set PROD_API_URL to your Render backend URL after deploy.
 * Example: https://buxinev-academy-api.onrender.com
 */
window.BUXIN_CONFIG = {
  PROD_API_URL: 'https://buxin-academy.onrender.com',
};

(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (!isLocal && !localStorage.getItem('buxinev_api')) {
    localStorage.setItem('buxinev_api', window.BUXIN_CONFIG.PROD_API_URL);
  }
})();
