import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useConfig } from '../config.js';
import { Empty, MediaRow } from '../components/Cards.jsx';
import { usePlayer } from '../components/Player.jsx';

export default function Premium() {
  const { user, ready, refresh } = useAuth();
  const { play } = usePlayer();
  const config = useConfig();
  const [mine, setMine] = useState({ requests: [], unlocks: [], subscription: null });
  const [paid, setPaid] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (user) api('/requests/mine').then(setMine).catch((err) => setError(err.message));
    api('/media?access=paid').then((data) => setPaid(data.media)).catch(() => {});
  }, [user]);

  useEffect(load, [load]);

  // Landing back from Stripe: confirm the payment with the API and pick up the
  // new tier. The webhook also fulfils, so this is only the browser's fast path.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('checkout');
    if (!outcome) return;
    const sessionId = params.get('session_id');
    window.history.replaceState({}, '', window.location.pathname);

    if (outcome === 'cancelled') {
      setMessage('Checkout cancelled — nothing was charged.');
      return;
    }
    if (!sessionId) return;

    api('/payments/confirm', { method: 'POST', body: { session_id: sessionId } })
      .then(async (data) => {
        setMessage(data.message || 'Payment received.');
        await refresh();
      })
      .catch((err) => setError(err.message))
      .finally(load);
  }, [load, refresh]);

  const startCheckout = async (kind, mediaId = null) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const data = await api('/payments/checkout', {
        method: 'POST',
        body: { kind, media_id: mediaId, origin: window.location.origin }
      });
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

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
          ) : config?.payments_enabled ? (
            <div className="stack" style={{ gap: 8 }}>
              <button className="btn btn-primary" onClick={() => startCheckout('premium')} disabled={busy}>
                {busy ? <span className="spinner" /> : `Subscribe by card — ${formatMoney(config.premium_price_cents)}/mo`}
              </button>
              <button className="btn btn-sm" onClick={askPremium}>Ask the control room instead</button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={askPremium}>Request Premium membership</button>
          )}
        </div>
      </section>

      <section>
        <div className="between">
          <h2>Paid downloads</h2>
          <span className="tiny muted">
            {config?.payments_enabled ? 'Buy with a card, or ask the control room to unlock one' : 'Request an item and the control room unlocks it'}
          </span>
        </div>
        {paid.length === 0 ? (
          <Empty>No paid items yet.</Empty>
        ) : (
          <div className="grid grid-media">
            {paid.map((item) => (
              <MediaRow
                key={item.id}
                item={item}
                onPlay={(m) => play({ id: m.id, title: m.title, subtitle: m.station_name, type: m.type, url: m.url, artwork: m.station_artwork })}
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
