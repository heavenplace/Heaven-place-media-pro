import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

const STATUSES = ['pending', 'approved', 'suspended'];

export default function Stations() {
  const [stations, setStations] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/stations${filter ? `?status=${filter}` : ''}`)
      .then((data) => setStations(data.stations))
      .catch((err) => setError(err.message));
  }, [filter]);

  useEffect(load, [load]);

  const update = async (station, patch) => {
    try {
      await api(`/admin/stations/${station.id}`, { method: 'PATCH', body: patch });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <div className="between">
        <h2>Stations</h2>
        <div className="row">
          <select value={filter} onChange={(event) => setFilter(event.target.value)} style={{ width: 160 }}>
            <option value="">All</option>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {stations.length === 0 ? (
        <Empty>No stations in this view.</Empty>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Station</th>
                <th>Owner</th>
                <th>Items</th>
                <th>Status</th>
                <th>Verified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id}>
                  <td>
                    <Link to={`/station/${station.id}`}>{station.name}</Link>
                    <div className="tiny muted">{station.kind}</div>
                  </td>
                  <td className="small">{station.owner_name || '—'}</td>
                  <td>{station.media_count}</td>
                  <td>
                    <select value={station.status} onChange={(event) => update(station, { status: event.target.value })} style={{ width: 130 }}>
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>{station.verified ? 'Yes' : 'No'}</td>
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={() => update(station, { verified: !station.verified })}
                    >
                      {station.verified ? 'Unverify' : 'Verify'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
