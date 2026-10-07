import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';
import Overview from './Overview.jsx';
import MediaTab from './MediaTab.jsx';
import LiveTab from './LiveTab.jsx';
import SettingsTab from './SettingsTab.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['media', 'Media'],
  ['live', 'Live windows'],
  ['settings', 'Station settings']
];

/**
 * Station-owner dashboard: pick one of your stations, then publish media, run
 * live windows, and edit the station's public details. Only stations owned by
 * the signed-in user ever load here (the API scopes every call to the owner).
 */
export default function StationDashboard() {
  const [stations, setStations] = useState([]);
  const [media, setMedia] = useState([]);
  const [live, setLive] = useState([]);
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
      const [mediaData, liveData] = await Promise.all([
        api('/media/mine').catch(() => ({ media: [] })),
        api('/live/mine').catch(() => ({ live: [] }))
      ]);
      setMedia(mediaData.media);
      setLive(liveData.live);
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

  if (!ready) return <div className="empty">Loading your stations…</div>;

  if (stations.length === 0) {
    return (
      <Empty>
        <p>You do not have a station yet.</p>
        <p className="tiny muted">
          The control room assigns stations to their owners — ask them to put one in your name and it will appear here.
        </p>
      </Empty>
    );
  }

  const activeTab = TABS.some(([id]) => id === tab) ? tab : 'overview';

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <div>
          <h1>Station dashboard</h1>
          <p className="muted small">Publish media and run live windows for the stations you own.</p>
        </div>
        {station && <Link className="btn btn-sm" to={`/station/${station.id}`}>View public page</Link>}
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

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
                {station.kind === 'tv' ? 'TV' : 'Radio'} · {station.status} · {stationMedia.length} items
              </div>
            </div>
          </div>
          {station.is_live
            ? <span className="badge badge-live"><span className="badge-pulse" /> Live</span>
            : <span className="badge">Off air</span>}
        </div>
      )}

      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {station && activeTab === 'overview' && (
        <Overview station={station} media={stationMedia} live={stationLive} onOpenTab={setTab} />
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
    </div>
  );
}
