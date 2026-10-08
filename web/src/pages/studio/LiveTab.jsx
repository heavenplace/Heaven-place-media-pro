import { useState } from 'react';
import { api } from '../../api.js';
import { Empty, LiveBadge } from '../../components/Cards.jsx';
import LiveBroadcaster from '../../components/LiveBroadcaster.jsx';

const WINDOWS = [
  ['1', '1 hour'],
  ['4', '4 hours'],
  ['12', '12 hours'],
  ['24', '24 hours'],
  ['permanent', '24/7 — never ends']
];

const isForever = (session) => Boolean(session.permanent) || !session.expires_at;

const isOnAir = (session) => session.status === 'live' && (!session.expires_at || new Date(session.expires_at) > new Date());

const remaining = (session) => {
  if (isForever(session)) return 'never ends';
  const ms = new Date(session.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m left` : `${minutes}m left`;
};

export default function LiveTab({ station, media, live, reload, notify, fail }) {
  const [form, setForm] = useState({ media_id: '', title: '', duration: '1' });
  const [busy, setBusy] = useState(false);

  const goLive = async (event) => {
    event.preventDefault();
    const forever = form.duration === 'permanent';
    setBusy(true);
    fail('');
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
      setForm({ media_id: '', title: '', duration: '1' });
      notify(forever ? 'On air 24/7 — every listener sees it immediately.' : 'On air — every listener sees it immediately.');
      reload();
    } catch (err) {
      fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const end = async (session) => {
    try {
      await api(`/live/${session.id}/end`, { method: 'POST' });
      notify(session.mime ? 'Off air — the broadcast is saved as a Relive item.' : 'Live window ended.');
      reload();
    } catch (err) {
      fail(err.message);
    }
  };

  const extend = async (session) => {
    try {
      await api(`/live/${session.id}/extend`, { method: 'POST', body: { hours: 1 } });
      notify('Added one hour to the live window.');
      reload();
    } catch (err) {
      fail(err.message);
    }
  };

  const active = live.filter(isOnAir);
  const past = live.filter((session) => !isOnAir(session));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <LiveBroadcaster station={station} onStarted={reload} onEnded={reload} notify={notify} fail={fail} />

      <form className="panel stack" onSubmit={goLive}>
        <h3>Put something you published on air</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Pick one of your published items and air it on {station.name} for a set window — or 24/7.
        </p>

        <div className="row">
          <div className="grow">
            <label>Published item</label>
            <select value={form.media_id} onChange={(event) => setForm({ ...form, media_id: event.target.value })}>
              <option value="">— pick an item —</option>
              {media.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
          <div className="grow">
            <label>Live title</label>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Optional if you picked an item"
            />
          </div>
          <div style={{ minWidth: 190 }}>
            <label>How long</label>
            <select value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })}>
              {WINDOWS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : form.duration === 'permanent' ? 'Go live 24/7' : 'Go live'}
        </button>
      </form>

      <section className="stack">
        <h2>On air now</h2>
        {active.length === 0 ? (
          <Empty>{station.name} is off air. Start a live window above to go live.</Empty>
        ) : (
          <div className="list">
            {active.map((session) => (
              <div key={session.id} className="panel stack" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <b>{session.title}</b>
                  <LiveBadge />
                  {session.mime && <span className="badge badge-accent">{session.mime.startsWith('audio') ? 'Phone · audio' : 'Phone · video'}</span>}
                </div>
                <div className="tiny muted">
                  Started {new Date(session.started_at).toLocaleString()} · {isForever(session) ? '24/7 — never ends' : `ends ${new Date(session.expires_at).toLocaleTimeString()}`} · {remaining(session)}
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => extend(session)} disabled={isForever(session)}>Extend +1 hour</button>
                  <button className="btn btn-sm btn-danger" onClick={() => end(session)}>End now</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>Past windows</h2>
        {past.length === 0 ? (
          <p className="muted small">No past windows yet.</p>
        ) : (
          <div className="list">
            {past.slice(0, 8).map((session) => (
              <div key={session.id} className="row-item">
                <div>
                  <b>{session.title}</b>
                  <div className="tiny muted">
                    {new Date(session.started_at).toLocaleString()} · {session.status}
                    {session.recording_url && ' · Relive available on the station page'}
                  </div>
                </div>
                <span className="badge">{session.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
