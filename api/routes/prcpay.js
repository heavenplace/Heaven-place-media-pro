import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { logActivity } from '../guards.js';
import { PREMIUM_PRICE_CENTS, creditEarnings, grantDownload, grantPremium } from '../payments.js';
import {
  BLOCKED_CURRENCY,
  charge,
  decimalAmount,
  isSupportedCurrency,
  normalizeCurrency,
  prcpayEnabled,
  webhookTrusted
} from '../prcpay.js';

const router = express.Router();

const SETTLED = ['succeeded', 'success', 'completed', 'paid', 'settled', 'instant', 'approved'];

// A listener pays with the card on their PrcPay account: the charge is taken server-side
// and settles at once, so access is granted in the same request — no redirect, no
// waiting for a webhook. Any PrcPay currency is accepted except PRCP.
router.post('/checkout', auth(), async (req, res) => {
  if (!prcpayEnabled()) return res.status(503).json({ error: 'PrcPay is not switched on yet' });

  const { kind, media_id = null, application_id = null, account, currency = 'USD' } = req.body ?? {};
  if (!['premium', 'download', 'licence'].includes(kind)) {
    return res.status(400).json({ error: 'Buy a Premium membership, a download or a station licence' });
  }

  const payer = String(account ?? '').trim();
  if (!payer) return res.status(400).json({ error: 'Add the PrcPay account the money should move from' });

  const code = normalizeCurrency(currency);
  if (code === BLOCKED_CURRENCY) {
    return res.status(400).json({ error: 'PRCP is not accepted — pay in any other PrcPay currency' });
  }
  if (!isSupportedCurrency(code)) return res.status(400).json({ error: 'Choose a PrcPay currency' });

  let cents;
  let description;
  let mediaId = null;
  let application = null;

  if (kind === 'premium') {
    cents = PREMIUM_PRICE_CENTS;
    description = 'StreamCast Pro Premium';
  } else if (kind === 'licence') {
    const { rows } = await q('SELECT * FROM station_applications WHERE id = $1 AND user_id = $2', [
      Number(application_id),
      req.user.id
    ]);
    application = rows[0];
    if (!application) return res.status(404).json({ error: 'That licence application could not be found' });
    if (application.fee_status === 'paid') {
      return res.status(409).json({ error: 'That licence fee has already been paid' });
    }
    cents = application.fee_cents;
    description = `Station licence — ${application.station_name} (${application.plan} plan)`;
  } else {
    const { rows } = await q('SELECT id, title, price_cents, access, downloadable FROM media WHERE id = $1', [
      Number(media_id)
    ]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'That item is not available' });
    if (item.access !== 'paid' || !item.downloadable) {
      return res.status(400).json({ error: 'That item is not sold as a paid download' });
    }
    cents = item.price_cents;
    description = item.title;
    mediaId = item.id;
  }

  const reference = `sc-${kind}-${req.user.id}-${Date.now()}`;
  let payment;
  try {
    payment = await charge({ cents, currency: code, account: payer, reference, description });
  } catch (error) {
    console.error('[api] PrcPay charge failed', error.message);
    return res.status(502).json({ error: `PrcPay could not take that payment: ${error.message}` });
  }
  if (!payment.settled) {
    return res.status(402).json({ error: 'PrcPay did not settle that payment — nothing was charged' });
  }

  const amount = `${decimalAmount(cents)} ${code}`;

  if (kind === 'premium') {
    await grantPremium(req.user.id);
    await logActivity(req.user.id, 'payment', `${req.user.name} paid for Premium with PrcPay (${amount})`);
    return res.json({
      payment: { id: payment.id, status: payment.status, currency: code },
      message: 'Payment received — you are a Premium member.'
    });
  }

  // A licence fee settles here and now, so the application is marked paid and verified in
  // the same request — the state the settlement webhook below writes when the money arrives
  // unannounced, and which it then finds already paid.
  if (kind === 'licence') {
    const { rows } = await q(
      `UPDATE station_applications SET
         fee_status = 'paid', paid_at = coalesce(paid_at, now()),
         currency = $2, amount_units = $3, payment_reference = $4,
         proof_status = 'verified', proof_reviewed_at = coalesce(proof_reviewed_at, now()),
         proof_review_note = coalesce(proof_review_note, 'Settled on PrcPay')
       WHERE id = $1 RETURNING *`,
      [application.id, code, decimalAmount(cents), reference]
    );
    await logActivity(
      req.user.id,
      'payment',
      `${req.user.name} paid the licence fee for ${application.station_name} with PrcPay (${amount})`
    );
    return res.json({
      payment: { id: payment.id, status: payment.status, currency: code },
      application: rows[0],
      message: `Licence paid — the control room can open ${application.station_name}.`
    });
  }

  await grantDownload(req.user.id, mediaId);
  // Which is also what pays the station's owner: a sale credited to an owner who has a
  // PrcPay account is transferred to it there and then.
  await creditEarnings(req.user.id, mediaId, { paymentRef: payment.id });
  const { rows } = await q('SELECT title FROM media WHERE id = $1', [mediaId]);
  await logActivity(req.user.id, 'payment', `${req.user.name} bought ${rows[0]?.title || 'a download'} with PrcPay (${amount})`);

  res.json({
    payment: { id: payment.id, status: payment.status, currency: code },
    message: `Payment received — ${rows[0]?.title || 'your download'} is unlocked.`
  });
});

// What PrcPay reports when money has landed — most usefully a licence fee paid into one
// of the control room's PrcPay accounts, which is marked paid and verified the instant it
// arrives. Trusted by source address only (PRCPAY_WEBHOOK_IPS).
router.post('/webhook', async (req, res) => {
  if (!prcpayEnabled()) return res.status(503).json({ error: 'PrcPay is not switched on yet' });
  if (!webhookTrusted(req)) {
    console.warn('[api] rejected a PrcPay webhook from an untrusted address');
    return res.status(403).json({ error: 'Untrusted source' });
  }

  const body = req.body ?? {};
  const type = String(body.type ?? body.event ?? '').toLowerCase();
  const reference = String(body.reference ?? body.data?.reference ?? '').trim();
  const status = String(body.status ?? body.data?.status ?? 'succeeded').toLowerCase();

  if (!['payment.received', 'payment.succeeded', 'payment.settled', 'charge.succeeded'].includes(type)) {
    return res.json({ received: true, ignored: type || 'unlabelled notification' });
  }
  if (!reference) return res.json({ received: true, ignored: 'no reference' });
  if (!SETTLED.includes(status)) return res.json({ received: true, ignored: status });

  const { rows } = await q(
    `UPDATE station_applications SET
       fee_status = 'paid', paid_at = coalesce(paid_at, now()),
       proof_status = 'verified', proof_reviewed_at = coalesce(proof_reviewed_at, now()),
       proof_review_note = coalesce(proof_review_note, 'Settled on PrcPay')
     WHERE payment_reference = $1 AND fee_status <> 'paid'
     RETURNING user_id, station_name`,
    [reference]
  );
  if (rows.length) {
    await logActivity(rows[0].user_id, 'payment', `PrcPay settled the licence fee for ${rows[0].station_name} (${reference})`);
  }
  res.json({ received: true, settled: rows.length });
});

export default router;
