import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { Empty } from '../components/Cards.jsx';
import StationDashboard from './studio/StationDashboard.jsx';

/**
 * Entry point for the station-owner dashboard. Anyone signed in lands here;
 * the dashboard itself shows only the stations they own.
 */
export default function Studio() {
  const { user, ready } = useAuth();

  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) {
    return (
      <Empty>
        <p>Sign in to open your station dashboard and publish to your stations.</p>
        <Link className="btn btn-primary" to="/login">Sign in</Link>
      </Empty>
    );
  }

  return <StationDashboard />;
}
