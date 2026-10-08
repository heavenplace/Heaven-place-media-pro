import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const PlayerContext = createContext(null);

// 0:07, 28:55 or 1:02:03
const clock = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M8 5.4v13.2L19 12z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor" />
  </svg>
);

/**
 * One persistent player for the whole app, so audio or video keeps running
 * while the listener moves between pages.
 *
 * Audio plays behind a bar that shows the artwork of whatever is playing, its
 * title and station, a scrubber and a play/pause control — a live stream has no
 * known length, so it reads "On air / Live" instead of a scrubber.
 */
export function PlayerProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const mediaRef = useRef(null);

  const play = useCallback(async (item) => {
    setCurrent(item);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    if (item?.id) {
      try {
        await api(`/media/${item.id}/listen`, { method: 'POST' });
      } catch {
        /* the listen ping is best-effort */
      }
    }
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    setCurrent(null);
  }, []);

  const value = useMemo(() => ({ current, play, stop }), [current, play, stop]);

  const isVideo = current?.type === 'video';
  const seekable = !current?.live && Number.isFinite(duration) && duration > 0;
  const progress = seekable ? Math.min((time / duration) * 100, 100) : 0;

  const toggle = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  };

  const seek = (event) => {
    const el = mediaRef.current;
    if (!el || !seekable) return;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - left) / width, 0), 1);
    el.currentTime = (Number(el.duration) || 0) * ratio;
    setTime(el.currentTime);
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {current && (
        <div className="player">
          <div className="wrap player-inner">
            {isVideo ? (
              <>
                <div className="player-body grow">
                  <b className="player-title" title={current.title}>{current.title}</b>
                  {current.subtitle && <span className="player-sub tiny muted">{current.subtitle}</span>}
                </div>
                <video
                  ref={mediaRef}
                  className="player-video"
                  src={current.url}
                  controls
                  autoPlay
                  playsInline
                  poster={current.artwork || undefined}
                />
              </>
            ) : (
              <>
                <div className="player-art">
                  {current.artwork ? (
                    <img src={current.artwork} alt="" />
                  ) : (
                    <span className="player-art-glyph" aria-hidden="true">♪</span>
                  )}
                </div>

                <div className="player-body grow">
                  <div className="player-head">
                    <b className="player-title" title={current.title}>{current.title}</b>
                    {current.live && (
                      <span className="badge badge-live">
                        <span className="badge-pulse" /> Live
                      </span>
                    )}
                  </div>
                  {current.subtitle && <span className="player-sub tiny muted">{current.subtitle}</span>}
                  <div className="player-track">
                    <span className="player-time">{current.live ? 'On air' : clock(time)}</span>
                    <button
                      type="button"
                      className={`player-bar${seekable ? ' seekable' : ''}`}
                      onClick={seek}
                      disabled={!seekable}
                      aria-label="Seek"
                    >
                      <span className="player-bar-fill" style={{ width: `${progress}%` }} />
                    </button>
                    <span className="player-time">{seekable ? clock(duration) : 'Live'}</span>
                  </div>
                </div>

                <button className="player-toggle" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </button>

                <audio
                  ref={mediaRef}
                  src={current.url}
                  autoPlay
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => { setPlaying(false); setTime(0); }}
                  onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                  onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                  onDurationChange={(event) => setDuration(event.currentTarget.duration)}
                />
              </>
            )}

            <button className="player-close" onClick={stop} aria-label="Close player" title="Close">✕</button>
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
