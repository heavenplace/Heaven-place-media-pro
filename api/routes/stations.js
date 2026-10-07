import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { canManageStation, logActivity } from '../guards.js';

const router = express.Router();

const LIVE_JOIN = `EXISTS (SELECT 1 FROM live_sessions l WHERE l.station_id = s.id AND l.status = 'live' AND l.expires_at > now()) AS is_live`;

function filters(query) {
  const where = [];
  const params = [];
  if (query.kind) {
    params.push(query.kind);
    where.push(`s.kind = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    where.push(`(s.name ILIKE $${params.length} OR coalesce(s.description,'') ILIKE $${params.length})`);
  }
  return { where, params };
}

// Public directory — approved stations only.
router.get('/', async (req, res) => {
  const { where, params } = filters(req.query);
  where.push("s.status = 'approved'");
  const { rows } = await q(
    `SELECT s.*, u.name AS owner_name,
            (SELECT count(*)::int FROM media m WHERE m.station_id = s.id AND m.visible) AS media_count,
            ${LIVE_JOIN}
     FROM stations s LEFT JOIN users u ON u.id = s.owner_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.verified DESC, s.name`,
    params
  );
  res.json({ stations: rows });
});

// Stations this user owns, whatever their review status, for the studio.
router.get('/mine', auth(), async (req, res) => {
  const { rows } = await q(
    `SELECT s.*,
            (SELECT count(*)::int FROM media m WHERE m.station_id = s.id) AS media_count,
            ${LIVE_JOIN}
     FROM stations s WHERE s.owner_id = $1 ORDER BY s.created_at DESC`,
    [req.user.id]
  );
  res.json({ stations: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT s.*, u.name AS owner_name,
            (SELECT count(*)::int FROM media m WHERE m.station_id = s.id AND m.visible) AS media_count,
            ${LIVE_JOIN}
     FROM stations s LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Station not found' });
  const station = rows[0];

  const [media, live] = await Promise.all([
    q('SELECT * FROM media WHERE station_id = $1 AND visible ORDER BY created_at DESC', [station.id]),
    q("SELECT * FROM live_sessions WHERE station_id = $1 AND status = 'live' AND expires_at > now() ORDER BY started_at DESC", [station.id])
  ]);
  res.json({ station, media: media.rows, live: live.rows[0] ?? null });
});

// Any signed-in user may propose a station; the control room approves it.
router.post('/', auth(), async (req, res) => {
  const { name, kind = 'radio', description = '', artwork_url = '' } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'A station name is required' });
  if (!['radio', 'tv'].includes(kind)) return res.status(400).json({ error: 'Station type must be radio or tv' });

  const approved = req.user.role === 'admin';
  const { rows } = await q(
    `INSERT INTO stations (name, kind, description, artwork_url, status, owner_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name.trim(), kind, description, artwork_url, approved ? 'approved' : 'pending', req.user.id]
  );
  await logActivity(req.user.id, 'station_create', `${req.user.name} created ${name.trim()}`, rows[0].id);
  res.status(201).json({ station: rows[0] });
});

router.patch('/:id', auth(), async (req, res) => {
  const stationId = Number(req.params.id);
  if (!(await canManageStation(req.user, stationId))) {
    return res.status(403).json({ error: 'Only the station owner or an admin can edit this station' });
  }
  const allowed = ['name', 'kind', 'description', 'artwork_url'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) {
      params.push(req.body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(stationId);
  const { rows } = await q(`UPDATE stations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  await logActivity(req.user.id, 'station_update', `${req.user.name} edited ${rows[0].name}`, stationId);
  res.json({ station: rows[0] });
});

router.delete('/:id', auth({ admin: true }), async (req, res) => {
  await q('DELETE FROM stations WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
