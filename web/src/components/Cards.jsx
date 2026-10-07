import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDuration, formatMoney, timeAgo } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useConfig } from '../config.js';

export function LiveBadge() {
  return (
    <span className="badge badge-live">
      <span className="badge-pulse" /> Live
    </span>
  );
}

export function AccessBadge({ access, price_cents }) {
  if (access === 'free') return <span className="badge">Free</span>;
  if (access === 'premium') return <span className="badge badge-accent">Premium</span>;
  return <span className="badge badge-warn">{formatMoney(price_cents)}</span>;
}

export function StationCard({ station, onOpen }) {
  const art = station.artwork_url || `https://picsum.photos/seed/station${station.id}/600/600`;
  return (
    <article className="card">
      <img className="card-art" src={art} alt="" loading="lazy" />
      <div className="card-body">
        <div className="between">
          <h3>{station.name}</h3>
          {station.is_live ? <LiveBadge /> : null}
        </div>
        <p className="muted small grow">{station.description || 'No description yet.'}</p>
        <div className="row tiny muted">
          <span className="badge">{station.kind === 'tv' ? 'TV' : 'Radio'}</span>
          {station.verified && <span className="badge badge-ok">Verified</span>}
          <span>{station.media_count ?? 0} items</span>
        </div>
        {onOpen ? (
          <div className="card-actions">
            <button className="btn btn-sm btn-primary" onClick={() => onOpen(station)}>Open station</button>
          </div>
        ) : (
          <div className="card-actions">
            <Link className="btn btn-sm btn-primary" to={`/station/${station.id}`}>Open station</Link>
          </div>
        )}
      </div>
    </article>
  );
}

export function MediaRow({ item, onPlay, onChanged }) {
  const art = `https://picsum.photos/seed/media${item.id}/200/200`;
  return (
    <div className="media-card">
      <div className="media-thumb">{item.type === 'video' ? '🎬' : '🎵'}</div>
      <div className="grow stack" style={{ gap: 6 }}>
        <div className="between">
          <b>{item.title}</b>
          <AccessBadge access={item.access} price_cents={item.price_cents} />
        </div>
        <div className="tiny muted">
          {item.station_name && <span>{item.station_name} · </span>}
          {formatDuration(item.duration_seconds)} · {timeAgo(item.created_at)}
          {item.source === 'phone' && ' · recorded on phone'}
        </div>
        <div className="card-actions">
          <button className="btn btn-sm btn-primary" onClick={() => onPlay(item)}>Play</button>
          {item.downloadable && (
            <DownloadButton item={item} onChanged={onChanged} />
          )}
        </div>
      </div>
    </div>
  );
}

export function DownloadButton({ item, onChanged }) {
  const { user } = useAuth();
  const config = useConfig();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const sellWithCard = item.access === 'paid' && Boolean(config?.payments_enabled);

  // Hands the browser to Stripe's hosted checkout for this item.
  const startCheckout = async () => {
    const data = await api('/payments/checkout', {
      method: 'POST',
      body: { kind: 'download', media_id: item.id, origin: window.location.origin }
    });
    window.location.assign(data.url);
  };

  const buy = async () => {
    if (!user) return setMessage('Sign in to buy this download');
    setBusy(true);
    setMessage('');
    try {
      await startCheckout();
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
    }
  };

  const download = async () => {
    if (!user) return setMessage('Sign in to download');
    setBusy(true);
    setMessage('');
    try {
      const data = await api(`/media/${item.id}/download`);
      const link = document.createElement('a');
      link.href = data.url;
      link.download = data.title;
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      onChanged?.();
    } catch (error) {
      if (error.status === 402 && sellWithCard) {
        try {
          await startCheckout();
        } catch (inner) {
          setMessage(inner.message);
        }
      } else if (error.status === 402) {
        try {
          await api('/requests', {
            method: 'POST',
            body: { kind: item.access === 'premium' ? 'premium' : 'download', media_id: item.id }
          });
          setMessage('Request sent to the control room');
        } catch (inner) {
          setMessage(inner.message);
        }
      } else {
        setMessage(error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="row" style={{ gap: 8 }}>
      {sellWithCard && (
        <button className="btn btn-sm btn-primary" onClick={buy} disabled={busy}>
          Buy {formatMoney(item.price_cents)}
        </button>
      )}
      <button className="btn btn-sm" onClick={download} disabled={busy}>
        {busy ? <span className="spinner" /> : 'Download'}
      </button>
      {message && <span className="tiny muted">{message}</span>}
    </span>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function FeedItem({ entry }) {
  const live = entry.type?.startsWith('live');
  return (
    <div className={`feed-item${live ? ' live' : ''}`}>
      <div className="grow">
        <div className="small">{entry.detail || entry.type}</div>
        <div className="tiny muted">
          {entry.user_name || entry.user_email || 'Guest'}
          {entry.station_name ? ` · ${entry.station_name}` : ''} · {timeAgo(entry.created_at)}
        </div>
      </div>
    </div>
  );
}
