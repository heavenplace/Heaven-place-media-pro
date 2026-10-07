import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { ensureAdmin, ensureSchema, ensureSeed } from './db.js';
import uploadRoutes, { UPLOAD_DIR } from './uploads.js';
import authRoutes from './routes/auth.js';
import stationRoutes from './routes/stations.js';
import mediaRoutes from './routes/media.js';
import liveRoutes from './routes/live.js';
import podcastRoutes from './routes/podcasts.js';
import favoriteRoutes from './routes/favorites.js';
import requestRoutes from './routes/requests.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = Number(process.env.PORT) || 8000;

app.use(express.json({ limit: '2mb' }));

// The web app proxies /api through its own origin, so CORS is only needed
// when a separate origin is configured (e.g. an external webhook or client).
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
}

app.get('/health', async (_req, res) => {
  try {
    const { rows } = await import('./db.js').then((m) => m.q('SELECT 1 AS ok'));
    res.json({ ok: rows[0].ok === 1, service: 'api' });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));
app.use('/api/uploads', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/podcasts', podcastRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${path.posix.join('/', req.path)}` }));

app.use((error, _req, res, _next) => {
  console.error('[api]', error);
  const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  res.status(status).json({ error: error.message || 'Something went wrong' });
});

async function start() {
  await ensureSchema();
  await ensureAdmin();
  if (process.env.SEED_DEMO === '1') await ensureSeed();
  app.listen(PORT, '0.0.0.0', () => console.log(`[api] listening on :${PORT}`));
}

start().catch((error) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});
