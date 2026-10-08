import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';

const router = express.Router();

// A station owner's money: what listeners have paid for their premium content,
// how much of it the control room has already settled, and the payout history.
// Sales are written to the `earnings` ledger by `creditEarnings` (api/payments.js)
// when a card payment is fulfilled.
router.get('/mine', auth(), async (req, res) => {
  const [summary, stations, payouts] = await Promise.all([
    q(
      `SELECT coalesce(sum(amount_cents),0)::int AS earned_cents,
              coalesce(sum(amount_cents) FILTER (WHERE payout_id IS NOT NULL),0)::int AS settled_cents
       FROM earnings WHERE owner_id = $1`,
      [req.user.id]
    ),
    q(
      `SELECT s.id, s.name, s.kind, s.plan,
              coalesce(sum(e.amount_cents),0)::int AS earned_cents,
              coalesce(sum(e.amount_cents) FILTER (WHERE e.payout_id IS NULL),0)::int AS outstanding_cents,
              count(e.id)::int AS sales
       FROM stations s LEFT JOIN earnings e ON e.station_id = s.id
       WHERE s.owner_id = $1 GROUP BY s.id ORDER BY s.name`,
      [req.user.id]
    ),
    q('SELECT * FROM payouts WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id])
  ]);

  const earned = summary.rows[0].earned_cents;
  const settled = summary.rows[0].settled_cents;
  res.json({
    earned_cents: earned,
    settled_cents: settled,
    outstanding_cents: earned - settled,
    stations: stations.rows,
    payouts: payouts.rows
  });
});

export default router;
