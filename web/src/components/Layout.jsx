import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/radio', label: 'Radio' },
  { to: '/tv', label: 'TV' },
  { to: '/podcasts', label: 'Podcasts' },
  { to: '/library', label: 'Library' },
  { to: '/favorites', label: 'Favorites' },
  { to: '/premium', label: 'Premium' },
  { to: '/studio', label: 'Studio' },
  { to: '/apply', label: 'Get a station' }
];

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="header">
        <div className="wrap header-inner">
          <NavLink to="/" className="brand">
            <span className="brand-dot" />
            <span>
              StreamCast Pro
              <small>Radio · TV · Podcasts</small>
            </span>
          </NavLink>

          <nav className="nav">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {link.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
                Control room
              </NavLink>
            )}
          </nav>

          <div className="header-actions">
            {user ? (
              <>
                <NavLink to="/account" className="muted small" title={user.email} style={{ textDecoration: 'none' }}>
                  {user.name}
                  {user.tier === 'premium' && <span className="badge badge-accent" style={{ marginLeft: 8 }}>Premium</span>}
                </NavLink>
                <button className="btn btn-sm" onClick={() => { logout(); navigate('/'); }}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn btn-sm btn-ghost">Sign in</NavLink>
                <NavLink to="/register" className="btn btn-sm btn-primary">Create account</NavLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="wrap section">
        <Outlet />
      </main>
    </div>
  );
}
