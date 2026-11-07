import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMatches } from './matching.js';
import { createStore } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const store = createStore(process.env.DATA_FILE || path.resolve(here, '../data/community.json'));
const app = express();
const port = process.env.PORT || 5000;
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '64kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'BridgeUp API', version: '2.0.0' }));
app.get('/api/community', (_req, res) => res.json(store.read()));
app.put('/api/community', (req, res) => {
  try { return res.json({ saved: true, community: store.write(req.body || {}) }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});
app.get('/api/matches', (_req, res) => {
  const community = store.read();
  res.json({ matches: findMatches(community.requests, community.offers) });
});
app.post('/api/matches/preview', (req, res) => {
  const { requests, offers } = req.body || {};
  if (!Array.isArray(requests) || !Array.isArray(offers)) return res.status(400).json({ error: 'requests and offers must be arrays' });
  if (requests.length > 100 || offers.length > 100) return res.status(413).json({ error: 'Preview is limited to 100 requests and 100 offers' });
  return res.json({ matches: findMatches(requests, offers) });
});
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => { console.error(err.message); res.status(500).json({ error: 'Unexpected server error' }); });

if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`BridgeUp API listening on http://localhost:${port}`));
export default app;
