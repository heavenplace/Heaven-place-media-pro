import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const q = (text, params) => pool.query(text, params);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  tier text NOT NULL DEFAULT 'free',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stations (
  id serial PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'radio',
  description text,
  artwork_url text,
  status text NOT NULL DEFAULT 'pending',
  verified boolean NOT NULL DEFAULT false,
  owner_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  id serial PRIMARY KEY,
  station_id integer REFERENCES stations(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'audio',
  title text NOT NULL,
  description text,
  url text NOT NULL,
  source text NOT NULL DEFAULT 'upload',
  access text NOT NULL DEFAULT 'free',
  price_cents integer NOT NULL DEFAULT 0,
  downloadable boolean NOT NULL DEFAULT true,
  visible boolean NOT NULL DEFAULT true,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  flagged_at timestamptz,
  flagged_by integer REFERENCES users(id) ON DELETE SET NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS podcasts (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text,
  artwork_url text,
  owner_id integer REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS episodes (
  id serial PRIMARY KEY,
  podcast_id integer REFERENCES podcasts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  url text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id serial PRIMARY KEY,
  station_id integer REFERENCES stations(id) ON DELETE CASCADE,
  media_id integer REFERENCES media(id) ON DELETE SET NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'audio',
  status text NOT NULL DEFAULT 'live',
  permanent boolean NOT NULL DEFAULT false,
  mime text,
  recording_url text,
  chunk_count integer NOT NULL DEFAULT 0,
  last_chunk_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  ended_at timestamptz,
  created_by integer REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  detail text,
  station_id integer REFERENCES stations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_requests (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  media_id integer REFERENCES media(id) ON DELETE CASCADE,
  note text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entitlements (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  media_id integer REFERENCES media(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id serial PRIMARY KEY,
  owner_id integer REFERENCES users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0,
  note text,
  settled_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- What listeners have paid for a station's premium content. One row per sale;
-- payout_id is filled in when the control room settles that owner's balance.
CREATE TABLE IF NOT EXISTS earnings (
  id serial PRIMARY KEY,
  station_id integer REFERENCES stations(id) ON DELETE CASCADE,
  owner_id integer REFERENCES users(id) ON DELETE SET NULL,
  buyer_id integer REFERENCES users(id) ON DELETE SET NULL,
  media_id integer REFERENCES media(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'download',
  amount_cents integer NOT NULL DEFAULT 0,
  stripe_session_id text UNIQUE,
  payout_id integer REFERENCES payouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Where a station applicant sends the licence fee. The control room adds one row per
-- receiving account — a bank account in a national currency, or a crypto wallet — with
-- rate_per_usd (units of that currency per US$1) so the $5/$15 fee lands on an exact
-- amount in that currency. The app shows that amount; the control room verifies the proof.
CREATE TABLE IF NOT EXISTS payment_accounts (
  id serial PRIMARY KEY,
  label text NOT NULL,
  method text NOT NULL DEFAULT 'bank',
  currency text NOT NULL,
  country text,
  account_name text,
  account_number text,
  bank_name text,
  network text,
  rate_per_usd numeric(20,8) NOT NULL DEFAULT 1,
  instructions text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A listener's request to open a station: FM only, or FM with a TV twin. The licence fee
-- is settled either by card (Stripe) or by a transfer to one of the control room's
-- payment accounts with the proof handed over below.
CREATE TABLE IF NOT EXISTS station_applications (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  station_name text NOT NULL,
  description text,
  coverage text NOT NULL DEFAULT 'fm',
  plan text NOT NULL DEFAULT 'standard',
  fee_cents integer NOT NULL DEFAULT 500,
  fee_status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  checkout_session_id text,
  payment_account_id integer REFERENCES payment_accounts(id) ON DELETE SET NULL,
  currency text,
  amount_units numeric(20,8),
  payment_reference text,
  proof_url text,
  proof_note text,
  proof_status text NOT NULL DEFAULT 'none',
  proof_submitted_at timestamptz,
  proof_reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  proof_reviewed_at timestamptz,
  proof_review_note text,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  station_id integer REFERENCES stations(id) ON DELETE SET NULL,
  tv_station_id integer REFERENCES stations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Where an owner's settled earnings should be sent: one row per account, entered by
-- the owner in the studio and read by the control room when it records a payout. It is
-- a record for a manual transfer, not a payment credential — nothing is transferred by
-- the app.
CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  routing_number text,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

// Columns added after the first release. ADD COLUMN IF NOT EXISTS keeps this idempotent,
// and a 24/7 window has no expires_at at all, so that column must allow NULL.
const MIGRATIONS = `
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS permanent boolean NOT NULL DEFAULT false;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_url text;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS chunk_count integer NOT NULL DEFAULT 0;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS last_chunk_at timestamptz;
ALTER TABLE media ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
ALTER TABLE media ADD COLUMN IF NOT EXISTS flag_reason text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS flagged_at timestamptz;
ALTER TABLE media ADD COLUMN IF NOT EXISTS flagged_by integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE live_sessions ALTER COLUMN expires_at DROP NOT NULL;
-- 'standard' stations publish free content; 'premium' (the $15 licence) may also
-- publish premium and paid items and earn from what listeners buy.
ALTER TABLE stations ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'standard';
-- The licence fee paid to one of the control room's payment accounts, with the proof.
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS payment_account_id integer REFERENCES payment_accounts(id) ON DELETE SET NULL;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS amount_units numeric(20,8);
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS proof_url text;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS proof_note text;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS proof_status text NOT NULL DEFAULT 'none';
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS proof_submitted_at timestamptz;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS proof_reviewed_by integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS proof_reviewed_at timestamptz;
ALTER TABLE station_applications ADD COLUMN IF NOT EXISTS proof_review_note text;
`;

export async function ensureSchema() {
  await q(SCHEMA);
  await q(MIGRATIONS);
}

export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@streamcast.pro';
  const password = process.env.ADMIN_PASSWORD || 'control-room';
  const { rows } = await q('SELECT id, role FROM users WHERE email = $1', [email]);
  if (rows.length) {
    // The main control-room account is whatever ADMIN_EMAIL names. If that address was
    // already registered as an ordinary listener, promote it; leave its password alone.
    if (rows[0].role !== 'admin') await q("UPDATE users SET role = 'admin' WHERE id = $1", [rows[0].id]);
    return;
  }
  await q(
    'INSERT INTO users (email, password_hash, name, role, tier) VALUES ($1, $2, $3, $4, $5)',
    [email, await bcrypt.hash(password, 10), 'Control Room', 'admin', 'premium']
  );
}

// Demo content so a fresh install has something on air. Only runs on an empty database.
export async function ensureSeed() {
  const { rows } = await q('SELECT count(*)::int AS n FROM stations');
  if (rows[0].n > 0) return;

  const { rows: owners } = await q("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const owner = owners[0]?.id ?? null;
  const art = (seed) => `https://picsum.photos/seed/${seed}/600/600`;

  const stations = [
    ['Heaven Radio', 'radio', 'Soul, gospel and talk around the clock.', art('heavenradio'), 'approved', true],
    ['Metro FM Live', 'radio', 'Afrobeats, amapiano and late-night mixes.', art('metrofmlive'), 'approved', true],
    ['Heaven TV', 'tv', 'Live worship, documentaries and news bulletins.', art('heaventv'), 'approved', true],
    ['Metro TV', 'tv', 'Studio shows, sport and entertainment.', art('metrotv'), 'approved', true]
  ];
  const ids = {};
  for (const [name, kind, description, artwork_url, status, verified] of stations) {
    // Seeded on the premium licence: the demo stations carry premium and paid items.
    const { rows: r } = await q(
      "INSERT INTO stations (name, kind, description, artwork_url, status, verified, owner_id, plan) VALUES ($1,$2,$3,$4,$5,$6,$7,'premium') RETURNING id",
      [name, kind, description, artwork_url, status, verified, owner]
    );
    ids[name] = r[0].id;
  }

  const media = [
    [ids['Heaven Radio'], 'audio', 'Morning Praise Mix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'free', 0, 372],
    [ids['Heaven Radio'], 'audio', 'Sunday Sermon Archive', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'premium', 0, 425],
    [ids['Metro FM Live'], 'audio', 'Amapiano Drive', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 'free', 0, 300],
    [ids['Metro FM Live'], 'audio', 'Late Night Mix Vol. 4', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 'paid', 299, 356],
    [ids['Heaven TV'], 'video', 'Studio Session: Live Worship', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 'free', 0, 596],
    [ids['Heaven TV'], 'video', 'Documentary: Sound of the City', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 'premium', 0, 653],
    [ids['Metro TV'], 'video', 'Match of the Week', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 'paid', 499, 15]
  ];
  for (const [station_id, type, title, url, access, price_cents, duration_seconds] of media) {
    await q(
      'INSERT INTO media (station_id, type, title, url, access, price_cents, duration_seconds, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [station_id, type, title, url, access, price_cents, duration_seconds, owner]
    );
  }

  const { rows: pod } = await q(
    'INSERT INTO podcasts (title, description, artwork_url, owner_id) VALUES ($1,$2,$3,$4) RETURNING id',
    ['The Heaven Place Podcast', 'Conversations on faith, media and everyday life.', art('heavenpodcast'), owner]
  );
  await q(
    'INSERT INTO episodes (podcast_id, title, description, url, duration_seconds) VALUES ($1,$2,$3,$4,$5)',
    [pod[0].id, 'Episode 1 — Telling better stories', 'How the studio got started.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 341]
  );
  await q(
    'INSERT INTO episodes (podcast_id, title, description, url, duration_seconds) VALUES ($1,$2,$3,$4,$5)',
    [pod[0].id, 'Episode 2 — Going live from a phone', 'Setting up a mobile rig.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 298]
  );
}
