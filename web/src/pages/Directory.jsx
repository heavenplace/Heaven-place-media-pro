import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Empty, StationCard } from '../components/Cards.jsx';
import FileDrop from '../components/FileDrop.jsx';

export default function Directory({ kind }) {
  const { user } = useAuth();
  const [stations, setStations] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', description: '', artwork_url: '' });

  const load = () => {
    setLoading(true);
    api(`/stations?kind=${kind}${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then((data) => setStations(data.stations))
      .finally(() => setLoading(false));
  };

  useEffect(load, [kind, query]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const data = await api('/stations', { method: 'POST', body: { ...form, kind } });
      setNotice(
        data.station.status === 'approved'
          ? 'Station created.'
          : 'Station submitted — the control room will approve it shortly.'
      );
      setForm({ name: '', description: '', artwork_url: '' });
      setCreating(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

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
          {user && (
            <button className="btn btn-primary" onClick={() => setCreating((value) => !value)}>
              {creating ? 'Close' : `Add ${kind === 'tv' ? 'TV' : 'radio'} station`}
            </button>
          )}
        </div>
      </div>

      {notice && <div className="notice notice-ok">{notice}</div>}

      {user && creating && (
        <form className="panel stack" onSubmit={submit}>
          <h3>New {kind === 'tv' ? 'TV' : 'radio'} station</h3>
          <div>
            <label>Station name</label>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Heaven Radio"
              required
            />
          </div>
          <div>
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What do you broadcast?"
            />
          </div>
          <div>
            <label>Artwork</label>
            <FileDrop accept="image" label="Upload station artwork" record={false} onUploaded={(file) => setForm({ ...form, artwork_url: file.url })} />
            {form.artwork_url && <div className="tiny muted" style={{ marginTop: 6 }}>Artwork ready: {form.artwork_url}</div>}
          </div>
          {error && <div className="notice notice-error">{error}</div>}
          <div className="row">
            <button className="btn btn-primary" type="submit">Submit station</button>
            <span className="tiny muted">Admin-created stations publish immediately; yours is reviewed first.</span>
          </div>
        </form>
      )}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : stations.length === 0 ? (
        <Empty>No stations here yet. {user ? 'Add the first one.' : 'Sign in to add one.'}</Empty>
      ) : (
        <div className="grid grid-stations">
          {stations.map((station) => <StationCard key={station.id} station={station} />)}
        </div>
      )}
    </div>
  );
}
