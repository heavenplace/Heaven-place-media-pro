import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const STATS = [
  ['active_listeners', 'Active listeners'],
  ['live_now', 'On air now'],
  ['stations', 'Stations'],
  ['pending_stations', 'Stations to review'],
  ['media', 'Media items'],
  ['podcasts', 'Podcasts'],
  ['users', 'Accounts'],
  ['pending_requests', 'Pending requests'],
  ['unlocks', 'Downloads unlocked']
];

export default function Overview() {
  const [overview, setOverview] = useState(null);
  const [stations, setStations] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => {
      api('/admin/overview').then((data) => setOverview(data.overview)).catch((err) => setError(err.message));
      api('/admin/stations-summary').then((data) => setStations(data.stations)).catch(() => {});
    };
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <div className="notice notice-error">{error}</div>;
  if (!overview) return <div className="empty">Loading…</div>;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid grid-stats">
        {STATS.map(([key, label]) => (
          <div key={key} className="stat">
            <b>{overview[key]}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="between">
          <h2>Per-station summary</h2>
          <span className="tiny muted">Listeners in the last 5 minutes · total air time</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Station</th>
              <th>Type</th>
              <th>Status</th>
              <th>Active listeners</th>
              <th>Sessions</th>
              <th>Stream time</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr key={station.id}>
                <td>{station.name}</td>
                <td>{station.kind}</td>
                <td>
                  <span className={`badge ${station.status === 'approved' ? 'badge-ok' : 'badge-warn'}`}>{station.status}</span>
                </td>
                <td>{station.active_listeners}</td>
                <td>{station.sessions}</td>
                <td>{station.minutes_aired} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
