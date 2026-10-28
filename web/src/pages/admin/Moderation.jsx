import { useCallback, useEffect, useState } from 'react';
import { api, formatDuration, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

const FILTERS = [
  ['flagged', 'Needs review'],
  ['all', 'Everything'],
  ['hidden', 'Hidden']
];

const MESSAGES = {
  flag: 'Flagged for review.',
  unflag: 'Flag cleared.',
  hide: 'Hidden from listeners.',
  restore: 'Visible to listeners again.'
};

export default function Moderation() {
  const [summary, setSummary] = useState(null);
  const [media, setMedia] = useState([]);
  const [filter, setFilter] = useState('flagged');
  const [query, setQuery] = useState('');
  const [reasons, setReasons] = useState({});
  const [busy, setBusy] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (query.trim()) params.set('q', query.trim());
    const suffix = params.toString() ? `?${params}` : '';
    api(`/admin/moderation${suffix}`)
      .then((data) => {
        setSummary(data.summary);
        setMedia(data.media);
        setError('');
      })
      .catch((err) => setError(err.message));
  }, [filter, query]);

  useEffect(load, [load]);

  const act = async (item, action, extra = {}) => {
    setBusy(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/media/${item.id}/moderate`, { method: 'POST', body: { action, ...extra } });
      setNotice(MESSAGES[action]);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(0);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove "${item.title}" from ${item.station_name}? Listeners lose it for good.`)) return;
    setBusy(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/media/${item.id}`, { method: 'DELETE' });
      setNotice(`Removed "${item.title}".`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(0);
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="between">
        <h2>Moderation</h2>
        <span className="tiny muted">Review what creators published, flag it, hide it or take it down</span>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <span className="badge">{summary ? `${summary.total} published` : '—'}</span>
        <span className="badge badge-warn">{summary ? `${summary.flagged} flagged` : '—'}</span>
        <span className="badge badge-danger">{summary ? `${summary.hidden} hidden` : '—'}</span>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {FILTERS.map(([value, label]) => (
          <button key={value} className={`btn btn-sm${filter === value ? ' btn-primary' : ''}`} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a title, station or creator" />

      {error && <div className="notice notice-error small">{error}</div>}
      {notice && <div className="notice notice-ok small">{notice}</div>}

      {media.length === 0 ? (
        <Empty>{filter === 'flagged' ? 'Nothing waiting for review.' : 'No content in this view.'}</Empty>
      ) : (
        <div className="list">
          {media.map((item) => (
            <div key={item.id} className="panel stack" style={{ gap: 8 }}>
              <div className="between">
                <b>{item.title}</b>
                <div className="row" style={{ gap: 6 }}>
                  {item.flagged && <span className="badge badge-warn">Flagged</span>}
                  {!item.visible && <span className="badge badge-danger">Hidden</span>}
                  {item.source === 'live' && <span className="badge badge-accent">Relive</span>}
                </div>
              </div>

              <div className="tiny muted">
                {item.station_name} ({item.station_kind}) · {item.owner_name || item.owner_email || 'no owner account'} ·{' '}
                {item.type} · {formatDuration(item.duration_seconds)} · published {timeAgo(item.created_at)}
              </div>

              {item.flag_reason && <div className="small">Flagged: {item.flag_reason}</div>}

              {!item.flagged && (
                <input
                  value={reasons[item.id] || ''}
                  onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })}
                  placeholder="Why it needs a look (optional)"
                />
              )}

              <div className="row" style={{ gap: 6 }}>
                <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer">Open</a>
                {item.flagged ? (
                  <button className="btn btn-sm" onClick={() => act(item, 'unflag')} disabled={busy === item.id}>Clear flag</button>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={() => act(item, 'flag', { reason: reasons[item.id] })}
                    disabled={busy === item.id}
                  >
                    Flag
                  </button>
                )}
                {item.visible ? (
                  <button className="btn btn-sm" onClick={() => act(item, 'hide')} disabled={busy === item.id}>Hide</button>
                ) : (
                  <button className="btn btn-sm" onClick={() => act(item, 'restore')} disabled={busy === item.id}>Restore</button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => remove(item)} disabled={busy === item.id}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
