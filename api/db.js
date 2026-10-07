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
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
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
`;

export async function ensureSchema() {
  await q(SCHEMA);
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
    const { rows: r } = await q(
      'INSERT INTO stations (name, kind, description, artwork_url, status, verified, owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
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
