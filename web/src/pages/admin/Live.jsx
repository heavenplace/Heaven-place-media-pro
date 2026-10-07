import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Empty, LiveBadge } from '../../components/Cards.jsx';

export default function Live() {
  const [live, setLive] = useState([]);
  const [stations, setStations] = useState([]);
  const [form, setForm] = useState({ station_id: '', media_id: '', title: '', hours: 1 });
  const [media, setMedia] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/admin/live').then((data) => setLive(data.live)).catch((err) => setError(err.message));
    api('/stations').then((data) => setStations(data.stations)).catch(() => {});
    api('/media').then((data) => setMedia(data.media)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const goLive = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api('/live', {
        method: 'POST',
        body: {
          station_id: Number(form.station_id),
          media_id: form.media_id ? Number(form.media_id) : undefined,
          title: form.title,
          hours: Number(form.hours)
        }
      });
      setForm({ ...form, media_id: '', title: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const end = async (session) => {
    try {
      await api(`/admin/live/${session.id}/end`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <form className="panel stack" onSubmit={goLive}>
        <h2>Put a station on air</h2>
        <div className="row">
          <div className="grow">
            <label>Station</label>
            <select value={form.station_id} onChange={(event) => setForm({ ...form, station_id: event.target.value })} required>
              <option value="">— pick a station —</option>
              {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
            </select>
          </div>
          <div className="grow">
            <label>Published item</label>
            <select value={form.media_id} onChange={(event) => setForm({ ...form, media_id: event.target.value })}>
              <option value="">— optional —</option>
              {media
                .filter((item) => item.station_id === Number(form.station_id))
                .map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </div>
          <div className="grow">
            <label>Live title</label>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Optional if you picked an item" />
          </div>
          <div style={{ width: 110 }}>
            <label>Hours</label>
            <input type="number" min="1" max="24" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">Go live</button>
      </form>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="stack">
        <h2>Live control</h2>
        {live.length === 0 ? (
          <Empty>No sessions yet.</Empty>
        ) : (
          <div className="list">
            {live.map((session) => {
              const onAir = session.status === 'live' && new Date(session.expires_at) > new Date();
              return (
                <div key={session.id} className="row-item">
                  <div>
                    <div className="row">
                      <b>{session.title}</b>
                      {onAir ? <LiveBadge /> : <span className="badge">{session.status}</span>}
                    </div>
                    <div className="tiny muted">
                      {session.station_name} · started {new Date(session.started_at).toLocaleString()} · ends {new Date(session.expires_at).toLocaleTimeString()}
                    </div>
                  </div>
                  {onAir && (
                    <button className="btn btn-sm btn-danger" onClick={() => end(session)}>End now</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
