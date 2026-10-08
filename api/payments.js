import Stripe from 'stripe';
import { q } from './db.js';
import { logActivity } from './guards.js';

// Card checkout runs through Stripe Checkout: the API creates a hosted session
// and the browser is sent there. A purchase is fulfilled in two places that
// share fulfil() below — the /api/payments/confirm call the browser makes when
// it lands back on the success url, and the Stripe webhook (the reliable path
// once a real deployment can receive webhooks).

export const PREMIUM_PRICE_CENTS = Number(process.env.PREMIUM_PRICE_CENTS) || 600;

// A station licence: $5 on the standard plan, $15 on premium. Premium is what
// carries the right to publish premium and paid content.
export const STATION_FEES = {
  standard: Number(process.env.STATION_FEE_STANDARD_CENTS) || 500,
  premium: Number(process.env.STATION_FEE_PREMIUM_CENTS) || 1500
};

export const stationFee = (plan) => STATION_FEES[plan] ?? STATION_FEES.standard;

export const paymentsEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

let client = null;

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

// The success/cancel urls must point back at the web app. Only origins we know
// about are accepted, so a signed-in user cannot bounce someone to another site.
const allowedOrigins = () =>
  [process.env.WEB_ORIGIN, ...(process.env.CORS_ORIGIN || '').split(','), 'http://localhost:3000', 'http://localhost:5173']
    .map((origin) => String(origin || '').trim().replace(/\/$/, ''))
    .filter(Boolean);

export function safeOrigin(requested) {
  const origin = String(requested || '').trim().replace(/\/$/, '');
  if (origin && allowedOrigins().includes(origin)) return origin;
  return allowedOrigins()[0] || null;
}

const fulfilPremium = async (userId, periodEnd) => {
  await q("UPDATE users SET tier = 'premium' WHERE id = $1", [userId]);
  const end = periodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { rows } = await q("SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active'", [userId]);
  if (rows.length) await q('UPDATE subscriptions SET current_period_end = $2 WHERE id = $1', [rows[0].id, end]);
  else await q("INSERT INTO subscriptions (user_id, status, current_period_end) VALUES ($1,'active',$2)", [userId, end]);
};

const fulfilDownload = async (userId, mediaId) => {
  const { rows } = await q(
    "SELECT id FROM entitlements WHERE user_id = $1 AND kind = 'download' AND media_id = $2",
    [userId, mediaId]
  );
  if (!rows.length) {
    await q("INSERT INTO entitlements (user_id, kind, media_id) VALUES ($1,'download',$2)", [userId, mediaId]);
  }
};

// What a listener paid for an item is money the station that published it earned.
// Keying the row on the checkout session keeps a double fulfilment (confirm +
// webhook) to a single sale. A membership is platform-wide with no single station
// behind it, so only item sales reach the ledger.
const creditEarnings = async (session, userId, mediaId) => {
  const { rows } = await q(
    `SELECT m.price_cents, s.id AS station_id, s.owner_id
     FROM media m JOIN stations s ON s.id = m.station_id WHERE m.id = $1`,
    [mediaId]
  );
  const sale = rows[0];
  if (!sale?.owner_id) return;
  await q(
    `INSERT INTO earnings (station_id, owner_id, buyer_id, media_id, kind, amount_cents, stripe_session_id)
     VALUES ($1,$2,$3,$4,'download',$5,$6) ON CONFLICT (stripe_session_id) DO NOTHING`,
    [sale.station_id, sale.owner_id, userId, mediaId, sale.price_cents, session.id]
  );
};

// Stripe moved the period end onto the subscription item in newer API
// versions, so read whichever one this account returns; fall back to 30 days.
const subscriptionPeriodEnd = (subscription) => {
  if (!subscription || typeof subscription !== 'object') return null;
  const seconds = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
};

/**
 * Grants what a paid Checkout Session bought. Safe to call twice for the same
 * session (confirm + webhook); the grants below are idempotent.
 */
export async function fulfil(session) {
  const kind = session?.metadata?.kind;
  const userId = Number(session?.metadata?.user_id);
  if (!userId || !['premium', 'download', 'application'].includes(kind)) return null;

  const settled = session.mode === 'subscription' ? session.status === 'complete' : session.payment_status === 'paid';
  if (!settled) return null;

  if (kind === 'application') {
    const applicationId = Number(session.metadata.application_id);
    if (!applicationId) return null;
    const { rows } = await q(
      `UPDATE station_applications SET fee_status = 'paid', paid_at = coalesce(paid_at, now())
       WHERE id = $1 AND user_id = $2 AND fee_status <> 'paid' RETURNING station_name`,
      [applicationId, userId]
    );
    if (rows.length) await logActivity(userId, 'payment', `Paid the station licence fee for ${rows[0].station_name}`);
    return { kind: 'application', message: 'Licence fee received — the control room will review your application.' };
  }

  if (kind === 'premium') {
    await fulfilPremium(userId, subscriptionPeriodEnd(session.subscription));
    await logActivity(userId, 'payment', 'Premium membership paid by card');
    return { kind: 'premium', message: 'Payment received — you are a Premium member.' };
  }

  const mediaId = Number(session.metadata.media_id);
  if (!mediaId) return null;
  await fulfilDownload(userId, mediaId);
  await creditEarnings(session, userId, mediaId);
  const { rows } = await q('SELECT title FROM media WHERE id = $1', [mediaId]);
  await logActivity(userId, 'payment', `Paid for ${rows[0]?.title || 'a download'} by card`);
  return { kind: 'download', message: `Payment received — ${rows[0]?.title || 'your download'} is unlocked.` };
}

// Mounted before express.json() so the raw body is available for signature checks.
export async function webhook(req, res) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return res.status(503).json({ error: 'Stripe webhooks are not configured' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (error) {
    return res.status(400).json({ error: `Webhook signature check failed: ${error.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    try {
      await fulfil(event.data.object);
    } catch (error) {
      console.error('[api] webhook fulfilment failed', error);
      return res.status(500).json({ error: 'Could not record that payment' });
    }
  }
  res.json({ received: true });
}
