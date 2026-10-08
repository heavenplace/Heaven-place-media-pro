import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { logActivity } from '../guards.js';
import { safeOrigin, stationFee, stripeClient } from '../payments.js';

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

export default router;
