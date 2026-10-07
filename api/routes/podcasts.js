import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { logActivity } from '../guards.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const { rows } = await q(
    `SELECT p.*, u.name AS owner_name,
            (SELECT count(*)::int FROM episodes e WHERE e.podcast_id = p.id) AS episode_count
     FROM podcasts p LEFT JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC`
  );
  res.json({ podcasts: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT p.*, u.name AS owner_name FROM podcasts p LEFT JOIN users u ON u.id = p.owner_id WHERE p.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Podcast not found' });
  const episodes = await q('SELECT * FROM episodes WHERE podcast_id = $1 ORDER BY created_at DESC', [req.params.id]);
  res.json({ podcast: rows[0], episodes: episodes.rows });
});

router.post('/', auth(), async (req, res) => {
  const { title, description = '', artwork_url = '' } = req.body ?? {};
  if (!title) return res.status(400).json({ error: 'A podcast title is required' });
  const { rows } = await q(
    'INSERT INTO podcasts (title, description, artwork_url, owner_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [title.trim(), description, artwork_url, req.user.id]
  );
  await logActivity(req.user.id, 'podcast_create', `${req.user.name} started ${title.trim()}`);
  res.status(201).json({ podcast: rows[0] });
});

router.post('/:id/episodes', auth(), async (req, res) => {
  const { title, description = '', url, duration_seconds = 0 } = req.body ?? {};
  const podcastId = Number(req.params.id);
  const { rows: owner } = await q('SELECT owner_id FROM podcasts WHERE id = $1', [podcastId]);
  if (!owner.length) return res.status(404).json({ error: 'Podcast not found' });
  if (req.user.role !== 'admin' && owner[0].owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the podcast owner can add episodes' });
  }
  if (!title || !url) return res.status(400).json({ error: 'An episode title and file are required' });
  const { rows } = await q(
    'INSERT INTO episodes (podcast_id, title, description, url, duration_seconds) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [podcastId, title.trim(), description, url, Number(duration_seconds)]
  );
  await logActivity(req.user.id, 'episode_upload', `${req.user.name} published ${title.trim()}`);
  res.status(201).json({ episode: rows[0] });
});

router.delete('/episodes/:id', auth(), async (req, res) => {
  const { rows } = await q(
    `SELECT e.id, p.owner_id FROM episodes e JOIN podcasts p ON p.id = e.podcast_id WHERE e.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Episode not found' });
  if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the podcast owner can remove episodes' });
  }
  await q('DELETE FROM episodes WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
