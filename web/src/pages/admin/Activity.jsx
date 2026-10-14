import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Empty, FeedItem } from '../../components/Cards.jsx';

export default function Activity() {
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api('/admin/activity?limit=80').then((data) => setActivity(data.activity)).catch((err) => setError(err.message));
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="stack">
      <div className="between">
        <h2>Listener activity</h2>
        <span className="tiny muted">Updates every few seconds</span>
      </div>
      {error && <div className="notice notice-error">{error}</div>}
      {activity.length === 0 ? (
        <Empty>No activity yet — it appears here as listeners use the app.</Empty>
      ) : (
        <div className="list">
          {activity.map((entry) => <FeedItem key={entry.id} entry={entry} />)}
        </div>
      )}
    </div>
  );
}
