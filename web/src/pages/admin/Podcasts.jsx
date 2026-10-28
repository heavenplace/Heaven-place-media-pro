import { useCallback, useEffect, useState } from 'react';
import { api, formatDuration } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';
import FileDrop from '../../components/FileDrop.jsx';

const emptyShow = { title: '', description: '', artwork_url: '', owner_id: '' };
const emptyEpisode = { title: '', description: '', url: '', duration_seconds: 0 };

/** Control-room podcast desk: start a show, hand it to an owner, publish its episodes. */
export default function Podcasts() {
  const [shows, setShows] = useState([]);
  const [users, setUsers] = useState([]);
  const [openShow, setOpenShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [draft, setDraft] = useState(emptyShow);
  const [episode, setEpisode] = useState(emptyEpisode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api('/podcasts').then((data) => setShows(data.podcasts)).catch((err) => setError(err.message));
    api('/admin/users').then((data) => setUsers(data.users)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const clear = () => {
    setError('');
    setNotice('');
  };

  const open = async (show) => {
    const data = await api(`/podcasts/${show.id}`);
    setOpenShow(data.podcast);
    setEpisodes(data.episodes);
  };

  const createShow = async (event) => {
    event.preventDefault();
    clear();
    try {
      const body = { ...draft, owner_id: draft.owner_id || undefined };
      await api('/podcasts', { method: 'POST', body });
      setDraft(emptyShow);
      setNotice('Show created.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const addEpisode = async (event) => {
    event.preventDefault();
    clear();
    try {
      await api(`/podcasts/${openShow.id}/episodes`, { method: 'POST', body: episode });
      setEpisode(emptyEpisode);
      setNotice('Episode published — it is on the podcast page now.');
      open(openShow);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeEpisode = async (item) => {
    if (!window.confirm(`Delete episode "${item.title}"?`)) return;
    clear();
    try {
      await api(`/podcasts/episodes/${item.id}`, { method: 'DELETE' });
      open(openShow);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeShow = async (show) => {
    if (!window.confirm(`Delete "${show.title}" and all of its episodes?`)) return;
    clear();
    try {
      await api(`/podcasts/${show.id}`, { method: 'DELETE' });
      setOpenShow(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const reassign = async (show, ownerId) => {
    clear();
    try {
      await api(`/podcasts/${show.id}`, { method: 'PATCH', body: { owner_id: ownerId ? Number(ownerId) : null } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <div className="between">
        <h2>Podcasts</h2>
        <span className="tiny muted">On-demand shows and their episodes</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      <form className="panel stack" onSubmit={createShow}>
        <h3>Start a show</h3>
        <div className="row">
          <div className="grow">
            <label>Title</label>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
          </div>
          <div className="grow">
            <label>Description</label>
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          <div className="grow">
            <label>Owner</label>
            <select value={draft.owner_id} onChange={(event) => setDraft({ ...draft, owner_id: event.target.value })}>
              <option value="">Me (control room)</option>
              {users.map((person) => (
                <option key={person.id} value={person.id}>{person.name} ({person.email})</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label>Cover art</label>
          <FileDrop accept="image" label="Upload cover art" record={false} onUploaded={(file) => setDraft((value) => ({ ...value, artwork_url: file.url }))} />
          {draft.artwork_url && <div className="tiny muted" style={{ marginTop: 6 }}>Artwork ready</div>}
        </div>
        <button className="btn btn-primary" type="submit">Create show</button>
      </form>

      {shows.length === 0 ? (
        <Empty>No shows yet.</Empty>
      ) : (
        <div className="list">
          {shows.map((show) => (
            <div key={show.id} className="row-item">
              <div>
                <b>{show.title}</b>
                <div className="tiny muted">
                  {show.episode_count} episodes · {show.owner_name || 'no owner'}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <select value={show.owner_id ?? ''} onChange={(event) => reassign(show, event.target.value)} style={{ width: 180 }}>
                  <option value="">No owner</option>
                  {users.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
                <button className="btn btn-sm" onClick={() => open(show)}>Episodes</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeShow(show)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {openShow && (
        <section className="panel stack">
          <div className="between">
            <h3>{openShow.title}</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpenShow(null)}>Close</button>
          </div>

          {episodes.length === 0 ? (
            <Empty>No episodes yet.</Empty>
          ) : (
            <div className="list">
              {episodes.map((item) => (
                <div key={item.id} className="row-item">
                  <div>
                    <b>{item.title}</b>
                    <div className="tiny muted">
                      {item.description || 'No notes'} · {formatDuration(item.duration_seconds)}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer">Open</a>
                    <button className="btn btn-sm btn-danger" onClick={() => removeEpisode(item)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form className="panel-2 stack" onSubmit={addEpisode}>
            <h3>Add an episode</h3>
            <div className="row">
              <div className="grow">
                <label>Episode title</label>
                <input value={episode.title} onChange={(event) => setEpisode({ ...episode, title: event.target.value })} required />
              </div>
              <div className="grow">
                <label>Notes</label>
                <input value={episode.description} onChange={(event) => setEpisode({ ...episode, description: event.target.value })} />
              </div>
            </div>
            <div>
              <label>Audio</label>
              <FileDrop
                accept="audio"
                label="Upload the episode, or record it from this phone"
                onUploaded={(file) => setEpisode((value) => ({ ...value, url: file.url, duration_seconds: file.duration_seconds }))}
              />
              <div style={{ marginTop: 8 }}>
                <label>…or paste a link</label>
                <input value={episode.url} onChange={(event) => setEpisode({ ...episode, url: event.target.value })} placeholder="https://" />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Publish episode</button>
          </form>
        </section>
      )}
    </div>
  );
}
