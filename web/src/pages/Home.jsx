import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { usePlayer } from '../components/Player.jsx';
import { AccessBadge, Empty, LiveBadge, MediaRow, StationCard } from '../components/Cards.jsx';
import GetTheApp from '../components/GetTheApp.jsx';

export default function Home() {
  const { play } = usePlayer();
  const [live, setLive] = useState([]);
  const [stations, setStations] = useState([]);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api('/live'), api('/stations'), api('/media')])
      .then(([liveData, stationData, mediaData]) => {
        setLive(liveData.live);
        setStations(stationData.stations);
        setMedia(mediaData.media);
      })
      .finally(() => setLoading(false));
  }, []);

  const playLive = (session) => {
    if (!session.media_url && !session.media_id) return;
    play({
      id: session.media_id,
      title: session.title,
      subtitle: `${session.station_name} · on air`,
      type: session.media_type || session.kind || 'audio',
      url: session.media_url,
      live: true
    });
  };

  const radio = stations.filter((s) => s.kind === 'radio').slice(0, 4);
  const tv = stations.filter((s) => s.kind === 'tv').slice(0, 4);

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="hero">
        <div className="between">
          <div>
            <span className="badge badge-accent">Streaming free for everyone</span>
            <h1 style={{ marginTop: 12 }}>Radio, TV and podcasts — live and on demand.</h1>
            <p className="muted" style={{ maxWidth: 620 }}>
              Listen or watch from any device, download what your tier allows, and go live from your own phone.
              Everything published in the control room appears here instantly.
            </p>
          </div>
          <div className="row">
            <Link className="btn btn-primary" to="/radio">Browse radio</Link>
            <Link className="btn" to="/tv">Browse TV</Link>
          </div>
        </div>
      </section>

      <GetTheApp />

      <section>
        <div className="between">
          <h2>On air now</h2>
          <Link className="small muted" to="/library">Browse the library</Link>
        </div>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : live.length === 0 ? (
          <Empty>Nothing is on air right now — check a station for its on-demand shows.</Empty>
        ) : (
          <div className="grid grid-media">
            {live.map((session) => (
              <article key={session.id} className="panel-2 stack" style={{ gap: 8 }}>
                <div className="between">
                  <b>{session.station_name}</b>
                  <LiveBadge />
                </div>
                <div className="small muted">{session.title}</div>
                <div className="row tiny muted">
                  <span className="badge">{session.media_type === 'video' ? 'Video' : 'Audio'}</span>
                  <span>{session.permanent || !session.expires_at ? 'on air 24/7' : `until ${new Date(session.expires_at).toLocaleTimeString()}`}</span>
                </div>
                <div className="card-actions">
                  {session.mime ? (
                    <Link className="btn btn-sm btn-primary" to={`/station/${session.station_id}`}>Watch live</Link>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => playLive(session)}>Tune in</button>
                      <Link className="btn btn-sm" to={`/station/${session.station_id}`}>Station</Link>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="between">
          <h2>Radio stations</h2>
          <Link className="small muted" to="/radio">See all</Link>
        </div>
        <div className="grid grid-stations">
          {radio.map((station) => <StationCard key={station.id} station={station} />)}
        </div>
      </section>

      <section>
        <div className="between">
          <h2>TV stations</h2>
          <Link className="small muted" to="/tv">See all</Link>
        </div>
        <div className="grid grid-stations">
          {tv.map((station) => <StationCard key={station.id} station={station} />)}
        </div>
      </section>

      <section>
        <h2>Latest uploads</h2>
        {media.length === 0 ? (
          <Empty>Nothing has been published yet.</Empty>
        ) : (
          <div className="grid grid-media">
            {media.slice(0, 6).map((item) => (
              <MediaRow
                key={item.id}
                item={item}
                onPlay={(m) => play({ id: m.id, title: m.title, subtitle: m.station_name, type: m.type, url: m.url })}
              />
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <AccessBadge access="free" />
          <span className="tiny muted">Streaming is free — downloads unlock by tier.</span>
        </div>
      </section>
    </div>
  );
}
