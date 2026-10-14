import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Empty, LiveBadge } from '../../components/Cards.jsx';
import LiveBroadcaster from '../../components/LiveBroadcaster.jsx';
import { QUALITY, WINDOWS, stationQuality, stationWindow, rememberStreamSettings } from '../../liveSettings.js';

/**
 * The control room's live desk offers every station the settings the owner's own studio
 * does — the item to air, the live title, the window and the quality the station
 * broadcasts at — because a station the control room has to take live is set up exactly
 * like one its owner starts. Whatever is picked here is remembered on the station, so its
 * studio and its phone app go live with the same settings next time.
 */
export default function Live() {
  const [live, setLive] = useState([]);
  const [stations, setStations] = useState([]);
  const [form, setForm] = useState({ station_id: '', media_id: '', title: '', duration: '1', quality: 'audio' });
  const [media, setMedia] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api('/admin/live').then((data) => setLive(data.live)).catch((err) => setError(err.message));
    api('/stations').then((data) => setStations(data.stations)).catch(() => {});
    api('/media').then((data) => setMedia(data.media)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const station = stations.find((item) => item.id === Number(form.station_id)) ?? null;

  // Picking a station loads the settings it goes live with, the way its own studio opens.
  const pickStation = (id) => {
    const picked = stations.find((item) => item.id === Number(id)) ?? null;
    setForm({ ...form, station_id: id, media_id: '', title: '', duration: stationWindow(picked), quality: stationQuality(picked) });
  };

  const goLive = async (event) => {
    event.preventDefault();
    if (!station) return;
    setError('');
    setNotice('');
    const forever = form.duration === 'permanent';
    try {
      await api('/live', {
        method: 'POST',
        body: {
          station_id: station.id,
          media_id: form.media_id ? Number(form.media_id) : undefined,
          title: form.title,
          kind: station.kind === 'tv' ? 'video' : 'audio',
          ...(forever ? { permanent: true } : { hours: Number(form.duration) })
        }
      });
      await rememberStreamSettings(station.id, { quality: form.quality, window: form.duration });
      setForm({ ...form, media_id: '', title: '' });
      setNotice(`${station.name} is on air ${forever ? '24/7' : `for ${WINDOWS.find(([value]) => value === form.duration)?.[1] ?? form.duration}`}.`);
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
        <p className="muted small" style={{ margin: 0 }}>
          The same settings the station's own studio offers — the window and the quality it
          broadcasts at are kept on the station, so its studio and its phone app open with them.
        </p>
        <div className="row">
          <div className="grow">
            <label>Station</label>
            <select value={form.station_id} onChange={(event) => pickStation(event.target.value)} required>
              <option value="">— pick a station —</option>
              {stations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
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
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={station ? `${station.name} live` : 'Optional if you picked an item'} />
          </div>
        </div>
        <div className="row">
          <div style={{ minWidth: 190 }}>
            <label>How long</label>
            <select value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })}>
              {WINDOWS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 210 }}>
            <label>Quality</label>
            <select value={form.quality} onChange={(event) => setForm({ ...form, quality: event.target.value })}>
              {Object.entries(QUALITY).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
            </select>
          </div>
          <div className="grow" style={{ alignSelf: 'end' }}>
            <button className="btn btn-primary" type="submit" disabled={!station}>Go live</button>
          </div>
        </div>
      </form>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      {station && (
        <LiveBroadcaster
          key={station.id}
          station={station}
          onStarted={load}
          onEnded={load}
          notify={setNotice}
          fail={setError}
        />
      )}

      <section className="stack">
        <h2>Live control</h2>
        {live.length === 0 ? (
          <Empty>No sessions yet.</Empty>
        ) : (
          <div className="list">
            {live.map((session) => {
              const onAir = session.status === 'live' && (!session.expires_at || new Date(session.expires_at) > new Date());
              return (
                <div key={session.id} className="row-item">
                  <div>
                    <div className="row">
                      <b>{session.title}</b>
                      {onAir ? <LiveBadge /> : <span className="badge">{session.status}</span>}
                    </div>
                    <div className="tiny muted">
                      {session.station_name} · started {new Date(session.started_at).toLocaleString()} · {session.permanent || !session.expires_at ? '24/7 — never ends' : `ends ${new Date(session.expires_at).toLocaleTimeString()}`}
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
