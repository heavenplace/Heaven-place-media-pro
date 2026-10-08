import { LiveBadge } from '../../components/Cards.jsx';
import { formatDuration } from '../../api.js';

const isOnAir = (session) => session.status === 'live' && (!session.expires_at || new Date(session.expires_at) > new Date());

export default function Overview({ station, media, live, onOpenTab }) {
  const totalSeconds = media.reduce((sum, item) => sum + (item.duration_seconds || 0), 0);
  const hidden = media.filter((item) => !item.visible).length;
  const gated = media.filter((item) => item.access !== 'free').length;
  const unlocks = media.reduce((sum, item) => sum + (item.unlock_count || 0), 0);
  const relive = media.filter((item) => item.source === 'live').length;
  const onAir = live.find(isOnAir) ?? null;
  const recent = [...live].slice(0, 4);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid grid-stats">
        <div className="stat"><b>{media.length}</b><span>Items published</span></div>
        <div className="stat"><b>{gated}</b><span>Premium / paid</span></div>
        <div className="stat"><b>{formatDuration(totalSeconds)}</b><span>Total runtime</span></div>
        <div className="stat"><b>{unlocks}</b><span>Paid unlocks</span></div>
      </div>

      {hidden > 0 && <p className="tiny muted" style={{ margin: 0 }}>{hidden} item{hidden === 1 ? '' : 's'} hidden from listeners.</p>}
      {relive > 0 && <p className="tiny muted" style={{ margin: 0 }}>{relive} Relive recording{relive === 1 ? '' : 's'} on the station page.</p>}

      <section className="panel stack">
        <div className="between">
          <h2>On air</h2>
          {onAir ? <LiveBadge /> : <span className="badge">Off air</span>}
        </div>
        {onAir ? (
          <div className="between">
            <div>
              <b>{onAir.title}</b>
              <div className="tiny muted">
                {onAir.permanent || !onAir.expires_at
                  ? '24/7 — never ends'
                  : `Ends ${new Date(onAir.expires_at).toLocaleString()}`}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => onOpenTab('live')}>Manage live window</button>
          </div>
        ) : (
          <div className="between">
            <p className="muted small" style={{ margin: 0 }}>Nothing is on air right now.</p>
            <button className="btn btn-sm btn-primary" onClick={() => onOpenTab('live')}>Go live</button>
          </div>
        )}
      </section>

      <section className="stack">
        <h2>Recent live windows</h2>
        {recent.length === 0 ? (
          <p className="muted small">{station.name} has no live windows yet.</p>
        ) : (
          <div className="list">
            {recent.map((session) => (
              <div key={session.id} className="row-item">
                <div>
                  <b>{session.title}</b>
                  <div className="tiny muted">
                    {new Date(session.started_at).toLocaleString()} · {isOnAir(session) ? 'live' : 'ended'}
                    {session.recording_url && ' · relive available'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
