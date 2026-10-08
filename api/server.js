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
import applicationRoutes from './routes/applications.js';
import paymentAccountRoutes from './routes/paymentAccounts.js';
import earningsRoutes from './routes/earnings.js';
import paymentRoutes from './routes/payments.js';
import prcpayRoutes from './routes/prcpay.js';
import adminRoutes from './routes/admin.js';
import { googleEnabled } from './google.js';
import { PREMIUM_PRICE_CENTS, STATION_FEES, paymentsEnabled, webhook as stripeWebhook } from './payments.js';
import { prcpayEnabled } from './prcpay.js';

const app = express();
const PORT = Number(process.env.PORT) || 8000;

// Stripe's signature check needs the untouched request body, so the webhook is
// mounted ahead of the JSON parser.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

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

// Public configuration the web app reads on load (a Google client id is not a
// secret — it is visible in any page that uses it).
app.get('/api/config', (_req, res) =>
  res.json({
    google_client_id: googleEnabled() ? process.env.GOOGLE_CLIENT_ID : null,
    payments_enabled: paymentsEnabled(),
    prcpay_enabled: prcpayEnabled(),
    premium_price_cents: PREMIUM_PRICE_CENTS,
    station_fees: STATION_FEES
  })
);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));
app.use('/api/uploads', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/podcasts', podcastRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/payment-accounts', paymentAccountRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/prcpay', prcpayRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${path.posix.join('/', req.path)}` }));

app.use((error, _req, res, _next) => {
  // A body the client could not serialize is the client's mistake, not a server
  // fault: answer 400 with one short line instead of dumping a parse stack (and the
  // offending body) into the service log.
  if (error.type === 'entity.parse.failed') {
    console.warn('[api] rejected a request with a malformed JSON body');
    return res.status(400).json({ error: 'The request body is not valid JSON' });
  }
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
