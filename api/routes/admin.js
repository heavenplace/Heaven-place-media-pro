import express from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import { logActivity } from '../guards.js';
import { saveRecording } from './live.js';
import { PAYMENT_METHODS, withAmounts } from '../payments.js';

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
      (SELECT count(*)::int FROM live_sessions WHERE status = 'live' AND (expires_at IS NULL OR expires_at > now())) AS live_now,
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
      coalesce(round(sum(EXTRACT(EPOCH FROM (coalesce(l.ended_at, l.expires_at, now()) - l.started_at)) / 60)), 0)::int AS minutes_aired,
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

// The content desk: rename, re-describe, reassign or retire a station.
router.patch('/stations/:id', async (req, res) => {
  const { status, verified, name, kind, description, artwork_url, owner_id, plan } = req.body ?? {};
  if (status && !['pending', 'approved', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Unknown station status' });
  }
  if (kind && !['radio', 'tv'].includes(kind)) return res.status(400).json({ error: 'Station type must be radio or tv' });
  if (plan && !['standard', 'premium'].includes(plan)) return res.status(400).json({ error: 'Unknown station licence' });
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'A station name is required' });

  const sets = [];
  const params = [];
  const add = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (name !== undefined) add('name', String(name).trim());
  if (kind !== undefined) add('kind', kind);
  if (description !== undefined) add('description', description);
  if (artwork_url !== undefined) add('artwork_url', artwork_url);
  if (owner_id !== undefined) add('owner_id', owner_id ? Number(owner_id) : null);
  if (status) add('status', status);
  if (plan) add('plan', plan);
  if (verified !== undefined) add('verified', Boolean(verified));
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

// The moderation desk: what creators have published, with the owner behind it. Media is
// what listeners can actually play — uploads, phone recordings and Relive captures.
const MODERATION_SELECT = `SELECT m.*, s.name AS station_name, s.kind AS station_kind, s.status AS station_status,
  u.name AS owner_name, u.email AS owner_email
  FROM media m JOIN stations s ON s.id = m.station_id LEFT JOIN users u ON u.id = s.owner_id`;

router.get('/moderation', async (req, res) => {
  const { rows: totals } = await q(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE flagged)::int AS flagged,
       count(*) FILTER (WHERE NOT visible)::int AS hidden
     FROM media`
  );

  const where = [];
  const params = [];
  if (req.query.status === 'flagged') where.push('m.flagged');
  if (req.query.status === 'hidden') where.push('NOT m.visible');
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(m.title ILIKE $${params.length} OR s.name ILIKE $${params.length} OR coalesce(u.name,'') ILIKE $${params.length})`);
  }

  const { rows } = await q(
    `${MODERATION_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY m.flagged DESC, m.created_at DESC LIMIT 200`,
    params
  );
  res.json({ summary: totals[0], media: rows });
});

// Flag for review, clear a flag, hide it from listeners, or put it back. A flag is a
// marker for the control room; only hiding or removing takes the item out of the app.
const MODERATION_ACTIONS = {
  flag: {
    sql: 'UPDATE media SET flagged = true, flag_reason = $2, flagged_at = now(), flagged_by = $3 WHERE id = $1 RETURNING *',
    log: (item) => `flagged ${item.title}`
  },
  unflag: {
    sql: 'UPDATE media SET flagged = false, flag_reason = null, flagged_at = null, flagged_by = null WHERE id = $1 RETURNING *',
    log: (item) => `cleared the flag on ${item.title}`
  },
  hide: { sql: 'UPDATE media SET visible = false WHERE id = $1 RETURNING *', log: (item) => `hid ${item.title}` },
  restore: { sql: 'UPDATE media SET visible = true WHERE id = $1 RETURNING *', log: (item) => `restored ${item.title}` }
};

router.post('/media/:id/moderate', async (req, res) => {
  const action = String(req.body?.action ?? '');
  if (!MODERATION_ACTIONS[action]) return res.status(400).json({ error: 'Unknown moderation action' });

  const { rows: found } = await q(
    'SELECT m.id, m.title, m.station_id, s.name AS station_name FROM media m JOIN stations s ON s.id = m.station_id WHERE m.id = $1',
    [req.params.id]
  );
  if (!found.length) return res.status(404).json({ error: 'That content has already been removed' });
  const item = found[0];

  const params =
    action === 'flag' ? [item.id, String(req.body?.reason ?? '').trim() || 'Flagged for review', req.user.id] : [item.id];
  const { rows } = await q(MODERATION_ACTIONS[action].sql, params);
  await logActivity(req.user.id, 'moderate', `${req.user.name} ${MODERATION_ACTIONS[action].log(item)} on ${item.station_name}`, item.station_id);
  res.json({ media: rows[0] });
});

router.delete('/media/:id', async (req, res) => {
  const { rows } = await q(
    'SELECT m.id, m.title, m.station_id, s.name AS station_name FROM media m JOIN stations s ON s.id = m.station_id WHERE m.id = $1',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'That content has already been removed' });
  await q('DELETE FROM media WHERE id = $1', [rows[0].id]);
  await logActivity(req.user.id, 'moderate', `${req.user.name} removed ${rows[0].title} from ${rows[0].station_name}`, rows[0].station_id);
  res.status(204).end();
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
     ORDER BY (l.status = 'live' AND (l.expires_at IS NULL OR l.expires_at > now())) DESC, l.started_at DESC LIMIT 100`
  );
  res.json({ live: rows });
});

router.post('/live/:id/end', async (req, res) => {
  const { rows } = await q("UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE id = $1 RETURNING *", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Live session not found' });
  const relive = await saveRecording(rows[0]);
  await logActivity(req.user.id, 'live_end', `${req.user.name} took ${rows[0].title} off air`, rows[0].station_id);
  res.json({ session: rows[0], relive });
});

// ---- Payment accounts ------------------------------------------------------
// Where station owners pay their licence fee. The control room keeps one row per
// receiving account — a bank account in a national currency, or a crypto wallet — and
// sets `rate_per_usd` so the app can name the exact $5 / $15 equivalent in that currency.
const ACCOUNT_COLUMNS = [
  'label',
  'method',
  'currency',
  'country',
  'account_name',
  'account_number',
  'bank_name',
  'network',
  'instructions'
];

const accountValues = (body) => {
  const text = (value) => String(value ?? '').trim() || null;
  const rate = body?.rate_per_usd;
  return {
    label: text(body?.label),
    method: PAYMENT_METHODS.includes(body?.method) ? body.method : 'bank',
    currency: String(body?.currency ?? '').trim().toUpperCase() || null,
    country: text(body?.country),
    account_name: text(body?.account_name),
    account_number: text(body?.account_number),
    bank_name: text(body?.bank_name),
    network: text(body?.network),
    instructions: text(body?.instructions),
    // Absent on a partial update, so PATCH leaves the rate alone.
    rate_per_usd: rate === undefined || rate === null || rate === '' ? null : Number(rate)
  };
};

router.get('/payment-accounts', async (_req, res) => {
  const { rows } = await q('SELECT * FROM payment_accounts ORDER BY active DESC, method, currency, label');
  res.json({ accounts: rows.map(withAmounts) });
});

router.post('/payment-accounts', async (req, res) => {
  const values = accountValues(req.body);
  if (!values.label || !values.currency) {
    return res.status(400).json({ error: 'A label and a currency are required' });
  }
  if (!(values.rate_per_usd > 0)) {
    return res.status(400).json({ error: 'Set how many units of that currency one US dollar buys' });
  }
  const { rows } = await q(
    `INSERT INTO payment_accounts (label, method, currency, country, account_name, account_number, bank_name, network, rate_per_usd, instructions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      values.label,
      values.method,
      values.currency,
      values.country,
      values.account_name,
      values.account_number,
      values.bank_name,
      values.network,
      values.rate_per_usd,
      values.instructions
    ]
  );
  await logActivity(req.user.id, 'payment_account', `${req.user.name} added the ${values.currency} payment account “${values.label}”`);
  res.status(201).json({ account: withAmounts(rows[0]) });
});

router.patch('/payment-accounts/:id', async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return res.status(404).json({ error: 'Payment account not found' });
  }
  const sets = [];
  const params = [];
  const values = accountValues(req.body);
  for (const column of [...ACCOUNT_COLUMNS, 'rate_per_usd']) {
    const value = values[column];
    if (value === null || value === undefined) continue;
    if (column === 'rate_per_usd' && !(value > 0)) {
      return res.status(400).json({ error: 'Set how many units of that currency one US dollar buys' });
    }
    if (column === 'currency') {
      if (!value) return res.status(400).json({ error: 'A currency is required' });
    }
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  if (req.body?.active !== undefined) {
    params.push(Boolean(req.body.active));
    sets.push(`active = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(accountId);
  const { rows } = await q(
    `UPDATE payment_accounts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Payment account not found' });
  await logActivity(req.user.id, 'payment_account', `${req.user.name} updated the ${rows[0].currency} payment account “${rows[0].label}”`);
  res.json({ account: withAmounts(rows[0]) });
});

router.delete('/payment-accounts/:id', async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return res.status(404).json({ error: 'Payment account not found' });
  }
  const { rows } = await q('DELETE FROM payment_accounts WHERE id = $1 RETURNING currency, label', [accountId]);
  if (!rows.length) return res.status(404).json({ error: 'Payment account not found' });
  await logActivity(req.user.id, 'payment_account', `${req.user.name} removed the ${rows[0].currency} payment account “${rows[0].label}”`);
  res.status(204).end();
});

// ---- Station applications --------------------------------------------------
// Listeners apply for a station and settle the licence fee — by card, or by paying one of
// the accounts above and handing over the proof. The control room verifies the proof,
// which marks the fee paid, and then approving opens the station on the plan paid for.
// Premium is what switches monetisation on: only a premium station may publish premium
// and paid content and earn from it.
router.get('/applications', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) {
    params.push(req.query.status);
    where = 'WHERE a.status = $1';
  }
  const { rows } = await q(
    `SELECT a.*, u.name AS user_name, u.email AS user_email
     FROM station_applications a LEFT JOIN users u ON u.id = a.user_id ${where}
     ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC LIMIT 200`,
    params
  );
  res.json({ applications: rows });
});

// The card checkout records the fee itself; this covers one settled another way.
router.post('/applications/:id/fee', async (req, res) => {
  const paid = req.body?.paid !== false;
  const { rows } = await q(
    `UPDATE station_applications
     SET fee_status = $2, paid_at = CASE WHEN $2 = 'paid' THEN coalesce(paid_at, now()) ELSE null END
     WHERE id = $1 RETURNING *`,
    [Number(req.params.id), paid ? 'paid' : 'unpaid']
  );
  if (!rows.length) return res.status(404).json({ error: 'Application not found' });
  await logActivity(req.user.id, 'station_review', `${req.user.name} marked the fee for ${rows[0].station_name} as ${paid ? 'collected' : 'uncollected'}`);
  res.json({ application: rows[0] });
});

// The control room checked the applicant's payment proof. Verifying marks the licence fee
// paid — which is what lets the application be approved and the station opened on the plan
// the applicant chose; rejecting sends it back for a corrected payment.
router.post('/applications/:id/proof', async (req, res) => {
  const action = String(req.body?.action ?? '');
  if (!['verify', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Verify or reject the payment proof' });
  }

  const applicationId = Number(req.params.id);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return res.status(404).json({ error: 'Application not found' });
  }
  const { rows: found } = await q('SELECT * FROM station_applications WHERE id = $1', [applicationId]);
  if (!found.length) return res.status(404).json({ error: 'Application not found' });
  const application = found[0];
  if (application.proof_status !== 'submitted') {
    return res.status(409).json({ error: 'There is no payment proof waiting on that application' });
  }

  const verified = action === 'verify';
  const note = String(req.body?.note ?? '').trim() || null;
  const { rows } = await q(
    `UPDATE station_applications SET
       proof_status = $2, proof_review_note = $3, proof_reviewed_by = $4, proof_reviewed_at = now(),
       fee_status = CASE WHEN $5 THEN 'paid' ELSE 'unpaid' END,
       paid_at = CASE WHEN $5 THEN coalesce(paid_at, now()) ELSE null END
     WHERE id = $1 RETURNING *`,
    [application.id, verified ? 'verified' : 'rejected', note, req.user.id, verified]
  );
  await logActivity(
    req.user.id,
    'station_review',
    `${req.user.name} ${verified ? 'verified' : 'could not verify'} the licence payment for ${application.station_name}`
  );
  res.json({ application: rows[0] });
});

// A TV twin takes "TV" after the applicant's name unless they already used it.
const tvStationName = (name) => (/tv$/i.test(String(name).trim()) ? String(name).trim() : `${String(name).trim()} TV`);

router.post('/applications/:id/review', async (req, res) => {
  const action = String(req.body?.action ?? '');
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Approve or reject the application' });

  const { rows: found } = await q('SELECT * FROM station_applications WHERE id = $1', [Number(req.params.id)]);
  if (!found.length) return res.status(404).json({ error: 'Application not found' });
  const application = found[0];
  if (application.status !== 'pending') return res.status(409).json({ error: 'That application has already been reviewed' });

  const note = String(req.body?.note ?? '').trim() || null;

  if (action === 'reject') {
    const { rows } = await q(
      `UPDATE station_applications SET status = 'rejected', review_note = $2, reviewed_by = $3, reviewed_at = now()
       WHERE id = $1 RETURNING *`,
      [application.id, note, req.user.id]
    );
    await logActivity(req.user.id, 'station_review', `${req.user.name} rejected the application for ${application.station_name}`);
    return res.json({ application: rows[0] });
  }

  if (application.fee_status !== 'paid') {
    return res.status(402).json({ error: 'That licence fee has not been paid yet' });
  }

  const open = async (name, kind) => {
    const { rows } = await q(
      `INSERT INTO stations (name, kind, description, status, owner_id, plan)
       VALUES ($1,$2,$3,'approved',$4,$5) RETURNING *`,
      [name, kind, application.description, application.user_id, application.plan]
    );
    await logActivity(req.user.id, 'station_create', `${req.user.name} opened ${name} for ${application.station_name}'s applicant`, rows[0].id);
    return rows[0];
  };

  const fm = await open(application.station_name, 'radio');
  const tv = application.coverage === 'fm_tv' ? await open(tvStationName(application.station_name), 'tv') : null;

  const { rows } = await q(
    `UPDATE station_applications SET status = 'approved', review_note = $2, reviewed_by = $3, reviewed_at = now(),
       station_id = $4, tv_station_id = $5 WHERE id = $1 RETURNING *`,
    [application.id, note, req.user.id, fm.id, tv?.id ?? null]
  );
  res.json({ application: rows[0], stations: [fm, tv].filter(Boolean) });
});

// ---- Station revenue -------------------------------------------------------
// The earnings ledger: what listeners paid for premium content, per owner, with
// every sale and recorded payout behind it.
router.get('/earnings', async (_req, res) => {
  const [owners, sales, payouts] = await Promise.all([
    q(`SELECT u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
              count(e.id)::int AS sales,
              coalesce(sum(e.amount_cents),0)::int AS earned_cents,
              coalesce(sum(e.amount_cents) FILTER (WHERE e.payout_id IS NOT NULL),0)::int AS settled_cents,
              pa.account_name, pa.bank_name, pa.account_number, pa.routing_number, pa.note AS account_note
       FROM earnings e
       JOIN users u ON u.id = e.owner_id
       LEFT JOIN payout_accounts pa ON pa.user_id = u.id
       GROUP BY u.id, pa.account_name, pa.bank_name, pa.account_number, pa.routing_number, pa.note
       ORDER BY earned_cents DESC`),
    q(`SELECT e.*, s.name AS station_name, s.plan, m.title AS media_title, u.name AS buyer_name
       FROM earnings e
       LEFT JOIN stations s ON s.id = e.station_id
       LEFT JOIN media m ON m.id = e.media_id
       LEFT JOIN users u ON u.id = e.buyer_id
       ORDER BY e.created_at DESC LIMIT 100`),
    q('SELECT p.*, u.name AS owner_name FROM payouts p LEFT JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC LIMIT 100')
  ]);
  res.json({ owners: owners.rows, earnings: sales.rows, payouts: payouts.rows });
});

// Settling closes out every unpaid sale for that owner at once; the money itself
// moves outside the app, so this records the payout rather than sending it.
router.post('/payouts', async (req, res) => {
  const ownerId = Number(req.body?.owner_id);
  if (!ownerId) return res.status(400).json({ error: 'Which owner is this payout for?' });

  const { rows: due } = await q(
    'SELECT coalesce(sum(amount_cents),0)::int AS cents FROM earnings WHERE owner_id = $1 AND payout_id IS NULL',
    [ownerId]
  );
  if (!due[0].cents) return res.status(400).json({ error: 'That owner has nothing outstanding' });

  const { rows: created } = await q(
    'INSERT INTO payouts (owner_id, amount_cents, note, settled_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [ownerId, due[0].cents, String(req.body?.note ?? '').trim() || null, req.user.id]
  );
  await q('UPDATE earnings SET payout_id = $1 WHERE owner_id = $2 AND payout_id IS NULL', [created[0].id, ownerId]);
  await logActivity(req.user.id, 'payout', `${req.user.name} settled $${(created[0].amount_cents / 100).toFixed(2)} of station earnings`);
  res.status(201).json({ payout: created[0] });
});

export default router;
