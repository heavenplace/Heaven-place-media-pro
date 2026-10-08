import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { withAmounts } from '../payments.js';

const router = express.Router();

// Where a station applicant can send the licence fee: the control room sets up one row
// per receiving account (a bank account in a national currency, or a crypto wallet) with
// a rate, so `standard_label` / `premium_label` are the exact $5 / $15 equivalent. Read
// by any signed-in listener as they apply.
router.get('/', auth(), async (_req, res) => {
  const { rows } = await q(
    'SELECT * FROM payment_accounts WHERE active ORDER BY method, currency, label'
  );
  res.json({ accounts: rows.map(withAmounts) });
});

export default router;
