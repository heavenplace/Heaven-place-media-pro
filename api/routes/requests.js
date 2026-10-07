import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { logActivity } from '../guards.js';

const router = express.Router();

// What this listener has asked for, and what they have already unlocked.
router.get('/mine', auth(), async (req, res) => {
  const [requests, unlocks] = await Promise.all([
    q(
      `SELECT r.*, m.title AS media_title, m.type AS media_type FROM access_requests r
       LEFT JOIN media m ON m.id = r.media_id WHERE r.user_id = $1 ORDER BY r.created_at DESC`,
      [req.user.id]
    ),
    q(
      `SELECT e.*, m.title AS media_title, m.type AS media_type, m.url AS media_url FROM entitlements e
       JOIN media m ON m.id = e.media_id WHERE e.user_id = $1 ORDER BY e.created_at DESC`,
      [req.user.id]
    )
  ]);
  const subscription = await q(
    "SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [req.user.id]
  );
  res.json({ requests: requests.rows, unlocks: unlocks.rows, subscription: subscription.rows[0] ?? null });
});

router.post('/', auth(), async (req, res) => {
  const { kind, media_id = null, note = '' } = req.body ?? {};
  if (!['premium', 'download'].includes(kind)) return res.status(400).json({ error: 'Ask for a premium membership or a download' });
  if (kind === 'download' && !media_id) return res.status(400).json({ error: 'Which download would you like?' });

  const { rows } = await q(
    'INSERT INTO access_requests (user_id, kind, media_id, note) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, kind, media_id ? Number(media_id) : null, note]
  );
  await logActivity(req.user.id, 'access_request', `${req.user.name} requested ${kind === 'premium' ? 'Premium' : 'a download'}`);
  res.status(201).json({ request: rows[0] });
});

export default router;
