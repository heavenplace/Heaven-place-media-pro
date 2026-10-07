import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';

const router = express.Router();

const TARGETS = {
  station: 'stations',
  media: 'media',
  podcast: 'podcasts'
};

router.get('/', auth(), async (req, res) => {
  const { rows } = await q(
    `SELECT f.*,
       s.name AS station_name, s.artwork_url AS station_artwork, s.kind AS station_kind,
       m.title AS media_title, m.type AS media_type, m.url AS media_url,
       p.title AS podcast_title, p.artwork_url AS podcast_artwork
     FROM favorites f
     LEFT JOIN stations s ON f.target_type = 'station' AND s.id = f.target_id
     LEFT JOIN media m ON f.target_type = 'media' AND m.id = f.target_id
     LEFT JOIN podcasts p ON f.target_type = 'podcast' AND p.id = f.target_id
     WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json({ favorites: rows });
});

router.post('/', auth(), async (req, res) => {
  const { target_type, target_id } = req.body ?? {};
  if (!TARGETS[target_type] || !target_id) return res.status(400).json({ error: 'A station, media item or podcast is required' });
  const { rows } = await q(
    `INSERT INTO favorites (user_id, target_type, target_id) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET created_at = now() RETURNING *`,
    [req.user.id, target_type, Number(target_id)]
  );
  res.status(201).json({ favorite: rows[0] });
});

router.delete('/:targetType/:targetId', auth(), async (req, res) => {
  if (!TARGETS[req.params.targetType]) return res.status(400).json({ error: 'Unknown favorite type' });
  await q('DELETE FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3', [
    req.user.id,
    req.params.targetType,
    Number(req.params.targetId)
  ]);
  res.status(204).end();
});

export default router;
