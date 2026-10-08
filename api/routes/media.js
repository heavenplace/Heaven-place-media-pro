import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { canManageStation, hasDownloadEntitlement, isPremium, logActivity } from '../guards.js';

const router = express.Router();

const SELECT = `SELECT m.*, s.name AS station_name, s.kind AS station_kind, s.artwork_url AS station_artwork,
  (SELECT count(*)::int FROM entitlements e WHERE e.kind = 'download' AND e.media_id = m.id) AS unlock_count
  FROM media m JOIN stations s ON s.id = m.station_id`;

router.get('/', async (req, res) => {
  const where = ['m.visible'];
  const params = [];
  if (req.query.type) {
    params.push(req.query.type);
    where.push(`m.type = $${params.length}`);
  }
  if (req.query.access) {
    params.push(req.query.access);
    where.push(`m.access = $${params.length}`);
  }
  if (req.query.station_id) {
    params.push(Number(req.query.station_id));
    where.push(`m.station_id = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(m.title ILIKE $${params.length} OR coalesce(m.description,'') ILIKE $${params.length})`);
  }
  const { rows } = await q(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC LIMIT 200`, params);
  res.json({ media: rows });
});

// Everything on the stations this user owns — including hidden items — for the
// owner dashboard. Admins manage media from the control room instead.
router.get('/mine', auth(), async (req, res) => {
  const { rows } = await q(
    `${SELECT} WHERE m.station_id IN (SELECT id FROM stations WHERE owner_id = $1) ORDER BY m.created_at DESC LIMIT 300`,
    [req.user.id]
  );
  res.json({ media: rows });
});

router.post('/', auth(), async (req, res) => {
  const { station_id, type = 'audio', title, description = '', url, access = 'free', price_cents = 0, duration_seconds = 0, source = 'upload', downloadable = true } = req.body ?? {};
  if (!title || !url) return res.status(400).json({ error: 'A title and a file or link are required' });
  if (!['audio', 'video'].includes(type)) return res.status(400).json({ error: 'Media type must be audio or video' });
  if (!(await canManageStation(req.user, Number(station_id)))) {
    return res.status(403).json({ error: 'You can only publish to a station you own' });
  }
  if (access === 'paid' && Number(price_cents) < 50) {
    return res.status(400).json({ error: 'Paid downloads must be priced at 0.50 or more' });
  }
  const { rows } = await q(
    `INSERT INTO media (station_id, type, title, description, url, source, access, price_cents, duration_seconds, downloadable, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [Number(station_id), type, title.trim(), description, url, source, access, Number(price_cents), Number(duration_seconds), downloadable, req.user.id]
  );
  await logActivity(req.user.id, 'media_upload', `${req.user.name} published ${title.trim()}`, Number(station_id));
  res.status(201).json({ media: rows[0] });
});

router.patch('/:id', auth(), async (req, res) => {
  const mediaId = Number(req.params.id);
  const { rows: found } = await q('SELECT station_id FROM media WHERE id = $1', [mediaId]);
  if (!found.length) return res.status(404).json({ error: 'Media not found' });
  if (!(await canManageStation(req.user, found[0].station_id))) {
    return res.status(403).json({ error: 'Only the station owner or an admin can edit this media' });
  }
  const allowed = ['title', 'description', 'access', 'price_cents', 'visible', 'downloadable', 'url', 'duration_seconds'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) {
      params.push(req.body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(mediaId);
  const { rows } = await q(`UPDATE media SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  res.json({ media: rows[0] });
});

router.delete('/:id', auth(), async (req, res) => {
  const mediaId = Number(req.params.id);
  const { rows: found } = await q('SELECT station_id FROM media WHERE id = $1', [mediaId]);
  if (!found.length) return res.status(404).json({ error: 'Media not found' });
  if (!(await canManageStation(req.user, found[0].station_id))) {
    return res.status(403).json({ error: 'Only the station owner or an admin can delete this media' });
  }
  await q('DELETE FROM media WHERE id = $1', [mediaId]);
  res.status(204).end();
});

// Play — records the listen so the control room feed and active-listener count update.
router.post('/:id/listen', auth({ required: false }), async (req, res) => {
  const { rows } = await q(`${SELECT} WHERE m.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Media not found' });
  const item = rows[0];
  await logActivity(req.user?.id, 'listen', `${req.user?.name ?? 'A guest'} is listening to ${item.title}`, item.station_id);
  res.json({ media: item });
});

// Download — gated by the item's access tier.
router.get('/:id/download', auth(), async (req, res) => {
  const { rows } = await q(`${SELECT} WHERE m.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'That download is not available' });
  const item = rows[0];
  if (!item.downloadable) return res.status(403).json({ error: 'Downloads are switched off for this item' });

  if (item.access === 'premium' && !(await isPremium(req.user))) {
    return res.status(402).json({ error: 'This download is part of the Premium library' });
  }
  if (item.access === 'paid' && !(await hasDownloadEntitlement(req.user, item.id))) {
    return res.status(402).json({ error: 'Buy this download to unlock it' });
  }

  await logActivity(req.user.id, 'download', `${req.user.name} downloaded ${item.title}`, item.station_id);
  res.json({ url: item.url, title: item.title });
});

export default router;
