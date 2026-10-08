import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { usePlayer } from '../components/Player.jsx';
import { Empty, LiveBadge } from '../components/Cards.jsx';
import FileDrop from '../components/FileDrop.jsx';

export default function Podcasts() {
  const { user } = useAuth();
  const { play } = usePlayer();
  const [podcasts, setPodcasts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [error, setError] = useState('');
  const [episode, setEpisode] = useState({ title: '', description: '', url: '', duration_seconds: 0 });
  const [live, setLive] = useState([]);

  const loadList = useCallback(() => {
    api('/podcasts').then((data) => setPodcasts(data.podcasts)).catch((err) => setError(err.message));
    api('/live').then((data) => setLive(data.live.filter((session) => session.media_type === 'audio'))).catch(() => {});
  }, []);

  useEffect(loadList, [loadList]);

  const open = async (podcast) => {
    setSelected(podcast);
    const data = await api(`/podcasts/${podcast.id}`);
    setEpisodes(data.episodes);
  };

  const addEpisode = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api(`/podcasts/${selected.id}/episodes`, { method: 'POST', body: episode });
      setEpisode({ title: '', description: '', url: '', duration_seconds: 0 });
      open(selected);
      loadList();
    } catch (err) {
      setError(err.message);
    }
  };

  const ownsSelected = selected && user && (user.role === 'admin' || user.id === selected.owner_id);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <h1>Podcasts</h1>
        <span className="tiny muted">Live and uploaded episodes</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {live.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h2>Live now</h2>
          <div className="grid grid-media">
            {live.map((session) => (
              <div key={session.id} className="panel-2 stack" style={{ gap: 8 }}>
                <div className="between"><b>{session.title}</b><LiveBadge /></div>
                <div className="tiny muted">{session.station_name}</div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    play({
                      id: session.media_id,
                      title: session.title,
                      subtitle: `${session.station_name} · on air`,
                      type: 'audio',
                      url: session.media_url,
                      artwork: session.station_artwork,
                      live: true
                    })
                  }
                >
                  Listen live
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {podcasts.length === 0 ? (
          <Empty>No podcasts yet.</Empty>
        ) : (
          <div className="grid grid-stations">
            {podcasts.map((podcast) => (
              <article key={podcast.id} className="card">
                <img
                  className="card-art"
                  src={podcast.artwork_url || `https://picsum.photos/seed/podcast${podcast.id}/600/600`}
                  alt=""
                  loading="lazy"
                />
                <div className="card-body">
                  <h3>{podcast.title}</h3>
                  <p className="muted small grow">{podcast.description || 'No description yet.'}</p>
                  <div className="tiny muted">{podcast.episode_count} episodes</div>
                  <div className="card-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => open(podcast)}>Open episodes</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="panel stack">
          <div className="between">
            <h2>{selected.title}</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>Close</button>
          </div>
          {episodes.length === 0 ? (
            <Empty>No episodes yet.</Empty>
          ) : (
            <div className="list">
              {episodes.map((item) => (
                <div key={item.id} className="row-item">
                  <div>
                    <b>{item.title}</b>
                    <div className="tiny muted">{item.description || 'No notes'}</div>
                  </div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => play({ title: item.title, subtitle: selected.title, type: 'audio', url: item.url, artwork: selected.artwork_url })}
                  >
                    Play
                  </button>
                </div>
              ))}
            </div>
          )}

          {ownsSelected && (
            <form className="panel-2 stack" onSubmit={addEpisode}>
              <h3>Add an episode</h3>
              <div>
                <label>Episode title</label>
                <input value={episode.title} onChange={(event) => setEpisode({ ...episode, title: event.target.value })} required />
              </div>
              <div>
                <label>Notes</label>
                <input value={episode.description} onChange={(event) => setEpisode({ ...episode, description: event.target.value })} />
              </div>
              <div>
                <label>Audio</label>
                <FileDrop
                  accept="audio"
                  label="Upload the episode, or record it from this phone"
                  onUploaded={(file) => setEpisode((value) => ({ ...value, url: file.url, duration_seconds: file.duration_seconds }))}
                />
                {episode.url && <div className="tiny muted" style={{ marginTop: 6 }}>Audio ready</div>}
              </div>
              <button className="btn btn-primary" type="submit">Publish episode</button>
            </form>
          )}
        </section>
      )}

    </div>
  );
}
