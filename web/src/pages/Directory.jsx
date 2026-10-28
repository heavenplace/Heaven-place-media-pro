import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, StationCard } from '../components/Cards.jsx';

export default function Directory({ kind }) {
  const [stations, setStations] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api(`/stations?kind=${kind}${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then((data) => setStations(data.stations))
      .finally(() => setLoading(false));
  };

  useEffect(load, [kind, query]);

  const title = kind === 'tv' ? 'TV stations' : 'Radio stations';

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <h1>{title}</h1>
        <div className="row">
          <input
            placeholder="Search stations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 220 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : stations.length === 0 ? (
        <Empty>No stations here yet.</Empty>
      ) : (
        <div className="grid grid-stations">
          {stations.map((station) => <StationCard key={station.id} station={station} />)}
        </div>
      )}
    </div>
  );
}
