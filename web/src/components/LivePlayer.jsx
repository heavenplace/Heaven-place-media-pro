import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Watches a phone broadcast. The phone uploads the stream in slices, so the viewer
 * follows the growing file: it polls the session's manifest and appends each new byte
 * range to a MediaSource buffer, staying a couple of seconds behind the live edge.
 *
 * Browsers without MediaSource fall back to the plain file, which plays what has been
 * uploaded so far.
 */
export default function LivePlayer({ session, onEnded }) {
  const mediaRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);

  const audio = String(session?.mime || '').startsWith('audio');

  useEffect(() => {
    setStarted(false);
    setStatus('idle');
    setError('');
  }, [session?.id]);

  useEffect(() => {
    if (!started || !session) return;
    const el = mediaRef.current;
    if (!el) return;

    let cancelled = false;
    let offset = 0;
    let mediaSource = null;
    let sourceBuffer = null;
    let queue = [];
    let flushing = false;
    let closed = false;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const seekToLiveEdge = () => {
      try {
        const { buffered } = sourceBuffer;
        if (!buffered.length) return;
        const end = buffered.end(buffered.length - 1);
        if (end - el.currentTime > 2.5 || el.currentTime < end - 6) el.currentTime = Math.max(0, end - 0.6);
        setSeconds(Math.round(el.currentTime));
      } catch {
        /* the buffer is still filling */
      }
    };

    const flush = () => {
      if (cancelled || !sourceBuffer || sourceBuffer.updating || flushing || !queue.length) return;
      flushing = true;
      try {
        sourceBuffer.appendBuffer(queue.shift());
      } catch (err) {
        setError(err.message);
        return;
      }
      sourceBuffer.onupdateend = () => {
        flushing = false;
        seekToLiveEdge();
        // Keep only the recent tail, so a long broadcast does not fill memory.
        try {
          if (!queue.length && sourceBuffer.buffered.length > 1 && sourceBuffer.buffered.start(0) < el.currentTime - 30) {
            sourceBuffer.remove(0, el.currentTime - 20);
          }
        } catch {
          /* removal is best-effort */
        }
        flush();
      };
    };

    const useFallback = () => {
      setStatus('fallback');
      el.src = `/uploads/live/${session.id}.${String(session.mime).includes('mp4') ? 'mp4' : 'webm'}`;
      el.play().catch(() => {});
    };

    const run = async () => {
      try {
        if (!('MediaSource' in window) || !window.MediaSource.isTypeSupported(session.mime)) return useFallback();
        setStatus('connecting');
        mediaSource = new MediaSource();
        el.src = URL.createObjectURL(mediaSource);
        await new Promise((resolve) => {
          mediaSource.addEventListener('sourceopen', resolve, { once: true });
          el.addEventListener('loadedmetadata', resolve, { once: true });
        });
        if (cancelled) return;
        try {
          sourceBuffer = mediaSource.addSourceBuffer(session.mime);
        } catch {
          return useFallback();
        }
        setStatus('live');
        el.play().catch(() => {});

        while (!cancelled && !closed) {
          const manifest = await api(`/live/${session.id}/manifest`);
          if (manifest.bytes > offset) {
            const response = await fetch(manifest.recording_url, { headers: { Range: `bytes=${offset}-` } });
            if (!response.ok) throw new Error(`Stream unavailable (${response.status})`);
            const buffer = await response.arrayBuffer();
            offset += buffer.byteLength;
            queue.push(buffer);
            flush();
            setStatus('live');
          } else {
            flush();
            if (!manifest.is_live) {
              closed = true;
              break;
            }
            await sleep(1500);
          }
        }

        if (!cancelled && closed) {
          setStatus('ended');
          const finish = () => {
            try {
              if (mediaSource.readyState === 'open') mediaSource.endOfStream();
            } catch {
              /* already closed */
            }
          };
          if (sourceBuffer?.updating) sourceBuffer.onupdateend = finish;
          else finish();
          onEnded?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setStatus('error');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      try {
        if (mediaSource?.readyState === 'open') mediaSource.endOfStream();
      } catch {
        /* the source is already torn down */
      }
      el.removeAttribute('src');
      el.load();
    };
  }, [started, session?.id, session?.mime, onEnded]);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="live-stage">
        {audio ? (
          <audio ref={mediaRef} controls className="live-audio" />
        ) : (
          <video ref={mediaRef} className="live-video" controls playsInline />
        )}
        {!started && (
          <div className="live-placeholder">
            <button type="button" className="btn btn-primary" onClick={() => setStarted(true)}>
              {audio ? 'Listen live' : 'Watch live'}
            </button>
            <span className="tiny muted">Live from the station's phone</span>
          </div>
        )}
      </div>
      <div className="row tiny muted">
        {status === 'live' && <span className="badge badge-live"><span className="badge-pulse" /> Live</span>}
        {status === 'connecting' && <span>Connecting…</span>}
        {status === 'fallback' && <span>Playing the recording — this browser cannot follow the live edge.</span>}
        {status === 'ended' && <span>This broadcast has ended.</span>}
        {seconds > 0 && status === 'live' && <span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} in</span>}
        {error && <span className="notice notice-error tiny">{error}</span>}
      </div>
    </div>
  );
}
