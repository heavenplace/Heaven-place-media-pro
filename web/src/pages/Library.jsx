import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { usePlayer } from '../components/Player.jsx';
import { Empty, MediaRow } from '../components/Cards.jsx';

export default function Library() {
  const { play } = usePlayer();
  const [media, setMedia] = useState([]);
  const [type, setType] = useState('');
  const [access, setAccess] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (access) params.set('access', access);
    if (query) params.set('q', query);
    api(`/media?${params}`)
      .then((data) => setMedia(data.media))
      .finally(() => setLoading(false));
  };

  useEffect(load, [type, access, query]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <h1>Media library</h1>
        <div className="row">
          <select value={type} onChange={(event) => setType(event.target.value)} style={{ width: 140 }}>
            <option value="">All types</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
          <select value={access} onChange={(event) => setAccess(event.target.value)} style={{ width: 160 }}>
            <option value="">All access</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
            <option value="paid">Paid</option>
          </select>
          <input
            placeholder="Search titles"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 200 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : media.length === 0 ? (
        <Empty>Nothing matches those filters.</Empty>
      ) : (
        <div className="grid grid-media">
          {media.map((item) => (
            <MediaRow
              key={item.id}
              item={item}
              onPlay={(m) => play({ id: m.id, title: m.title, subtitle: m.station_name, type: m.type, url: m.url })}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
