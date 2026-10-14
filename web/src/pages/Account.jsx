import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

/**
 * The signed-in account. Its one job today is the password: an account created with Google
 * starts without one, so this is where that account sets a password — which is also what it
 * needs to sign into the Android apps, since they use email + password only.
 */
export default function Account() {
  const { user, ready, setPassword, logout } = useAuth();
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) return <Navigate to="/login?next=%2Faccount" replace />;

  const needsCurrent = Boolean(user.has_password);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setDone('');
    if (form.password !== form.confirm) return setError('The two passwords do not match');
    setBusy(true);
    try {
      await setPassword(form.password, needsCurrent ? form.current : undefined);
      setForm({ current: '', password: '', confirm: '' });
      setDone(needsCurrent ? 'Password changed — use it from now on.' : 'Password set — you can sign in with your email and this password now.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 520 }}>
      <div className="panel stack">
        <h1>Your account</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Signed in as <b>{user.email}</b>
          {user.tier === 'premium' && <span className="badge badge-accent" style={{ marginLeft: 8 }}>Premium</span>}
        </p>
        {user.role === 'admin' && <span className="badge badge-accent" style={{ alignSelf: 'flex-start' }}>Control room</span>}
      </div>

      <div className="panel stack">
        <h2>{needsCurrent ? 'Change your password' : 'Set a password'}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {needsCurrent
            ? 'Enter your current password, then choose a new one.'
            : 'This account was created with Google, so it has no password yet. Set one to sign in with your email and password — including in the Android apps, which use email + password only.'}
        </p>

        {error && <div className="notice notice-error">{error}</div>}
        {done && <div className="notice notice-ok">{done}</div>}

        <form className="stack" onSubmit={submit}>
          {needsCurrent && (
            <div>
              <label>Current password</label>
              <input
                type="password"
                value={form.current}
                onChange={(event) => setForm({ ...form, current: event.target.value })}
                autoComplete="current-password"
                required
              />
            </div>
          )}
          <div>
            <label>New password</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label>Confirm new password</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(event) => setForm({ ...form, confirm: event.target.value })}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : needsCurrent ? 'Change password' : 'Set password'}
          </button>
        </form>
      </div>

      <div className="row small muted">
        <Link to="/">Back to the app</Link>
        <button className="btn btn-sm" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
