import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

const SpeakerIcon = ({ muted }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" stroke="none" />
    {muted ? (
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    ) : (
      <>
        <path d="M15.5 8.6a5 5 0 0 1 0 6.8" />
        <path d="M18.6 6a9 9 0 0 1 0 12" />
      </>
    )}
  </svg>
);

const FullscreenIcon = ({ exit }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {exit ? <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" /> : <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />}
  </svg>
);

/**
 * One persistent player for the whole app, so audio or video keeps running
 * while the listener moves between pages.
 *
 * Audio plays behind a bar that shows the artwork of whatever is playing, its
 * title and station, a scrubber and a play/pause control. Video gets the same
 * bar with its own picture above it, plus mute and fullscreen. A live stream
 * has no known length, so it reads "On air / Live" instead of a scrubber.
 */
export function PlayerProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const mediaRef = useRef(null);

  const play = useCallback(async (item) => {
    setCurrent(item);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setMuted(false);
    setError('');
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

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const value = useMemo(() => ({ current, play, stop }), [current, play, stop]);

  const isVideo = current?.type === 'video';
  const seekable = !current?.live && Number.isFinite(duration) && duration > 0;
  const progress = seekable ? Math.min((time / duration) * 100, 100) : 0;

  // The audio and the video surface report into the same bar.
  const mediaEvents = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => { setPlaying(false); setTime(0); },
    onTimeUpdate: (event) => setTime(event.currentTarget.currentTime),
    onLoadedMetadata: (event) => { setError(''); setDuration(event.currentTarget.duration); },
    onDurationChange: (event) => setDuration(event.currentTarget.duration),
    // A browser that cannot decode the format (Opus or Ogg in Safari, Matroska anywhere)
    // says so instead of leaving a bar that looks stuck.
    onError: () => { setPlaying(false); setError('This browser cannot play this file type.'); }
  };

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

  const toggleMute = () => {
    const el = mediaRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const toggleFullscreen = async () => {
    const el = mediaRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await el.requestFullscreen?.();
    } catch {
      /* fullscreen can be refused — the controls stay usable either way */
    }
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {current && (
        <div className="player">
          <div className="wrap player-inner">
            {isVideo && (
              <div className="player-stage">
                <video
                  ref={mediaRef}
                  className="player-video"
                  src={current.url}
                  poster={current.artwork || undefined}
                  autoPlay
                  playsInline
                  {...mediaEvents}
                  onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
                />
              </div>
            )}

            {!isVideo && (
              <div className="player-art">
                {current.artwork ? (
                  <img src={current.artwork} alt="" />
                ) : (
                  <span className="player-art-glyph" aria-hidden="true">♪</span>
                )}
              </div>
            )}

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
                {error ? (
                  <span className="player-time" style={{ flex: 1 }}>{error}</span>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>

            <button className="player-toggle" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>

            {isVideo && (
              <>
                <button className="player-icon" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                  <SpeakerIcon muted={muted} />
                </button>
                <button className="player-icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  <FullscreenIcon exit={fullscreen} />
                </button>
              </>
            )}

            <button className="player-close" onClick={stop} aria-label="Close player" title="Close">✕</button>
          </div>

          {!isVideo && <audio ref={mediaRef} src={current.url} autoPlay {...mediaEvents} />}
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
