import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';
import Overview from './Overview.jsx';
import MediaTab from './MediaTab.jsx';
import LiveTab from './LiveTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import PodcastsTab from './PodcastsTab.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['media', 'Media'],
  ['live', 'Live windows'],
  ['podcasts', 'Podcasts'],
  ['settings', 'Station settings']
];

/**
 * Creator dashboard: publish media, go live from this phone (with a set window or
 * 24/7) and publish podcast episodes. Stations are scoped to their owner by the API;
 * the podcasts tab is its own thing and works even without a station.
 */
export default function StationDashboard() {
  const [stations, setStations] = useState([]);
  const [media, setMedia] = useState([]);
  const [live, setLive] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [stationId, setStationId] = useState(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/stations/mine');
      setStations(data.stations);
      setStationId((current) => (data.stations.some((s) => s.id === current) ? current : data.stations[0]?.id ?? null));
      const [mediaData, liveData, earningsData] = await Promise.all([
        api('/media/mine').catch(() => ({ media: [] })),
        api('/live/mine').catch(() => ({ live: [] })),
        api('/earnings/mine').catch(() => null)
      ]);
      setMedia(mediaData.media);
      setLive(liveData.live);
      setEarnings(earningsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const station = stations.find((item) => item.id === stationId) ?? null;
  const stationMedia = useMemo(() => media.filter((item) => item.station_id === stationId), [media, stationId]);
  const stationLive = useMemo(() => live.filter((item) => item.station_id === stationId), [live, stationId]);

  const notify = (message) => { setError(''); setNotice(message); };
  const fail = (message) => { setNotice(''); setError(message); };

  if (!ready) return <div className="empty">Loading your dashboard…</div>;

  const activeTab = TABS.some(([id]) => id === tab) ? tab : 'overview';

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <div>
          <h1>Creator dashboard</h1>
          <p className="muted small">Publish media and podcasts, and go live from this phone — for a set window or 24/7.</p>
        </div>
        {station && <Link className="btn btn-sm" to={`/station/${station.id}`}>View public page</Link>}
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'podcasts' ? (
        <PodcastsTab notify={notify} fail={fail} />
      ) : stations.length === 0 ? (
        <Empty>
          <p>You do not have a station yet.</p>
          <p className="tiny muted">
            Apply for one — FM only, or FM with its TV twin. The control room opens it in your name once the licence
            fee is paid, and a premium station can also publish premium and paid items. Podcasts are available right away.
          </p>
          <Link className="btn btn-primary" to="/apply">Apply for a station</Link>
        </Empty>
      ) : (
        <>
          {stations.length > 1 && (
            <div className="row">
              {stations.map((item) => (
                <button
                  key={item.id}
                  className={`btn btn-sm${item.id === stationId ? ' btn-primary' : ''}`}
                  onClick={() => setStationId(item.id)}
                >
                  {item.name}{item.is_live ? ' · Live' : ''}
                </button>
              ))}
            </div>
          )}

          {station && (
            <div className="panel-2 row" style={{ gap: 14, justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 12 }}>
                {station.artwork_url && (
                  <img src={station.artwork_url} alt="" width="46" height="46" style={{ borderRadius: 10, objectFit: 'cover' }} />
                )}
                <div>
                  <b>{station.name}</b>
                  <div className="tiny muted">
                    {station.kind === 'tv' ? 'TV' : 'Radio'} · {station.plan === 'premium' ? 'Premium plan' : 'Standard plan'} ·{' '}
                    {station.status} · {stationMedia.length} items
                  </div>
                </div>
              </div>
              {station.is_live
                ? <span className="badge badge-live"><span className="badge-pulse" /> Live</span>
                : <span className="badge">Off air</span>}
            </div>
          )}

          {station && station.plan !== 'premium' && (
            <p className="tiny muted" style={{ margin: 0 }}>
              This station is on the standard plan, so it publishes free content only.{' '}
              <Link to="/apply">Apply for the premium licence</Link> to run premium and paid items and earn from them.
            </p>
          )}

          {station && activeTab === 'overview' && (
            <Overview station={station} media={stationMedia} live={stationLive} earnings={earnings} onOpenTab={setTab} />
          )}
          {station && activeTab === 'media' && (
            <MediaTab station={station} media={stationMedia} reload={load} notify={notify} fail={fail} />
          )}
          {station && activeTab === 'live' && (
            <LiveTab station={station} media={stationMedia} live={stationLive} reload={load} notify={notify} fail={fail} />
          )}
          {station && activeTab === 'settings' && (
            <SettingsTab station={station} reload={load} notify={notify} fail={fail} />
          )}
        </>
      )}
    </div>
  );
}
