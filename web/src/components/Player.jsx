import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const PlayerContext = createContext(null);

/**
 * One persistent player for the whole app, so audio or video keeps running
 * while the listener moves between pages.
 */
export function PlayerProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const mediaRef = useRef(null);

  const play = useCallback(async (item) => {
    setCurrent(item);
    if (item?.id) {
      try {
        await api(`/media/${item.id}/listen`, { method: 'POST' });
      } catch {
        /* the listen ping is best-effort */
      }
    }
  }, []);

  const stop = useCallback(() => setCurrent(null), []);

  const value = useMemo(() => ({ current, play, stop }), [current, play, stop]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {current && (
        <div className="player">
          <div className="wrap player-inner">
            <div className="player-meta grow">
              <b>
                {current.live && <span className="badge badge-live" style={{ marginRight: 8 }}>Live</span>}
                {current.title}
              </b>
              <span className="muted small">{current.subtitle}</span>
            </div>
            {current.type === 'video' ? (
              <video
                ref={mediaRef}
                src={current.url}
                controls
                autoPlay
                playsInline
                poster={current.artwork || undefined}
              />
            ) : (
              <audio ref={mediaRef} src={current.url} controls autoPlay />
            )}
            <button className="btn btn-sm btn-ghost" onClick={stop}>
              Close
            </button>
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside PlayerProvider');
  return context;
};
