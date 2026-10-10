import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Directory from './pages/Directory.jsx';
import StationDetail from './pages/StationDetail.jsx';
import Podcasts from './pages/Podcasts.jsx';
import Library from './pages/Library.jsx';
import Favorites from './pages/Favorites.jsx';
import Premium from './pages/Premium.jsx';
import Studio from './pages/Studio.jsx';
import Apply from './pages/Apply.jsx';
import Auth from './pages/Auth.jsx';
import Account from './pages/Account.jsx';
import Admin from './pages/admin/Admin.jsx';
import { useAuth } from './AuthContext.jsx';

function RequireAdmin({ children }) {
  const { user, ready, logout } = useAuth();
  if (!ready) return <div className="empty">Loading…</div>;
  // The control-room app opens /admin directly, so a visitor who is not signed in is sent
  // to sign in and then back here, instead of silently landing in the listener app.
  if (!user) return <Navigate to="/login?next=%2Fadmin" replace />;
  if (user.role !== 'admin') {
    return (
      <div className="panel stack" style={{ maxWidth: 460 }}>
        <h1>The control room</h1>
        <p className="muted">
          This area is for administrators. You are signed in as {user.email}. Sign out and sign in with an
          administrator account to manage the platform.
        </p>
        <button className="btn btn-primary" onClick={logout}>
          Sign out
        </button>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="radio" element={<Directory kind="radio" />} />
        <Route path="tv" element={<Directory kind="tv" />} />
        <Route path="station/:id" element={<StationDetail />} />
        <Route path="podcasts" element={<Podcasts />} />
        <Route path="apply" element={<Apply />} />
        <Route path="library" element={<Library />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="premium" element={<Premium />} />
        <Route path="studio" element={<Studio />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="register" element={<Auth mode="register" />} />
        <Route path="forgot-password" element={<Auth mode="forgot" />} />
        <Route path="account" element={<Account />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<div className="empty">That page does not exist.</div>} />
      </Route>
    </Routes>
  );
}
