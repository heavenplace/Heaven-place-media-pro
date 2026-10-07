import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Empty, MediaRow } from '../components/Cards.jsx';
import { usePlayer } from '../components/Player.jsx';

export default function Premium() {
  const { user, ready } = useAuth();
  const { play } = usePlayer();
  const [mine, setMine] = useState({ requests: [], unlocks: [], subscription: null });
  const [paid, setPaid] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (user) api('/requests/mine').then(setMine).catch((err) => setError(err.message));
    api('/media?access=paid').then((data) => setPaid(data.media)).catch(() => {});
  }, [user]);

  useEffect(load, [load]);

  const askPremium = async () => {
    setError('');
    setMessage('');
    try {
      await api('/requests', { method: 'POST', body: { kind: 'premium' } });
      setMessage('Your Premium request is in the control room — approval unlocks it instantly.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const isPremium = user?.tier === 'premium' || mine.subscription;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <h1>Premium &amp; downloads</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        Streaming is free for everyone. Downloads unlock by tier: free items always, the Premium library with a
        membership, and paid items one at a time.
      </p>

      {error && <div className="notice notice-error">{error}</div>}
      {message && <div className="notice notice-ok">{message}</div>}

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="panel stack">
          <span className="badge">Free</span>
          <h2>Listener</h2>
          <p className="muted small grow">Live radio and TV, every podcast episode, and every free download.</p>
          <span className="tiny muted">Always available</span>
        </div>

        <div className="panel stack" style={{ borderColor: 'var(--accent)' }}>
          <span className="badge badge-accent">Premium</span>
          <h2>$6 / month</h2>
          <p className="muted small grow">
            The full Premium library and every premium download, plus priority on new stations.
          </p>
          {!ready ? (
            <span className="spinner" />
          ) : !user ? (
            <Link className="btn btn-primary" to="/login">Sign in to subscribe</Link>
          ) : isPremium ? (
            <div className="notice notice-ok small">
              You are a Premium member
              {mine.subscription?.current_period_end
                ? ` — renews ${new Date(mine.subscription.current_period_end).toLocaleDateString()}`
                : ''}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={askPremium}>Request Premium membership</button>
          )}
        </div>
      </section>

      <section>
        <div className="between">
          <h2>Paid downloads</h2>
          <span className="tiny muted">Request an item and the control room unlocks it</span>
        </div>
        {paid.length === 0 ? (
          <Empty>No paid items yet.</Empty>
        ) : (
          <div className="grid grid-media">
            {paid.map((item) => (
              <MediaRow
                key={item.id}
                item={item}
                onPlay={(m) => play({ id: m.id, title: m.title, subtitle: m.station_name, type: m.type, url: m.url })}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </section>

      {user && (
        <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="panel stack">
            <h3>My requests</h3>
            {mine.requests.length === 0 ? (
              <p className="muted small">Nothing requested yet.</p>
            ) : (
              <div className="list">
                {mine.requests.map((request) => (
                  <div key={request.id} className="row-item">
                    <div>
                      <b>{request.kind === 'premium' ? 'Premium membership' : request.media_title || 'Download'}</b>
                      <div className="tiny muted">{new Date(request.created_at).toLocaleString()}</div>
                    </div>
                    <span className={`badge ${request.status === 'approved' ? 'badge-ok' : request.status === 'denied' ? 'badge-warn' : ''}`}>
                      {request.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel stack">
            <h3>My unlocked downloads</h3>
            {mine.unlocks.length === 0 ? (
              <p className="muted small">No downloads unlocked yet.</p>
            ) : (
              <div className="list">
                {mine.unlocks.map((unlock) => (
                  <div key={unlock.id} className="row-item">
                    <div>
                      <b>{unlock.media_title}</b>
                      <div className="tiny muted">{formatMoney(unlock.price_cents || 0)} · unlocked {new Date(unlock.created_at).toLocaleDateString()}</div>
                    </div>
                    <a className="btn btn-sm" href={unlock.media_url} target="_blank" rel="noreferrer">Download</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
