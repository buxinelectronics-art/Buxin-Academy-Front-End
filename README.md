# Buxin-Academy-Front-End

Static frontend for **Buxin Academy** — robotics education platform for African students.

## Live stack

- HTML, CSS, JavaScript
- Tailwind-ready layout (custom CSS)
- Connects to Flask API on Render

## Local development

```bash
cd frontend
python -m http.server 5500
```

Open `http://localhost:5500`

Set API (if needed):

```js
localStorage.setItem('buxinev_api', 'http://localhost:5000');
```

## Production API

Edit `js/config.js`:

```js
PROD_API_URL: 'https://YOUR-RENDER-URL.onrender.com',
```

Default: `https://buxin-academy.onrender.com`

## Deploy on GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings** → **Pages**
3. Source: **Deploy from branch** → `main` → `/ (root)`
4. Save. Site URL: `https://buxinelectronics-art.github.io/Buxin-Academy-Front-End/`

5. Add that URL to Render backend **CORS_ORIGINS** and redeploy the API.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Country selection |
| `home.html` | Pricing (group / individual) |
| `group-class.html` | Group registration |
| `individual-class.html` | Individual registration |
| `payment.html` | Payment & receipt upload |
| `dashboard.html` | Student dashboard |
| `community.html` | Community feed |
| `admin-dashboard.html` | Admin panel |
