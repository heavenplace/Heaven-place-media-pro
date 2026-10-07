import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDuration } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { usePlayer } from '../components/Player.jsx';
import { Empty } from '../components/Cards.jsx';
import FileDrop from '../components/FileDrop.jsx';

const emptyDraft = {
  station_id: '',
  type: 'audio',
  title: '',
  description: '',
  url: '',
  duration_seconds: 0,
  source: 'upload',
  access: 'free',
  price_cents: 0
};

export default function Studio() {
  const { user, ready } = useAuth();
  const { play } = usePlayer();
  const [stations, setStations] = useState([]);
  const [media, setMedia] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [liveForm, setLiveForm] = useState({ station_id: '', media_id: '', title: '', hours: 1 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    if (!user) return;
    api('/stations/mine')
      .then((data) => {
        setStations(data.stations);
        setDraft((value) => ({ ...value, station_id: value.station_id || data.stations[0]?.id || '' }));
        setLiveForm((value) => ({ ...value, station_id: value.station_id || data.stations[0]?.id || '' }));
      })
      .catch((err) => setError(err.message));
    api('/media').then((data) => setMedia(data.media)).catch(() => {});
  }, [user]);

  useEffect(load, [load]);

  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) {
    return (
      <Empty>
        <p>Sign in to open the studio and publish to your stations.</p>
        <Link className="btn btn-primary" to="/login">Sign in</Link>
      </Empty>
    );
  }

  const publish = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/media', { method: 'POST', body: draft });
      setDraft({ ...emptyDraft, station_id: draft.station_id });
      setNotice('Published — it is live in the listener app now.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const schedule = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/live', {
        method: 'POST',
        body: {
          station_id: Number(liveForm.station_id),
          media_id: liveForm.media_id ? Number(liveForm.media_id) : undefined,
          title: liveForm.title,
          hours: Number(liveForm.hours)
        }
      });
      setLiveForm({ ...liveForm, media_id: '', title: '' });
      setNotice('On air — every listener sees it immediately.');
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try {
      await api(`/media/${item.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const mine = media.filter((item) => stations.some((station) => station.id === item.station_id));

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="between">
        <h1>Creator studio</h1>
        <Link className="btn btn-sm" to="/radio">Manage stations</Link>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      {stations.length === 0 ? (
        <Empty>
          <p>{user.role === 'admin' ? 'You do not own a station.' : 'You do not have a station yet.'}</p>
          <p className="tiny muted">
            {user.role === 'admin'
              ? 'Create one from the control room: Stations → Add station.'
              : 'The control room assigns stations to their owners — ask them to put one in your name.'}
          </p>
        </Empty>
      ) : (
        <>
          <form className="panel stack" onSubmit={publish}>
            <h2>Publish audio or video</h2>
            <div className="row">
              <div className="grow">
                <label>Station</label>
                <select value={draft.station_id} onChange={(event) => setDraft({ ...draft, station_id: Number(event.target.value), type: stations.find((s) => s.id === Number(event.target.value))?.kind === 'tv' ? 'video' : 'audio' })}>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>{station.name} ({station.kind})</option>
                  ))}
                </select>
              </div>
              <div className="grow">
                <label>Title</label>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
              </div>
              <div style={{ width: 140 }}>
                <label>Type</label>
                <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                </select>
              </div>
            </div>

            <div>
              <label>Notes</label>
              <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </div>

            <div>
              <label>File, or record it from this phone</label>
              <FileDrop
                accept={draft.type}
                label={`Upload ${draft.type}`}
                onUploaded={(file) =>
                  setDraft((value) => ({ ...value, url: file.url, duration_seconds: file.duration_seconds, source: 'upload' }))
                }
              />
              {draft.url && <div className="tiny muted" style={{ marginTop: 6 }}>Ready · {formatDuration(draft.duration_seconds)}</div>}
              <div style={{ marginTop: 8 }}>
                <label>…or paste a link</label>
                <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://" />
              </div>
            </div>

            <div className="row">
              <div style={{ width: 170 }}>
                <label>Access</label>
                <select value={draft.access} onChange={(event) => setDraft({ ...draft, access: event.target.value })}>
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                  <option value="paid">Paid download</option>
                </select>
              </div>
              {draft.access === 'paid' && (
                <div style={{ width: 170 }}>
                  <label>Price (cents)</label>
                  <input
                    type="number"
                    min="50"
                    value={draft.price_cents}
                    onChange={(event) => setDraft({ ...draft, price_cents: Number(event.target.value) })}
                  />
                </div>
              )}
            </div>

            <button className="btn btn-primary" type="submit">Publish</button>
          </form>

          <form className="panel stack" onSubmit={schedule}>
            <h2>Put an item back on air</h2>
            <p className="muted small">Any published item can stream live for a set window — up to 24 hours.</p>
            <div className="row">
              <div className="grow">
                <label>Station</label>
                <select value={liveForm.station_id} onChange={(event) => setLiveForm({ ...liveForm, station_id: event.target.value })}>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>{station.name}</option>
                  ))}
                </select>
              </div>
              <div className="grow">
                <label>Published item</label>
                <select value={liveForm.media_id} onChange={(event) => setLiveForm({ ...liveForm, media_id: event.target.value })}>
                  <option value="">— pick an item —</option>
                  {media
                    .filter((item) => item.station_id === Number(liveForm.station_id))
                    .map((item) => (
                      <option key={item.id} value={item.id}>{item.title}</option>
                    ))}
                </select>
              </div>
              <div className="grow">
                <label>Live title</label>
                <input value={liveForm.title} onChange={(event) => setLiveForm({ ...liveForm, title: event.target.value })} placeholder="Optional" />
              </div>
              <div style={{ width: 110 }}>
                <label>Hours</label>
                <input type="number" min="1" max="24" value={liveForm.hours} onChange={(event) => setLiveForm({ ...liveForm, hours: event.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Go live</button>
          </form>

          <section>
            <h2>My uploads</h2>
            {mine.length === 0 ? (
              <Empty>Nothing published yet.</Empty>
            ) : (
              <div className="list">
                {mine.map((item) => (
                  <div key={item.id} className="row-item">
                    <div>
                      <b>{item.title}</b>
                      <div className="tiny muted">
                        {item.station_name} · {item.type} · {item.access} · {formatDuration(item.duration_seconds)}
                        {item.visible ? '' : ' · hidden'}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => play({ id: item.id, title: item.title, subtitle: item.station_name, type: item.type, url: item.url })}
                      >
                        Play
                      </button>
                      <select
                        value={item.access}
                        onChange={async (event) => {
                          await api(`/media/${item.id}`, { method: 'PATCH', body: { access: event.target.value } });
                          load();
                        }}
                        style={{ width: 120 }}
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                        <option value="paid">Paid</option>
                      </select>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(item)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
