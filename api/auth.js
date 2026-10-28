import jwt from 'jsonwebtoken';
import { q } from './db.js';

const SECRET = process.env.JWT_SECRET || 'development-only-secret';

export const signToken = (user) => jwt.sign({ sub: user.id }, SECRET, { expiresIn: '30d' });

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    tier: row.tier,
    avatar_url: row.avatar_url,
    // False for an account created with Google that never set one: the account page offers
    // "set a password" instead of "change password", which is also what the Android apps
    // need, since they sign in with email + password only.
    has_password: Boolean(row.password_set)
  };
}

/**
 * auth() — signed-in user required.
 * auth({ required: false }) — attaches req.user when a valid token is present.
 * auth({ admin: true }) — admin only.
 */
export function auth({ required = true, admin = false } = {}) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (token) {
      try {
        const payload = jwt.verify(token, SECRET);
        const { rows } = await q('SELECT id, email, name, role, tier, avatar_url, password_set FROM users WHERE id = $1', [payload.sub]);
        if (rows.length) req.user = publicUser(rows[0]);
      } catch {
        /* fall through to the unauthenticated branch */
      }
    }

    if (required && !req.user) return res.status(401).json({ error: 'Sign in required' });
    if (admin && req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
    next();
  };
}
