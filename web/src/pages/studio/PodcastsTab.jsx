import { useCallback, useEffect, useState } from 'react';
import { api, formatDuration, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';
import FileDrop from '../../components/FileDrop.jsx';

const emptyEpisode = { title: '', description: '', url: '', duration_seconds: 0 };

/**
 * Podcast studio: the shows this account owns, and publishing episodes to them —
 * including recording one straight from the phone.
 */
export default function PodcastsTab({ notify, fail }) {
  const [shows, setShows] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [showId, setShowId] = useState(null);
  const [draft, setDraft] = useState({ title: '', description: '' });
  const [episode, setEpisode] = useState(emptyEpisode);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/podcasts/mine');
      setShows(data.podcasts);
      setShowId((current) => (data.podcasts.some((show) => show.id === current) ? current : data.podcasts[0]?.id ?? null));
    } catch (err) {
      fail?.(err.message);
    } finally {
      setReady(true);
    }
  }, [fail]);

  useEffect(() => { load(); }, [load]);

  const loadEpisodes = useCallback(async (id) => {
    if (!id) return setEpisodes([]);
    try {
      const data = await api(`/podcasts/${id}`);
      setEpisodes(data.episodes);
    } catch (err) {
      fail?.(err.message);
    }
  }, [fail]);

  useEffect(() => { loadEpisodes(showId); }, [showId, loadEpisodes]);

  const show = shows.find((item) => item.id === showId) ?? null;

  const createShow = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api('/podcasts', { method: 'POST', body: draft });
      setDraft({ title: '', description: '' });
      await load();
      setShowId(data.podcast.id);
      notify('Show created — publish your first episode.');
    } catch (err) {
      fail?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/podcasts/${showId}/episodes`, { method: 'POST', body: episode });
      setEpisode(emptyEpisode);
      await loadEpisodes(showId);
      load();
      notify('Episode published — it is on the podcasts page now.');
    } catch (err) {
      fail?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try {
      await api(`/podcasts/episodes/${item.id}`, { method: 'DELETE' });
      await loadEpisodes(showId);
      load();
      notify('Episode removed.');
    } catch (err) {
      fail?.(err.message);
    }
  };

  if (!ready) return <div className="empty">Loading your shows…</div>;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <form className="panel stack" onSubmit={createShow}>
        <h3>Start a show</h3>
        <p className="muted small" style={{ margin: 0 }}>A podcast is yours to fill — publish episodes from this phone.</p>
        <div className="row">
          <div className="grow">
            <label>Show title</label>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
          </div>
          <div className="grow">
            <label>Description</label>
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>Create show</button>
      </form>

      {shows.length === 0 ? (
        <Empty>You have no shows yet. Create one above and its episodes appear on the podcasts page.</Empty>
      ) : (
        <>
          <div className="row">
            {shows.map((item) => (
              <button
                key={item.id}
                className={`btn btn-sm${item.id === showId ? ' btn-primary' : ''}`}
                onClick={() => setShowId(item.id)}
              >
                {item.title}{item.episode_count ? ` · ${item.episode_count}` : ''}
              </button>
            ))}
          </div>

          {show && (
            <form className="panel stack" onSubmit={publish}>
              <h3>Publish an episode to {show.title}</h3>
              <div className="row">
                <div className="grow">
                  <label>Episode title</label>
                  <input value={episode.title} onChange={(event) => setEpisode({ ...episode, title: event.target.value })} required />
                </div>
                <div className="grow">
                  <label>Show notes</label>
                  <input value={episode.description} onChange={(event) => setEpisode({ ...episode, description: event.target.value })} />
                </div>
              </div>

              <div>
                <label>Episode audio</label>
                <FileDrop
                  accept="audio"
                  label="Upload the episode, or record it on this phone"
                  onUploaded={(file) =>
                    setEpisode((value) => ({ ...value, url: file.url, duration_seconds: file.duration_seconds }))
                  }
                />
                {episode.url && <div className="tiny muted" style={{ marginTop: 6 }}>Ready · {formatDuration(episode.duration_seconds)}</div>}
                <div style={{ marginTop: 8 }}>
                  <label>…or paste a link</label>
                  <input value={episode.url} onChange={(event) => setEpisode({ ...episode, url: event.target.value })} placeholder="https://" />
                </div>
              </div>

              <button className="btn btn-primary" type="submit" disabled={busy || !episode.url}>
                {busy ? <span className="spinner" /> : 'Publish episode'}
              </button>
            </form>
          )}

          <section className="stack">
            <h2>Episodes</h2>
            {episodes.length === 0 ? (
              <Empty>No episodes on {show?.title} yet.</Empty>
            ) : (
              <div className="list">
                {episodes.map((item) => (
                  <div key={item.id} className="row-item">
                    <div>
                      <b>{item.title}</b>
                      <div className="tiny muted">{formatDuration(item.duration_seconds)} · {timeAgo(item.created_at)}</div>
                    </div>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(item)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
