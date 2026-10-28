require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const customers = require('./customerService');
const agent = require('./agent');

const app = express();
const PORT = process.env.PORT || 4000;

// Allow cross-origin requests (frontend runs on a different port)
app.use(cors());
app.use(express.json());

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/', (_req, res) => res.redirect('/swagger'));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parseId = (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Invalid id' }); return null; }
  return id;
};

app.get('/api/customers', wrap(async (req, res) => {
  res.json(req.query.name ? await customers.searchByName(req.query.name) : await customers.getAll());
}));

app.get('/api/customers/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const c = await customers.getById(id);
  c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
}));

app.post('/api/customers', wrap(async (req, res) => {
  if (!req.body?.name?.trim()) return res.status(400).json({ error: 'name is required' });
  res.status(201).json(await customers.create(req.body));
}));

app.put('/api/customers/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const c = await customers.update(id, req.body || {});
  c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
}));

app.delete('/api/customers/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const c = await customers.remove(id);
  c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
}));

app.post('/api/agent', wrap(async (req, res) => {
  const { message, history } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
  res.json(await agent.chat(message, Array.isArray(history) ? history : []));
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}  |  Swagger: http://localhost:${PORT}/swagger`));
