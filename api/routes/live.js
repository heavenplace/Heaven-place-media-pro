import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { canManageStation, logActivity } from '../guards.js';

const router = express.Router();

const SELECT = `SELECT l.*, s.name AS station_name, s.kind AS station_kind, s.artwork_url AS station_artwork,
  m.title AS media_title, m.type AS media_type, m.url AS media_url, m.access AS media_access
  FROM live_sessions l
  JOIN stations s ON s.id = l.station_id
  LEFT JOIN media m ON m.id = l.media_id`;

// Everything currently on air.
router.get('/', async (_req, res) => {
  const { rows } = await q(
    `${SELECT} WHERE l.status = 'live' AND l.expires_at > now() ORDER BY l.started_at DESC`
  );
  res.json({ live: rows });
});

// Put an uploaded file (or a phone recording) on air for a set window.
router.post('/', auth(), async (req, res) => {
  const { station_id, media_id, title, kind = 'audio', hours = 1 } = req.body ?? {};
  const stationId = Number(station_id);
  const window = Math.min(Math.max(Number(hours) || 1, 1), 24);

  if (!(await canManageStation(req.user, stationId))) {
    return res.status(403).json({ error: 'You can only go live on a station you own' });
  }

  let mediaTitle = title;
  if (media_id) {
    const { rows } = await q('SELECT title FROM media WHERE id = $1 AND station_id = $2', [Number(media_id), stationId]);
    if (!rows.length) return res.status(400).json({ error: 'That media does not belong to this station' });
    mediaTitle = mediaTitle || rows[0].title;
  }
  if (!mediaTitle) return res.status(400).json({ error: 'A live title or a media item is required' });

  await q("UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE station_id = $1 AND status = 'live'", [stationId]);

  const { rows } = await q(
    `INSERT INTO live_sessions (station_id, media_id, title, kind, expires_at, created_by)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' hours')::interval, $6) RETURNING *`,
    [stationId, media_id ? Number(media_id) : null, mediaTitle, kind, window, req.user.id]
  );
  await logActivity(req.user.id, 'live_start', `${req.user.name} put ${mediaTitle} on air`, stationId);
  res.status(201).json({ session: rows[0] });
});

router.post('/:id/end', auth(), async (req, res) => {
  const { rows: found } = await q('SELECT * FROM live_sessions WHERE id = $1', [req.params.id]);
  if (!found.length) return res.status(404).json({ error: 'That live session is no longer available' });
  if (!(await canManageStation(req.user, found[0].station_id))) {
    return res.status(403).json({ error: 'Only the station owner or an admin can end this session' });
  }
  const { rows } = await q("UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE id = $1 RETURNING *", [req.params.id]);
  await logActivity(req.user.id, 'live_end', `${req.user.name} ended ${found[0].title}`, found[0].station_id);
  res.json({ session: rows[0] });
});

router.post('/:id/extend', auth(), async (req, res) => {
  const hours = Math.min(Math.max(Number(req.body?.hours) || 1, 1), 24);
  const { rows: found } = await q('SELECT * FROM live_sessions WHERE id = $1', [req.params.id]);
  if (!found.length) return res.status(404).json({ error: 'That live session is no longer available' });
  if (!(await canManageStation(req.user, found[0].station_id))) {
    return res.status(403).json({ error: 'Only the station owner or an admin can extend this session' });
  }
  const { rows } = await q(
    "UPDATE live_sessions SET status = 'live', expires_at = expires_at + ($1 || ' hours')::interval WHERE id = $2 RETURNING *",
    [hours, req.params.id]
  );
  await logActivity(req.user.id, 'live_extend', `${req.user.name} extended ${found[0].title}`, found[0].station_id);
  res.json({ session: rows[0] });
});

export default router;
