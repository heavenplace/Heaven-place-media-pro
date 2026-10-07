import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { logActivity } from '../guards.js';

const router = express.Router();
router.use(auth({ admin: true }));

// Live counters for the control room header.
router.get('/overview', async (_req, res) => {
  const { rows } = await q(`
    SELECT
      (SELECT count(*)::int FROM stations) AS stations,
      (SELECT count(*)::int FROM stations WHERE status = 'pending') AS pending_stations,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM media) AS media,
      (SELECT count(*)::int FROM podcasts) AS podcasts,
      (SELECT count(*)::int FROM live_sessions WHERE status = 'live' AND expires_at > now()) AS live_now,
      (SELECT count(DISTINCT user_id)::int FROM activity WHERE type = 'listen' AND created_at > now() - interval '5 minutes') AS active_listeners,
      (SELECT count(*)::int FROM access_requests WHERE status = 'pending') AS pending_requests,
      (SELECT count(*)::int FROM entitlements) AS unlocks
  `);
  res.json({ overview: rows[0] });
});

// Active listeners and total air time, per station.
router.get('/stations-summary', async (_req, res) => {
  const { rows } = await q(`
    SELECT s.id, s.name, s.kind, s.status, s.verified,
      count(l.id)::int AS sessions,
      coalesce(round(sum(EXTRACT(EPOCH FROM (coalesce(l.ended_at, least(l.expires_at, now())) - l.started_at)) / 60)), 0)::int AS minutes_aired,
      (SELECT count(DISTINCT a.user_id)::int FROM activity a
        WHERE a.station_id = s.id AND a.type = 'listen' AND a.created_at > now() - interval '5 minutes') AS active_listeners
    FROM stations s LEFT JOIN live_sessions l ON l.station_id = s.id
    GROUP BY s.id ORDER BY s.name
  `);
  res.json({ stations: rows });
});

router.get('/activity', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  const { rows } = await q(
    `SELECT a.*, u.name AS user_name, u.email AS user_email, s.name AS station_name
     FROM activity a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN stations s ON s.id = a.station_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ activity: rows });
});

router.get('/stations', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) {
    params.push(req.query.status);
    where = 'WHERE s.status = $1';
  }
  const { rows } = await q(
    `SELECT s.*, u.name AS owner_name,
       (SELECT count(*)::int FROM media m WHERE m.station_id = s.id) AS media_count
     FROM stations s LEFT JOIN users u ON u.id = s.owner_id ${where} ORDER BY s.created_at DESC`,
    params
  );
  res.json({ stations: rows });
});

router.patch('/stations/:id', async (req, res) => {
  const { status, verified } = req.body ?? {};
  if (status && !['pending', 'approved', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Unknown station status' });
  }
  const sets = [];
  const params = [];
  if (status) {
    params.push(status);
    sets.push(`status = $${params.length}`);
  }
  if (verified !== undefined) {
    params.push(Boolean(verified));
    sets.push(`verified = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(Number(req.params.id));
  const { rows } = await q(`UPDATE stations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'Station not found' });
  await logActivity(req.user.id, 'station_review', `${req.user.name} set ${rows[0].name} to ${rows[0].status}`, rows[0].id);
  res.json({ station: rows[0] });
});

router.get('/media', async (_req, res) => {
  const { rows } = await q(
    `SELECT m.*, s.name AS station_name, s.kind AS station_kind,
       (SELECT count(*)::int FROM entitlements e WHERE e.kind = 'download' AND e.media_id = m.id) AS unlock_count
     FROM media m JOIN stations s ON s.id = m.station_id ORDER BY m.created_at DESC LIMIT 300`
  );
  res.json({ media: rows });
});

router.get('/users', async (_req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.email, u.name, u.role, u.tier, u.created_at,
       (SELECT count(*)::int FROM entitlements e WHERE e.user_id = u.id) AS unlocks,
       (SELECT max(created_at) FROM activity a WHERE a.user_id = u.id) AS last_seen
     FROM users u ORDER BY u.created_at DESC LIMIT 300`
  );
  res.json({ users: rows });
});

router.patch('/users/:id', async (req, res) => {
  const { role, tier } = req.body ?? {};
  if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Unknown role' });
  if (tier && !['free', 'premium'].includes(tier)) return res.status(400).json({ error: 'Unknown tier' });
  const sets = [];
  const params = [];
  if (role) {
    params.push(role);
    sets.push(`role = $${params.length}`);
  }
  if (tier) {
    params.push(tier);
    sets.push(`tier = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(Number(req.params.id));
  const { rows } = await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, email, name, role, tier`, params);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  await logActivity(req.user.id, 'user_update', `${req.user.name} updated ${rows[0].name} (${rows[0].role}/${rows[0].tier})`);
  res.json({ user: rows[0] });
});

router.get('/requests', async (_req, res) => {
  const { rows } = await q(
    `SELECT r.*, u.name AS user_name, u.email AS user_email, m.title AS media_title, m.price_cents
     FROM access_requests r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN media m ON m.id = r.media_id
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`
  );
  res.json({ requests: rows });
});

// Approving grants access: a membership for premium, a single unlock for a download.
router.patch('/requests/:id', async (req, res) => {
  const { status } = req.body ?? {};
  if (!['approved', 'denied', 'pending'].includes(status)) return res.status(400).json({ error: 'Unknown request status' });

  const { rows: found } = await q('SELECT * FROM access_requests WHERE id = $1', [req.params.id]);
  if (!found.length) return res.status(404).json({ error: 'Request not found' });
  const request = found[0];

  const { rows } = await q('UPDATE access_requests SET status = $1 WHERE id = $2 RETURNING *', [status, request.id]);

  if (status === 'approved' && request.kind === 'premium') {
    await q("UPDATE users SET tier = 'premium' WHERE id = $1", [request.user_id]);
    const existing = await q("SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active'", [request.user_id]);
    if (existing.rows.length) {
      await q("UPDATE subscriptions SET current_period_end = now() + interval '30 days' WHERE id = $1", [existing.rows[0].id]);
    } else {
      await q("INSERT INTO subscriptions (user_id, status, current_period_end) VALUES ($1,'active', now() + interval '30 days')", [request.user_id]);
    }
  }
  if (status === 'approved' && request.kind === 'download' && request.media_id) {
    await q("INSERT INTO entitlements (user_id, kind, media_id) VALUES ($1,'download',$2)", [request.user_id, request.media_id]);
  }
  if (request.kind === 'premium' && status !== 'approved') {
    await q("UPDATE subscriptions SET status = 'cancelled' WHERE user_id = $1", [request.user_id]);
  }

  await logActivity(req.user.id, 'request_review', `${req.user.name} marked a ${request.kind} request ${status}`);
  res.json({ request: rows[0] });
});

router.get('/live', async (_req, res) => {
  const { rows } = await q(
    `SELECT l.*, s.name AS station_name, s.kind AS station_kind
     FROM live_sessions l JOIN stations s ON s.id = l.station_id
     ORDER BY (l.status = 'live' AND l.expires_at > now()) DESC, l.started_at DESC LIMIT 100`
  );
  res.json({ live: rows });
});

router.post('/live/:id/end', async (req, res) => {
  const { rows } = await q("UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE id = $1 RETURNING *", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Live session not found' });
  await logActivity(req.user.id, 'live_end', `${req.user.name} took ${rows[0].title} off air`, rows[0].station_id);
  res.json({ session: rows[0] });
});

export default router;
