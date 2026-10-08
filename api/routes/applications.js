import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { logActivity } from '../guards.js';
import { licenceUnits, safeOrigin, stationFee, stripeClient } from '../payments.js';

const router = express.Router();

// A listener applies to open a station of their own: FM only, or FM with a TV
// twin. The licence fee is $5 on the standard plan and $15 on premium — premium
// is what carries the right to publish premium and paid content. The fee is paid
// by card when the application is submitted; the control room opens the station
// once the fee has cleared.
export const COVERAGES = ['fm', 'fm_tv'];
export const PLANS = ['standard', 'premium'];

export const coverageLabel = (coverage) => (coverage === 'fm_tv' ? 'FM + TV' : 'FM');

router.post('/', auth(), async (req, res) => {
  const { station_name, description = '', coverage = 'fm', plan = 'standard' } = req.body ?? {};
  const name = String(station_name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'A station name is required' });
  if (!COVERAGES.includes(coverage)) return res.status(400).json({ error: 'Choose FM only or FM + TV' });
  if (!PLANS.includes(plan)) return res.status(400).json({ error: 'Choose the standard or premium plan' });

  const { rows } = await q(
    `INSERT INTO station_applications (user_id, station_name, description, coverage, plan, fee_cents)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.id, name, String(description ?? ''), coverage, plan, stationFee(plan)]
  );
  await logActivity(req.user.id, 'station_apply', `${req.user.name} applied to open ${name} (${plan}, ${coverageLabel(coverage)})`);
  res.status(201).json({ application: rows[0] });
});

router.get('/mine', auth(), async (req, res) => {
  const { rows } = await q(
    'SELECT * FROM station_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json({ applications: rows });
});

// Hands the applicant to Stripe Checkout for the licence fee.
router.post('/:id/checkout', auth(), async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Card payments are not switched on yet' });

  const { rows } = await q('SELECT * FROM station_applications WHERE id = $1 AND user_id = $2', [
    Number(req.params.id),
    req.user.id
  ]);
  const application = rows[0];
  if (!application) return res.status(404).json({ error: 'That application could not be found' });
  if (application.fee_status === 'paid') return res.status(409).json({ error: 'That licence fee has already been paid' });

  const webOrigin = safeOrigin(req.body?.origin);
  if (!webOrigin) return res.status(503).json({ error: 'This server has no web origin configured for payments' });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: application.fee_cents,
          product_data: { name: `Station licence — ${application.station_name} (${application.plan} plan)` }
        }
      }
    ],
    client_reference_id: String(req.user.id),
    metadata: { kind: 'application', user_id: String(req.user.id), application_id: String(application.id) },
    success_url: `${webOrigin}/apply?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${webOrigin}/apply?checkout=cancelled`
  });

  await q('UPDATE station_applications SET checkout_session_id = $2 WHERE id = $1', [application.id, session.id]);
  res.json({ url: session.url, id: session.id });
});

// The applicant has sent the fee to one of the control room's accounts and hands over the
// proof. The amount is derived from that account's rate, so it is exactly the plan's $5 /
// $15 licence — never less or more. The control room verifies the proof, which marks the
// fee paid and lets the station be opened on that plan.
router.post('/:id/proof', auth(), async (req, res) => {
  const applicationId = Number(req.params.id);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return res.status(404).json({ error: 'That application could not be found' });
  }
  const { rows } = await q('SELECT * FROM station_applications WHERE id = $1 AND user_id = $2', [
    applicationId,
    req.user.id
  ]);
  const application = rows[0];
  if (!application) return res.status(404).json({ error: 'That application could not be found' });
  if (application.fee_status === 'paid') return res.status(409).json({ error: 'That licence fee has already been paid' });

  const accountId = Number(req.body?.payment_account_id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return res.status(400).json({ error: 'Choose one of the payment accounts' });
  }
  const { rows: found } = await q('SELECT * FROM payment_accounts WHERE id = $1 AND active', [accountId]);
  const account = found[0];
  if (!account) return res.status(400).json({ error: 'Choose one of the payment accounts' });

  const reference = String(req.body?.reference ?? '').trim();
  if (!reference) return res.status(400).json({ error: 'Add the reference or transaction id from your payment' });

  const amount = licenceUnits(account, application.plan);
  if (!amount) return res.status(400).json({ error: 'That account has no exchange rate set — tell the control room' });

  const { rows: updated } = await q(
    `UPDATE station_applications SET
       payment_account_id = $2, currency = $3, amount_units = $4, payment_reference = $5,
       proof_url = $6, proof_note = $7, proof_status = 'submitted', proof_submitted_at = now(),
       proof_review_note = null, proof_reviewed_by = null, proof_reviewed_at = null
     WHERE id = $1 RETURNING *`,
    [
      application.id,
      account.id,
      account.currency,
      amount,
      reference,
      String(req.body?.proof_url ?? '').trim() || null,
      String(req.body?.note ?? '').trim() || null
    ]
  );
  await logActivity(
    req.user.id,
    'payment',
    `${req.user.name} sent the licence fee for ${application.station_name} (${reference})`
  );
  res.json({ application: updated[0] });
});

export default router;
