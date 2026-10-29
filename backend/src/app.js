require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerSpec = require('./swagger');
const customers = require('./customerService');
const agent = require('./agent');
const users = require('./userService');
const bcrypt = require('bcryptjs');
const { signToken, requireAuth } = require('./auth');

const app = express();

// Allow cross-origin requests (frontend runs on a different port)
app.use(cors());
app.use(express.json());

// Swagger UI is loaded from a CDN: swagger-ui-express serves assets from node_modules,
// which are not bundled into Vercel serverless functions.
const SWAGGER_UI_VERSION = '5.17.14';
const swaggerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Customer API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({ url: '/swagger/openapi.json', dom_id: '#swagger-ui', persistAuthorization: true });
    };
  </script>
</body>
</html>`;

app.get('/swagger/openapi.json', (_req, res) => res.json(swaggerSpec));
app.get(['/swagger', '/swagger/'], (_req, res) => res.type('html').send(swaggerHtml));
app.get('/', (_req, res) => res.redirect('/swagger'));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parseId = (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Invalid id' }); return null; }
  return id;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'valid email is required' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }
  // role is never taken from the client
  res.status(201).json(await users.create({ name: name.trim(), email: email.trim(), password }));
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const u = await users.findByEmail(String(email));
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const { password_hash, ...user } = u;
  res.json({ token: signToken(user), user });
}));

app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const u = await users.getById(req.user.user_id);
  u ? res.json(u) : res.status(401).json({ error: 'User no longer exists' });
}));

// Everything below requires a valid token; handlers scope data to req.user
app.use(['/api/customers', '/api/agent'], requireAuth);

app.get('/api/customers', wrap(async (req, res) => {
  const uid = req.user.user_id;
  res.json(req.query.name ? await customers.searchByName(uid, req.query.name) : await customers.getAll(uid));
}));

app.get('/api/customers/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const c = await customers.getById(req.user.user_id, id);
  c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
}));

app.post('/api/customers', wrap(async (req, res) => {
  if (!req.body?.name?.trim()) return res.status(400).json({ error: 'name is required' });
  res.status(201).json(await customers.create(req.user.user_id, req.body));
}));

app.put('/api/customers/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const c = await customers.update(req.user.user_id, id, req.body || {});
  c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
}));

app.delete('/api/customers/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const c = await customers.remove(req.user.user_id, id);
  c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
}));

app.post('/api/agent', wrap(async (req, res) => {
  const { message, history } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
  res.json(await agent.chat(message, Array.isArray(history) ? history : [], req.user.user_id));
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
