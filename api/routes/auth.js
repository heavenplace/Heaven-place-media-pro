import express from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { q } from '../db.js';
import { auth, publicUser, signToken } from '../auth.js';
import { isSingleAddress, normalizeEmail } from '../emails.js';
import { verifyGoogleCredential } from '../google.js';
import { logActivity } from '../guards.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password || !name) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  // Normalised once, before anything is stored or compared: a spaced address
  // ("owner@gmail.com ") must not land as a second row beside the account it belongs to, and
  // the invisible characters a phone keyboard or a paste leaves in an address must never
  // reach the column — an address carrying one is one its owner can no longer sign in with.
  const address = normalizeEmail(email);
  if (!isSingleAddress(address)) return res.status(400).json({ error: 'Enter one email address' });

  const existing = await q('SELECT id FROM users WHERE lower(email) = lower($1)', [address]);
  if (existing.rows.length) return res.status(409).json({ error: 'That email is already registered' });

  const { rows } = await q(
    'INSERT INTO users (email, password_hash, name, password_set) VALUES ($1, $2, $3, true) RETURNING id, email, name, role, tier, avatar_url, password_set',
    [address, await bcrypt.hash(String(password), 10), String(name).trim()]
  );
  const user = publicUser(rows[0]);
  await logActivity(user.id, 'signup', `${user.name} created an account`);
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  // The address is read exactly as register stores it (normalizeEmail trims it and drops the
  // invisible characters), so the address the owner types matches the row on file even when
  // the phone that typed it left a left-to-right mark in front of it.
  const address = normalizeEmail(email);
  if (!isSingleAddress(address)) return res.status(400).json({ error: 'Enter one email address' });

  // ORDER BY id LIMIT 1: where two rows do share one address — an owner locked out by those
  // characters registered again, which the old register allowed — sign-in reproducibly lands
  // on the older account, the one holding the stations, rather than on whichever row comes
  // back first.
  const { rows } = await q(
    'SELECT id, email, name, role, tier, avatar_url, password_hash, password_set FROM users WHERE lower(email) = lower($1) ORDER BY id LIMIT 1',
    [address]
  );
  if (!rows.length || !(await bcrypt.compare(String(password), rows[0].password_hash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const user = publicUser(rows[0]);
  await logActivity(user.id, 'signin', `${user.name} signed in`);
  res.json({ token: signToken(user), user });
});

// Sign in (or sign up) with a Google ID token from the browser credential flow.
// An account with that verified email is reused; otherwise one is created.
router.post('/google', async (req, res) => {
  const { credential } = req.body ?? {};
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

  let profile;
  try {
    profile = await verifyGoogleCredential(credential);
  } catch (error) {
    return res.status(error.status || 401).json({ error: error.message });
  }

  // Normalised the same way, so Google sign-in finds — and never creates a second row beside
  // — an account whose address was once stored with an invisible character in it.
  const address = normalizeEmail(profile.email);
  const existing = await q(
    'SELECT id, email, name, role, tier, avatar_url, password_set FROM users WHERE lower(email) = lower($1) ORDER BY id LIMIT 1',
    [address]
  );

  if (existing.rows.length) {
    const user = publicUser(existing.rows[0]);
    await logActivity(user.id, 'signin', `${user.name} signed in with Google`);
    return res.json({ token: signToken(user), user });
  }

  // Google accounts have no local password: store an unguessable hash so the
  // email/password login form stays shut for them, and leave password_set false so
  // POST /api/auth/password lets the owner set a first one without a current password.
  const { rows } = await q(
    'INSERT INTO users (email, password_hash, name, avatar_url) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role, tier, avatar_url, password_set',
    [address, await bcrypt.hash(randomBytes(32).toString('hex'), 10), profile.name, profile.picture]
  );
  const user = publicUser(rows[0]);
  await logActivity(user.id, 'signup', `${user.name} created an account with Google`);
  res.status(201).json({ token: signToken(user), user });
});

// Set or change the password on the signed-in account. An account created with Google
// has no password this user knows, so the current password is only required once one has
// actually been set — which is how a Google account gets a password it can use in the
// Android apps (they sign in with email + password only, no Google flow).
router.post('/password', auth(), async (req, res) => {
  const { current_password: current, password } = req.body ?? {};
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { rows } = await q('SELECT password_hash, password_set FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'That account no longer exists' });

  if (rows[0].password_set && !(await bcrypt.compare(String(current || ''), rows[0].password_hash))) {
    return res.status(401).json({ error: 'Your current password is incorrect' });
  }

  await q('UPDATE users SET password_hash = $1, password_set = true WHERE id = $2', [
    await bcrypt.hash(String(password), 10),
    req.user.id
  ]);
  await logActivity(req.user.id, 'password', `${req.user.name} set a password`);
  res.json({ user: { ...req.user, has_password: true } });
});

router.get('/me', auth(), (req, res) => res.json({ user: req.user }));

export default router;
