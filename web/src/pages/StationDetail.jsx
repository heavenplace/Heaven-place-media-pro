import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { usePlayer } from '../components/Player.jsx';
import { Empty, LiveBadge, MediaRow } from '../components/Cards.jsx';

export default function StationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { play } = usePlayer();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', artwork_url: '' });
  const [liveForm, setLiveForm] = useState({ media_id: '', title: '', hours: 1 });
  const [busy, setBusy] = useState(false);
  const [followed, setFollowed] = useState(false);

  const load = useCallback(() => {
    api(`/stations/${id}`)
      .then((result) => {
        setData(result);
        setForm({
          name: result.station.name,
          description: result.station.description || '',
          artwork_url: result.station.artwork_url || ''
        });
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!user) {
      setFollowed(false);
      return;
    }
    api('/favorites')
      .then((data) =>
        setFollowed(data.favorites.some((favorite) => favorite.target_type === 'station' && favorite.target_id === Number(id)))
      )
      .catch(() => {});
  }, [user, id]);

  const toggleFollow = async (stationId) => {
    try {
      if (followed) await api(`/favorites/station/${stationId}`, { method: 'DELETE' });
      else await api('/favorites', { method: 'POST', body: { target_type: 'station', target_id: stationId } });
      setFollowed((value) => !value);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <div className="notice notice-error">{error}</div>;
  if (!data) return <div className="empty">Loading station…</div>;

  const { station, media, live } = data;
  const canManage = user && (user.role === 'admin' || user.id === station.owner_id);

  const saveStation = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/stations/${station.id}`, { method: 'PATCH', body: form });
      setEditing(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const goLive = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/live', {
        method: 'POST',
        body: {
          station_id: station.id,
          media_id: liveForm.media_id ? Number(liveForm.media_id) : undefined,
          title: liveForm.title,
          kind: station.kind === 'tv' ? 'video' : 'audio',
          hours: Number(liveForm.hours)
        }
      });
      setLiveForm({ media_id: '', title: '', hours: 1 });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const endLive = async () => {
    setBusy(true);
    try {
      await api(`/live/${live.id}/end`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const extendLive = async () => {
    setBusy(true);
    try {
      await api(`/live/${live.id}/extend`, { method: 'POST', body: { hours: 1 } });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="hero">
        <div className="between">
          <div className="row">
            <img
              src={station.artwork_url || `https://picsum.photos/seed/station${station.id}/300/300`}
              alt=""
              style={{ width: 92, height: 92, borderRadius: 14, objectFit: 'cover' }}
            />
            <div>
              <div className="row tiny muted" style={{ marginBottom: 6 }}>
                <span className="badge">{station.kind === 'tv' ? 'TV' : 'Radio'}</span>
                {station.verified && <span className="badge badge-ok">Verified</span>}
                {station.status !== 'approved' && <span className="badge badge-warn">{station.status}</span>}
              </div>
              <h1>{station.name}</h1>
              <p className="muted small" style={{ maxWidth: 560 }}>{station.description || 'No description yet.'}</p>
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {live ? <LiveBadge /> : <span className="badge">Off air</span>}
            {live && live.media_url && (
              <button
                className="btn btn-primary"
                onClick={() =>
                  play({
                    id: live.media_id,
                    title: live.title,
                    subtitle: `${station.name} · on air`,
                    type: live.media_type || live.kind,
                    url: live.media_url,
                    live: true
                  })
                }
              >
                Tune in
              </button>
            )}
            {canManage && <button className="btn btn-sm" onClick={() => setEditing((value) => !value)}>Edit details</button>}
            {user && (
              <button className="btn btn-sm" onClick={() => toggleFollow(station.id)}>
                {followed ? 'Unfollow' : 'Follow station'}
              </button>
            )}
          </div>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      {canManage && editing && (
        <form className="panel stack" onSubmit={saveStation}>
          <h3>Edit station details</h3>
          <div>
            <label>Name</label>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </div>
          <div>
            <label>Description</label>
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          <div>
            <label>Artwork URL</label>
            <input value={form.artwork_url} onChange={(event) => setForm({ ...form, artwork_url: event.target.value })} />
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>Save changes</button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      {canManage && (
        <form className="panel stack" onSubmit={goLive}>
          <div className="between">
            <h3>Put something on air</h3>
            <span className="tiny muted">Any upload can be re-aired for 1–24 hours</span>
          </div>
          <div className="row">
            <div className="grow">
              <label>Existing media (optional)</label>
              <select value={liveForm.media_id} onChange={(event) => setLiveForm({ ...liveForm, media_id: event.target.value })}>
                <option value="">— pick a published item —</option>
                {media.map((item) => (
                  <option key={item.id} value={item.id}>{item.title} ({item.type})</option>
                ))}
              </select>
            </div>
            <div className="grow">
              <label>Or a live title</label>
              <input
                value={liveForm.title}
                onChange={(event) => setLiveForm({ ...liveForm, title: event.target.value })}
                placeholder="e.g. Morning Drive"
              />
            </div>
            <div style={{ width: 120 }}>
              <label>Hours</label>
              <input
                type="number"
                min="1"
                max="24"
                value={liveForm.hours}
                onChange={(event) => setLiveForm({ ...liveForm, hours: event.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>Go live</button>
            {live && (
              <>
                <button className="btn" type="button" onClick={extendLive} disabled={busy}>Extend 1 hour</button>
                <button className="btn btn-danger" type="button" onClick={endLive} disabled={busy}>End early</button>
              </>
            )}
          </div>
        </form>
      )}

      <section>
        <div className="between">
          <h2>On-demand</h2>
          <Link className="small muted" to="/studio">Publish something new</Link>
        </div>
        {media.length === 0 ? (
          <Empty>No shows published on this station yet.</Empty>
        ) : (
          <div className="grid grid-media">
            {media.map((item) => (
              <MediaRow
                key={item.id}
                item={{ ...item, station_name: station.name }}
                onPlay={(m) => play({ id: m.id, title: m.title, subtitle: station.name, type: m.type, url: m.url, artwork: station.artwork_url })}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
