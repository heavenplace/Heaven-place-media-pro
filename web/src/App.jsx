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
import Auth from './pages/Auth.jsx';
import Admin from './pages/admin/Admin.jsx';
import { useAuth } from './AuthContext.jsx';

function RequireAdmin({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="empty">Loading…</div>;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
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
        <Route path="library" element={<Library />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="premium" element={<Premium />} />
        <Route path="studio" element={<Studio />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="register" element={<Auth mode="register" />} />
        <Route path="forgot-password" element={<Auth mode="forgot" />} />
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
