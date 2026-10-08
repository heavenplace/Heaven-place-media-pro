import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { canManageStation, logActivity } from '../guards.js';
import { UPLOAD_DIR } from '../uploads.js';

const router = express.Router();

// Recorded broadcasts are appended here slice by slice, then served from /uploads.
const LIVE_DIR = path.join(UPLOAD_DIR, 'live');
fs.mkdirSync(LIVE_DIR, { recursive: true });

const SELECT = `SELECT l.*, s.name AS station_name, s.kind AS station_kind, s.artwork_url AS station_artwork,
  m.title AS media_title, m.type AS media_type, m.url AS media_url, m.access AS media_access
  FROM live_sessions l
  JOIN stations s ON s.id = l.station_id
  LEFT JOIN media m ON m.id = l.media_id`;

// On air until it is ended, its window runs out — or forever, when it is 24/7.
const ON_AIR = "(l.status = 'live' AND (l.expires_at IS NULL OR l.expires_at > now()))";

const extensionFor = (mime) => (String(mime || '').includes('mp4') ? 'mp4' : 'webm');
const fileFor = (id, mime) => path.join(LIVE_DIR, `${id}.${extensionFor(mime)}`);
const recordingUrlFor = (id, mime) => `/uploads/live/${id}.${extensionFor(mime)}`;

async function sizeOf(file) {
  try {
    return (await fs.promises.stat(file)).size;
  } catch {
    return 0;
  }
}

// Everything currently on air.
router.get('/', async (_req, res) => {
  // Cheap safety net: anything that ended by itself is archived before anyone looks.
  await sweepLiveRecordings().catch(() => {});
  const { rows } = await q(`${SELECT} WHERE ${ON_AIR} ORDER BY l.started_at DESC`);
  res.json({ live: rows });
});

// Live windows on the stations this user owns, active first — the owner dashboard.
router.get('/mine', auth(), async (req, res) => {
  await sweepLiveRecordings().catch(() => {});
  const { rows } = await q(
    `${SELECT} WHERE l.station_id IN (SELECT id FROM stations WHERE owner_id = $1)
     ORDER BY ${ON_AIR} DESC, l.started_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json({ live: rows });
});

// Put an uploaded file on air, or open a window a phone will broadcast into.
// `hours` sets the window (1-24), `permanent: true` runs it 24/7 with no end time.
router.post('/', auth(), async (req, res) => {
  const { station_id, media_id, title, kind = 'audio', hours = 1, permanent = false, mime = null } = req.body ?? {};
  const stationId = Number(station_id);

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

  const forever = Boolean(permanent);
  const window = Math.min(Math.max(Number(hours) || 1, 1), 24);

  // One broadcast at a time per station: whatever is already on air is closed, and what it
  // recorded is archived first, so a superseded broadcast is never lost.
  const { rows: superseded } = await q(
    "UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE station_id = $1 AND status = 'live' RETURNING *",
    [stationId]
  );
  for (const session of superseded) await saveRecording(session);

  const { rows } = await q(
    `INSERT INTO live_sessions (station_id, media_id, title, kind, permanent, mime, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,
       CASE WHEN $7::int IS NULL THEN NULL ELSE now() + ($7::int || ' hours')::interval END,
       $8) RETURNING *`,
    [stationId, media_id ? Number(media_id) : null, mediaTitle, kind, forever, mime, forever ? null : window, req.user.id]
  );
  await logActivity(req.user.id, 'live_start', `${req.user.name} put ${mediaTitle} on air`, stationId);
  res.status(201).json({ session: rows[0] });
});

// A broadcasting phone sends its recording in short slices; each one is appended to
// the session's file, so a listener can follow the growing stream (GET /:id/manifest).
router.post('/:id/chunk', auth(), express.raw({ type: () => true, limit: '24mb' }), async (req, res) => {
  const { rows } = await q('SELECT * FROM live_sessions WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'That live session is no longer available' });
  const session = rows[0];

  if (!(await canManageStation(req.user, session.station_id))) {
    return res.status(403).json({ error: 'Only the station owner can broadcast to this station' });
  }
  if (session.status !== 'live') return res.status(409).json({ error: 'That live window has already ended' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Empty chunk' });

  const mime = session.mime || req.get('content-type') || 'video/webm';
  const file = fileFor(session.id, mime);
  await fs.promises.appendFile(file, req.body);

  const { rows: updated } = await q(
    `UPDATE live_sessions SET mime = $1, chunk_count = chunk_count + 1, recording_url = $2, last_chunk_at = now()
     WHERE id = $3 RETURNING chunk_count, recording_url`,
    [mime, recordingUrlFor(session.id, mime), session.id]
  );
  res.json({ chunk_count: updated[0].chunk_count, bytes: await sizeOf(file), url: updated[0].recording_url });
});

// How much of the broadcast exists so far — what a listener follows along with.
router.get('/:id/manifest', async (req, res) => {
  const { rows } = await q(
    `SELECT l.id, l.station_id, l.status, l.title, l.kind, l.mime, l.permanent, l.chunk_count,
            l.recording_url, l.started_at, l.expires_at, l.ended_at, ${ON_AIR} AS is_live,
            s.name AS station_name
     FROM live_sessions l JOIN stations s ON s.id = l.station_id WHERE l.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Live session not found' });
  const session = rows[0];
  res.json({ ...session, bytes: session.mime ? await sizeOf(fileFor(session.id, session.mime)) : 0 });
});

/**
 * A finished broadcast is archived on its station so listeners can relive it: a normal
 * `media` row with source = 'live'. The insert is guarded by the recording url, so ending
 * a session twice — or two sweeps racing — still produces exactly one Relive item, and the
 * id of the item that exists is returned either way.
 */
export async function saveRecording(session) {
  if (!session?.mime || !session?.recording_url) return null;

  const seconds = Math.max(
    0,
    Math.round((new Date(session.ended_at || Date.now()).getTime() - new Date(session.started_at).getTime()) / 1000)
  );
  const { rows } = await q(
    `INSERT INTO media (station_id, type, title, description, url, source, access, duration_seconds, created_by)
     SELECT $1,$2,$3,$4,$5,'live','free',$6,$7
     WHERE NOT EXISTS (SELECT 1 FROM media WHERE url = $5)
     RETURNING id`,
    [
      session.station_id,
      String(session.mime).startsWith('video') ? 'video' : 'audio',
      session.title,
      'Recorded live — relive the broadcast.',
      session.recording_url,
      seconds,
      session.created_by
    ]
  );
  if (rows.length) return rows[0].id;

  const existing = await q('SELECT id FROM media WHERE url = $1', [session.recording_url]);
  return existing.rows[0]?.id ?? null;
}

// Mark a session over (if it still looks live) and archive what it recorded.
export async function closeRecording(session) {
  if (session.status === 'live') {
    await q("UPDATE live_sessions SET status = 'ended', ended_at = coalesce(ended_at, now()) WHERE id = $1", [session.id]);
  }
  return saveRecording({ ...session, status: 'ended' });
}

/**
 * The net that makes "every broadcast is saved" true. A phone that closed the tab, lost
 * signal or was killed leaves its session looking live; so does a timed window whose time
 * just ran out. This closes those sessions and turns the recordings they left behind into
 * Relive items on their station. It runs on a timer, and whenever the studio asks for the
 * live list.
 */
export async function sweepLiveRecordings() {
  // A phone broadcast that stopped sending slices is over, whatever the row says.
  await q(
    `UPDATE live_sessions SET status = 'ended', ended_at = coalesce(last_chunk_at, now())
     WHERE status = 'live' AND recording_url IS NOT NULL AND last_chunk_at < now() - interval '2 minutes'`
  );
  // So is a timed window whose time is up.
  await q("UPDATE live_sessions SET status = 'ended', ended_at = expires_at WHERE status = 'live' AND expires_at IS NOT NULL AND expires_at <= now()");

  const { rows } = await q(
    `SELECT l.* FROM live_sessions l
     WHERE l.status = 'ended' AND l.recording_url IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM media m WHERE m.url = l.recording_url)`
  );
  const archived = [];
  for (const session of rows) {
    const id = await saveRecording(session);
    if (id) archived.push(id);
  }
  return archived;
}

// Broadcasts nobody is watching for: a phone that went away without saying goodbye.
const SWEEP_MS = 15000;
setInterval(() => sweepLiveRecordings().catch(() => {}), SWEEP_MS).unref();

router.post('/:id/end', auth(), async (req, res) => {
  const { rows: found } = await q('SELECT * FROM live_sessions WHERE id = $1', [req.params.id]);
  if (!found.length) return res.status(404).json({ error: 'That live session is no longer available' });
  if (!(await canManageStation(req.user, found[0].station_id))) {
    return res.status(403).json({ error: 'Only the station owner or an admin can end this session' });
  }
  const { rows } = await q("UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE id = $1 RETURNING *", [req.params.id]);
  const relive = await saveRecording(rows[0]);
  await logActivity(req.user.id, 'live_end', `${req.user.name} ended ${found[0].title}`, found[0].station_id);
  res.json({ session: rows[0], relive });
});

router.post('/:id/extend', auth(), async (req, res) => {
  const { rows: found } = await q('SELECT * FROM live_sessions WHERE id = $1', [req.params.id]);
  if (!found.length) return res.status(404).json({ error: 'That live session is no longer available' });
  if (!(await canManageStation(req.user, found[0].station_id))) {
    return res.status(403).json({ error: 'Only the station owner or an admin can extend this session' });
  }
  if (found[0].permanent) return res.status(400).json({ error: 'This window runs 24/7 — there is no end time to extend' });

  const hours = Math.min(Math.max(Number(req.body?.hours) || 1, 1), 24);
  const { rows } = await q(
    "UPDATE live_sessions SET status = 'live', expires_at = coalesce(expires_at, now()) + ($1 || ' hours')::interval WHERE id = $2 RETURNING *",
    [hours, req.params.id]
  );
  await logActivity(req.user.id, 'live_extend', `${req.user.name} extended ${found[0].title}`, found[0].station_id);
  res.json({ session: rows[0] });
});

export default router;
