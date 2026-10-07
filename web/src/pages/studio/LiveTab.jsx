import { useState } from 'react';
import { api } from '../../api.js';
import { Empty, LiveBadge } from '../../components/Cards.jsx';

const isOnAir = (session) => session.status === 'live' && new Date(session.expires_at) > new Date();

const remaining = (session) => {
  const ms = new Date(session.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m left` : `${minutes}m left`;
};

export default function LiveTab({ station, media, live, reload, notify, fail }) {
  const [form, setForm] = useState({ media_id: '', title: '', hours: 1 });
  const [busy, setBusy] = useState(false);

  const goLive = async (event) => {
    event.preventDefault();
    setBusy(true);
    fail('');
    try {
      await api('/live', {
        method: 'POST',
        body: {
          station_id: station.id,
          media_id: form.media_id ? Number(form.media_id) : undefined,
          title: form.title,
          hours: Number(form.hours)
        }
      });
      setForm({ media_id: '', title: '', hours: 1 });
      notify('On air — every listener sees it immediately.');
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
      notify('Live window ended.');
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
      <form className="panel stack" onSubmit={goLive}>
        <h3>Start a live window</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Pick one of your published items and put {station.name} on air for a set window (up to 24 hours).
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
          <div style={{ width: 110 }}>
            <label>Hours</label>
            <input type="number" min="1" max="24" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Go live'}
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
                </div>
                <div className="tiny muted">
                  Started {new Date(session.started_at).toLocaleString()} · ends {new Date(session.expires_at).toLocaleTimeString()} · {remaining(session)}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => extend(session)}>Extend +1 hour</button>
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
                  <div className="tiny muted">{new Date(session.started_at).toLocaleString()} · {session.status}</div>
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
