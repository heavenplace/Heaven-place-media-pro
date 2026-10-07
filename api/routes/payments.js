import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import {
  PREMIUM_PRICE_CENTS,
  fulfil,
  paymentsEnabled,
  safeOrigin,
  stripeClient
} from '../payments.js';

const router = express.Router();

// Start a Stripe Checkout session for a Premium membership or a single paid
// download, and hand the browser the hosted payment page.
router.post('/checkout', auth(), async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Card payments are not switched on yet' });

  const { kind, media_id = null, origin } = req.body ?? {};
  if (!['premium', 'download'].includes(kind)) {
    return res.status(400).json({ error: 'Buy a Premium membership or a download' });
  }

  const webOrigin = safeOrigin(origin);
  if (!webOrigin) return res.status(503).json({ error: 'This server has no web origin configured for payments' });

  let lineItem;
  let metadata;

  if (kind === 'premium') {
    lineItem = {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: PREMIUM_PRICE_CENTS,
        recurring: { interval: 'month' },
        product_data: { name: 'StreamCast Pro Premium' }
      }
    };
    metadata = { kind, user_id: String(req.user.id) };
  } else {
    const { rows } = await q('SELECT id, title, price_cents, access, downloadable FROM media WHERE id = $1', [Number(media_id)]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'That item is not available' });
    if (item.access !== 'paid' || !item.downloadable) {
      return res.status(400).json({ error: 'That item is not sold as a paid download' });
    }
    lineItem = {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: item.price_cents,
        product_data: { name: item.title }
      }
    };
    metadata = { kind, user_id: String(req.user.id), media_id: String(item.id) };
  }

  const session = await stripe.checkout.sessions.create({
    mode: kind === 'premium' ? 'subscription' : 'payment',
    line_items: [lineItem],
    client_reference_id: String(req.user.id),
    metadata,
    subscription_data: kind === 'premium' ? { metadata } : undefined,
    success_url: `${webOrigin}/premium?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${webOrigin}/premium?checkout=cancelled`
  });

  res.json({ url: session.url, id: session.id });
});

// Called when the browser lands back on the success url: confirms the payment
// with Stripe and grants access, so checkout completes without a webhook.
router.post('/confirm', auth(), async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Card payments are not switched on yet' });

  const { session_id } = req.body ?? {};
  if (!session_id) return res.status(400).json({ error: 'Missing checkout session' });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(String(session_id), { expand: ['subscription'] });
  } catch {
    return res.status(404).json({ error: 'That checkout session could not be found' });
  }

  if (Number(session.metadata?.user_id) !== req.user.id) {
    return res.status(403).json({ error: 'That checkout session belongs to another account' });
  }

  const result = await fulfil(session);
  if (!result) return res.status(409).json({ error: 'That payment has not completed yet' });
  res.json(result);
});

export default router;
