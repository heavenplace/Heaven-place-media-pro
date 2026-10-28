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

// Where this owner wants settled earnings sent. One profile per account — an owner can
// have several stations — and the control room reads it when it records a manual payout.
// An owner who names a PrcPay account is paid instantly instead: every sale is
// transferred there as it lands (`settleInstantly` in api/payments.js), so the bank
// fields are only needed by owners who have not set one.
const ACCOUNT_FIELDS = ['account_name', 'bank_name', 'account_number', 'routing_number', 'prcpay_account', 'prcpay_currency', 'note'];

const cleanAccount = (body) => {
  const account = Object.fromEntries(ACCOUNT_FIELDS.map((name) => [name, String(body?.[name] ?? '').trim()]));
  account.routing_number ||= null;
  account.note ||= null;
  account.prcpay_account ||= null;
  account.prcpay_currency = account.prcpay_currency ? account.prcpay_currency.toUpperCase() : null;
  return account;
};

router.get('/account', auth(), async (req, res) => {
  const { rows } = await q('SELECT * FROM payout_accounts WHERE user_id = $1', [req.user.id]);
  res.json({ account: rows[0] ?? null });
});

router.put('/account', auth(), async (req, res) => {
  const account = cleanAccount(req.body);
  if (!account.account_name) {
    return res.status(400).json({ error: 'The account holder is required' });
  }
  // A PrcPay account is somewhere to send the money on its own; the bank details are
  // the alternative, and were required of everyone before PrcPay existed.
  if (!account.prcpay_account && (!account.bank_name || !account.account_number)) {
    return res.status(400).json({
      error: 'Add a PrcPay account, or the bank name and account number to be paid by transfer'
    });
  }
  const { rows } = await q(
    `INSERT INTO payout_accounts (user_id, account_name, bank_name, account_number, routing_number, prcpay_account, prcpay_currency, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id) DO UPDATE SET
       account_name = excluded.account_name, bank_name = excluded.bank_name,
       account_number = excluded.account_number, routing_number = excluded.routing_number,
       prcpay_account = excluded.prcpay_account, prcpay_currency = excluded.prcpay_currency,
       note = excluded.note, updated_at = now()
     RETURNING *`,
    [
      req.user.id,
      account.account_name,
      account.bank_name || null,
      account.account_number || null,
      account.routing_number,
      account.prcpay_account,
      account.prcpay_currency,
      account.note
    ]
  );
  res.json({ account: rows[0] });
});

export default router;
