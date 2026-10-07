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

// Shows are created from the control room, which may hand one to an owner; that owner
// (or an admin) then publishes its episodes. Listeners cannot create shows at all.
router.post('/', auth({ admin: true }), async (req, res) => {
  const { title, description = '', artwork_url = '', owner_id } = req.body ?? {};
  if (!title) return res.status(400).json({ error: 'A podcast title is required' });
  const owner = owner_id ? Number(owner_id) : req.user.id;
  if (owner !== req.user.id) {
    const { rows: owners } = await q('SELECT id FROM users WHERE id = $1', [owner]);
    if (!owners.length) return res.status(400).json({ error: 'That owner account does not exist' });
  }
  const { rows } = await q(
    'INSERT INTO podcasts (title, description, artwork_url, owner_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [title.trim(), description, artwork_url, owner]
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

// Organising a show: rename it, re-cover it or hand it to another owner.
router.patch('/:id', auth(), async (req, res) => {
  const { rows: found } = await q('SELECT owner_id FROM podcasts WHERE id = $1', [req.params.id]);
  if (!found.length) return res.status(404).json({ error: 'Podcast not found' });
  if (req.user.role !== 'admin' && found[0].owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the podcast owner or an admin can edit it' });
  }
  if (req.body?.title !== undefined && !String(req.body.title).trim()) {
    return res.status(400).json({ error: 'A podcast title is required' });
  }
  const sets = [];
  const params = [];
  const add = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (req.body?.title !== undefined) add('title', String(req.body.title).trim());
  if (req.body?.description !== undefined) add('description', req.body.description);
  if (req.body?.artwork_url !== undefined) add('artwork_url', req.body.artwork_url);
  if (req.body?.owner_id !== undefined) add('owner_id', req.body.owner_id ? Number(req.body.owner_id) : null);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(Number(req.params.id));
  const { rows } = await q(`UPDATE podcasts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  res.json({ podcast: rows[0] });
});

// Removing a show takes its episodes with it (episodes cascade).
router.delete('/:id', auth(), async (req, res) => {
  const { rows } = await q('SELECT owner_id FROM podcasts WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Podcast not found' });
  if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the podcast owner or an admin can delete it' });
  }
  await q('DELETE FROM podcasts WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
