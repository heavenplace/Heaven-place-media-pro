import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { usePlayer } from '../components/Player.jsx';
import { DownloadButton, Empty } from '../components/Cards.jsx';

export default function Favorites() {
  const { user, ready } = useAuth();
  const { play } = usePlayer();
  const [favorites, setFavorites] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!user) return;
    api('/favorites').then((data) => setFavorites(data.favorites)).catch((err) => setError(err.message));
  }, [user]);

  useEffect(load, [load]);

  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) {
    return (
      <Empty>
        <p>Sign in to keep your favorite stations, shows and podcasts in one place.</p>
        <Link className="btn btn-primary" to="/login">Sign in</Link>
      </Empty>
    );
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <h1>Favorites</h1>
      {error && <div className="notice notice-error">{error}</div>}
      {favorites.length === 0 ? (
        <Empty>Nothing saved yet — tap a station or show to follow it.</Empty>
      ) : (
        <div className="list">
          {favorites.map((favorite) => (
            <div key={favorite.id} className="row-item">
              <div>
                <b>
                  {favorite.target_type === 'station' && favorite.station_name}
                  {favorite.target_type === 'media' && favorite.media_title}
                  {favorite.target_type === 'podcast' && favorite.podcast_title}
                </b>
                <div className="tiny muted">{favorite.target_type}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {favorite.target_type === 'station' && (
                  <Link className="btn btn-sm" to={`/station/${favorite.target_id}`}>Open</Link>
                )}
                {favorite.target_type === 'media' && (
                  <>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        play({
                          id: favorite.target_id,
                          title: favorite.media_title,
                          subtitle: favorite.station_name,
                          type: favorite.media_type,
                          url: favorite.media_url,
                          artwork: favorite.station_artwork
                        })
                      }
                    >
                      Play
                    </button>
                    <DownloadButton item={{ id: favorite.target_id, access: 'free' }} onChanged={load} />
                  </>
                )}
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async () => {
                    await api(`/favorites/${favorite.target_type}/${favorite.target_id}`, { method: 'DELETE' });
                    load();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
