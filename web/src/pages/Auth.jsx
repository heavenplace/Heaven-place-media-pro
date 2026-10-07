import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { GoogleSignInGate } from '../components/GoogleSignIn.jsx';

export default function Auth({ mode }) {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleNote, setGoogleNote] = useState('');

  if (user) {
    return (
      <div className="panel stack" style={{ maxWidth: 460 }}>
        <h1>You are signed in</h1>
        <p className="muted">Signed in as {user.email}.</p>
        <Link className="btn btn-primary" to="/">Back to the app</Link>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'forgot') {
    return (
      <div className="panel stack" style={{ maxWidth: 460 }}>
        <h1>Reset your password</h1>
        <p className="muted small">
          Password resets are handled by the app's mail provider. Send the address you signed up with to the
          control room and they will issue a reset link.
        </p>
        <Link className="btn" to="/login">Back to sign in</Link>
      </div>
    );
  }

  const isRegister = mode === 'register';

  return (
    <div className="panel stack" style={{ maxWidth: 460 }}>
      <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
      <p className="muted small">
        {isRegister ? 'One account works across the listener app and the studio.' : 'Sign in to keep your favorites, downloads and studio.'}
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <form className="stack" onSubmit={submit}>
        {isRegister && (
          <div>
            <label>Name</label>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </div>
        )}
        <div>
          <label>Email</label>
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            minLength={8}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <GoogleSignInGate
        onError={setError}
        onUnavailable={() => (
          <button
            className="btn"
            type="button"
            onClick={() =>
              setGoogleNote(
                'Google sign-in is not switched on for this server yet — add a Google client id and the button appears here.'
              )
            }
          >
            Continue with Google
          </button>
        )}
      />
      {googleNote && <div className="notice small">{googleNote}</div>}

      <div className="row small muted">
        {isRegister ? (
          <>
            <span>Already have an account?</span>
            <Link to="/login">Sign in</Link>
          </>
        ) : (
          <>
            <Link to="/register">Create an account</Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </>
        )}
      </div>
    </div>
  );
}
