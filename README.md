# aervo

AERVO – business insight assistant

## Development

- Open `index.html` in a browser to view the demo pages.

### Shopify OAuth (local demo)

This repository includes a small demo OAuth server to let merchants connect their Shopify stores for data access.

1. Copy `.env.example` to `.env` and fill in `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` from your Shopify app.
2. Install dependencies and run the server (Node 18+ recommended):

```bash
npm init -y
npm install express node-fetch@2 body-parser sqlite3 dotenv
node server.js
```

3. Open `http://localhost:3000//dashboard` and click "Connect with Shopify". The demo flow will ask for your shop domain and redirect through Shopify's OAuth flow.

Notes:

- Tokens are persisted into a local SQLite database (see `DB_FILE` in `.env`). This is still a demo — in production store tokens encrypted in your app database and associate them with your users.
- The server exposes a simple metrics endpoint used by the dashboard:

- `GET /api/shop/:shop/metrics` — returns basic aggregated metrics (orders_count, total_revenue, average_order_value, products_count) by querying the Shopify Admin API using the stored token.

Sessions and OAuth state

- This demo now uses `express-session` to bind the OAuth `state` value to the user's session. That prevents CSRF and ties the OAuth flow to an app session.
- For local testing the default session MemoryStore is used. In production, replace it with a persistent session store (Redis, database-backed store) and set `SESSION_SECRET` in your `.env`.
- HMAC validation is performed on the OAuth callback, but you should also validate redirect URIs in your Shopify app settings and tie OAuth `state` to authenticated user sessions.
- When deploying, update `HOST` in `.env` to your public URL and register the exact redirect URI in your Shopify Partner App settings.

Deploying to Render

- Problem you're seeing: `https://aervoapp.com/auth/shopify` 404s when the site is hosted as a static site because the Node routes (`/auth/shopify`, `/auth/shopify/callback`, `/api/*`) are served by `server.js`, not by static hosting.
- Fix: Deploy this repository as a Render "Web Service" (Node) so `server.js` runs and serves both static files and the OAuth/API routes.

Quick Render steps:

1. In the Render dashboard create a new "Web Service" and connect your GitHub repo.
2. Branch: your `main` (or whichever branch).
3. Build command: leave empty or `npm install` (Render will run install automatically).
4. Start command: `npm start` (this runs `node server.js` from `package.json`).
5. Environment:
   - Add the following environment variables in Render (Environment > New Variable):
     - `SHOPIFY_API_KEY` = <your Shopify API key>
     - `SHOPIFY_API_SECRET` = <your Shopify API secret>
     - `SESSION_SECRET` = <a long random string>
     - `HOST` = `https://aervoapp.com`
     - `DB_FILE` = `./data.sqlite` (optional, default)
6. After deploy, map your custom domain `aervoapp.com` to the Render service (Render Domains settings). Ensure the domain is assigned to the Web Service (not a static site).
7. In your Shopify Partner App settings set the app redirect URI to `https://aervoapp.com/auth/shopify/callback` and your app's allowed redirection URLs.

If you previously created a Render "Static Site" for this repo, delete it or unassign `aervoapp.com` from the static site and use it for the Web Service — static sites cannot run Node routes and will return 404 for `/auth/*`.

Optional: Use a Render-managed Postgres or Redis for sessions and store the DB file on a persistent volume if you expect production usage.
