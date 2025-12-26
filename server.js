const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const path = require('path');
const { URLSearchParams } = require('url');

// Use global fetch when available (Node 18+), otherwise try node-fetch
let fetchFn = global.fetch;
try {
  if (!fetchFn) fetchFn = require('node-fetch');
} catch (e) {
  // node-fetch may not be installed; README instructs how to install deps
}

const sqlite3 = require('sqlite3').verbose();

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const HOST = process.env.HOST || 'http://localhost:3000';
const APP_URL = process.env.APP_URL || HOST; // public URL for OAuth redirects
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_products,read_orders';
const DB_FILE = process.env.DB_FILE || './data.sqlite';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
  console.warn('Warning: SHOPIFY_API_KEY or SHOPIFY_API_SECRET not set. See .env.example');
}

if (!SESSION_SECRET) {
  console.warn('Warning: SESSION_SECRET not set. Sessions will work but use a secure secret in production.');
}

// Session middleware (MemoryStore). For production, use a persistent store (Redis, DB-backed store).
app.use(
  session({
    secret: SESSION_SECRET || crypto.randomBytes(16).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
  })
);

// Initialize SQLite DB for token persistence
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS tokens (
      shop TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      scope TEXT,
      installed_at TEXT
    )`
  );
});

function storeToken(shop, accessToken, scope) {
  const stmt = db.prepare(
    `INSERT INTO tokens(shop, access_token, scope, installed_at) VALUES(?,?,?,datetime('now'))
     ON CONFLICT(shop) DO UPDATE SET access_token=excluded.access_token, scope=excluded.scope, installed_at=excluded.installed_at`
  );
  stmt.run(shop, accessToken, scope || null, (err) => {
    if (err) console.error('DB store token error', err);
  });
  stmt.finalize();
}

function getToken(shop) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT access_token FROM tokens WHERE shop = ?`, [shop], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.access_token : null);
    });
  });
}

app.get('/auth/shopify', (req, res) => {
  // If a `shop` query param is provided, start OAuth immediately and redirect to Shopify
  const shopFromQuery = (req.query.shop || '').trim();
  const shopFromSession = req.session && req.session.connectedShop;
  const shop = shopFromQuery || shopFromSession;

  if (shop) {
    // Create state tied to session
    const state = crypto.randomBytes(16).toString('hex');
    if (req.session) {
      req.session.oauthState = state;
      req.session.oauthShop = shop;
    }

    const redirectUri = `${APP_URL.replace(/\/$/, '')}/auth/shopify/callback`;
    const params = new URLSearchParams({
      client_id: SHOPIFY_API_KEY,
      scope: SCOPES,
      redirect_uri: redirectUri,
      state,
    });
    const installUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`;
    return res.redirect(302, installUrl);
  }

  // Otherwise show a tiny form for merchants to enter their shop domain
  res.send(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Connect Shopify</title>
        <style>body{font-family:system-ui;padding:32px;background:#f7fafc}</style>
      </head>
      <body>
        <h2>Connect your Shopify store</h2>
        <p>Enter your store domain (example: <code>your-shop.myshopify.com</code>)</p>
        <form method="POST" action="/auth/shopify/start">
          <input name="shop" placeholder="your-shop.myshopify.com" style="padding:8px;width:320px" />
          <button type="submit" style="padding:8px 12px;margin-left:8px">Connect</button>
        </form>
      </body>
    </html>
  `);
});

app.post('/auth/shopify/start', (req, res) => {
  const shop = (req.body.shop || '').trim();
  if (!shop) return res.status(400).send('Missing shop domain');

  // Create a per-session state value to prevent CSRF and tie this OAuth flow to the user's session
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.oauthShop = shop;

  const redirectUri = `${HOST.replace(/\/$/, '')}/auth/shopify/callback`;
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  const installUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  res.redirect(installUrl);
});

// Verify HMAC helper
function verifyHmac(query) {
  const { hmac } = query;
  if (!hmac) return false;

  const map = Object.assign({}, query);
  delete map.hmac;
  delete map.signature;

  const message = Object.keys(map)
    .sort()
    .map((k) => `${k}=${map[k]}`)
    .join('&');

  const generated = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(generated, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch (e) {
    return false;
  }
}

app.get('/auth/shopify/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  if (!shop || !code || !state) return res.status(400).send('Missing required query params');

  // Validate state against session-stored value
  const expectedState = req.session && req.session.oauthState;
  const expectedShop = req.session && req.session.oauthShop;
  if (!expectedState || expectedState !== state || !expectedShop || expectedShop !== shop) {
    return res.status(400).send('Invalid state or session mismatch');
  }

  // Verify HMAC
  if (!verifyHmac(req.query)) return res.status(400).send('HMAC validation failed');

  try {
    const tokenResp = await fetchFn(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      console.error('No access_token in response', tokenData);
      return res.status(500).send('Failed to get access token');
    }

    storeToken(shop, tokenData.access_token, tokenData.scope || SCOPES);
    // Clear oauth state from session and mark connected shop on session
    if (req.session) {
      delete req.session.oauthState;
      delete req.session.oauthShop;
      req.session.connectedShop = shop;
    }

    console.log(`Connected shop ${shop}. Token stored in SQLite.`);
    res.redirect('/dashboard.html?shop=' + encodeURIComponent(shop) + '&connected=1');
  } catch (err) {
    console.error('Error exchanging token', err);
    res.status(500).send('OAuth exchange failed');
  }
});

// API: list connected shops
app.get('/api/shops', (req, res) => {
  db.all(`SELECT shop, installed_at FROM tokens`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json(rows || []);
  });
});

// API: fetch products
app.get('/api/shop/:shop/products', async (req, res) => {
  const shop = req.params.shop;
  try {
    const token = await getToken(shop);
    if (!token) return res.status(404).json({ error: 'shop not connected' });

    const resp = await fetchFn(`https://${shop}/admin/api/2024-01/products.json?limit=10`, {
      headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' },
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('products fetch error', err);
    res.status(500).json({ error: 'fetch failed' });
  }
});

// API: fetch orders
app.get('/api/shop/:shop/orders', async (req, res) => {
  const shop = req.params.shop;
  try {
    const token = await getToken(shop);
    if (!token) return res.status(404).json({ error: 'shop not connected' });

    const resp = await fetchFn(`https://${shop}/admin/api/2024-01/orders.json?limit=10`, {
      headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' },
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('orders fetch error', err);
    res.status(500).json({ error: 'fetch failed' });
  }
});

// API: basic aggregated metrics for dashboard
app.get('/api/shop/:shop/metrics', async (req, res) => {
  const shop = req.params.shop;
  try {
    const token = await getToken(shop);
    if (!token) return res.status(404).json({ error: 'shop not connected' });

    // Fetch recent orders (limit 50 for demo)
    const ordersResp = await fetchFn(`https://${shop}/admin/api/2024-01/orders.json?limit=50&status=any`, {
      headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' },
    });
    const ordersData = await ordersResp.json();
    const orders = ordersData.orders || [];

    // Compute revenue and counts
    const ordersCount = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const avgOrder = ordersCount ? totalRevenue / ordersCount : 0;

    // Fetch products count (small demo: limit 250)
    const productsResp = await fetchFn(`https://${shop}/admin/api/2024-01/products.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' },
    });
    const productsData = await productsResp.json();
    const productsCount = (productsData.products || []).length;

    res.json({
      orders_count: ordersCount,
      total_revenue: totalRevenue,
      average_order_value: avgOrder,
      products_count: productsCount,
    });
  } catch (err) {
    console.error('metrics fetch error', err);
    res.status(500).json({ error: 'metrics fetch failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Aervo OAuth demo server listening on ${port}`);
});
