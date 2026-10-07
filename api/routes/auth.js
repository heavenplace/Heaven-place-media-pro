import express from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { auth, publicUser, signToken } from '../auth.js';
import { logActivity } from '../guards.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password || !name) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = await q('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'That email is already registered' });

  const { rows } = await q(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role, tier, avatar_url',
    [String(email).trim(), await bcrypt.hash(String(password), 10), String(name).trim()]
  );
  const user = publicUser(rows[0]);
  await logActivity(user.id, 'signup', `${user.name} created an account`);
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await q(
    'SELECT id, email, name, role, tier, avatar_url, password_hash FROM users WHERE lower(email) = lower($1)',
    [email]
  );
  if (!rows.length || !(await bcrypt.compare(String(password), rows[0].password_hash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const user = publicUser(rows[0]);
  await logActivity(user.id, 'signin', `${user.name} signed in`);
  res.json({ token: signToken(user), user });
});

router.get('/me', auth(), (req, res) => res.json({ user: req.user }));

export default router;
