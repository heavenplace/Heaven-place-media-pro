import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Capture presets. Constraints are sent as "ideal" so a phone that cannot do the
 * requested size falls back to the closest thing its camera supports.
 */
const QUALITY = {
  audio: { label: 'Audio only (FM / radio)', audioOnly: true, audioBitsPerSecond: 192000 },
  '720p': { label: 'HD 720p · 30fps', size: [1280, 720], frameRate: 30, videoBitsPerSecond: 3500000, audioBitsPerSecond: 128000 },
  '1080p': { label: 'Full HD 1080p · 30fps', size: [1920, 1080], frameRate: 30, videoBitsPerSecond: 6000000, audioBitsPerSecond: 192000 },
  '1080p60': { label: 'Full HD 1080p · 60fps', size: [1920, 1080], frameRate: 60, videoBitsPerSecond: 9000000, audioBitsPerSecond: 192000 },
  '4k': { label: '4K 2160p · 30fps', size: [3840, 2160], frameRate: 30, videoBitsPerSecond: 16000000, audioBitsPerSecond: 256000 }
};

const MIME_CANDIDATES = {
  video: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'],
  audio: ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
};

const WINDOWS = [
  ['1', '1 hour'],
  ['4', '4 hours'],
  ['12', '12 hours'],
  ['24', '24 hours'],
  ['permanent', '24/7 — never ends']
];

const pickMime = (audioOnly) =>
  (audioOnly ? MIME_CANDIDATES.audio : MIME_CANDIDATES.video).find(
    (type) => typeof window.MediaRecorder?.isTypeSupported === 'function' && window.MediaRecorder.isTypeSupported(type)
  ) || '';

/**
 * Broadcast live from this phone to a station. The camera is drawn onto a canvas and the
 * canvas is what gets streamed, so switching between the front and back camera — or the
 * quality preset — keeps one continuous broadcast instead of restarting it.
 *
 * The phone is the source: it uploads two-second slices to POST /api/live/:id/chunk and
 * listeners follow along through GET /api/live/:id/manifest.
 */
export default function LiveBroadcaster({ station, onStarted, onEnded, notify, fail }) {
  const previewRef = useRef(null);
  const canvasRef = useRef(null);
  const micRef = useRef(null);
  const camRef = useRef(null);
  const canvasStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const sessionRef = useRef(null);
  const rafRef = useRef(0);

  const [facing, setFacing] = useState('environment');
  const [quality, setQuality] = useState(station.kind === 'tv' ? '1080p' : 'audio');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('1');
  const [previewing, setPreviewing] = useState(false);
  const [live, setLive] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [online, setOnline] = useState(1);

  const preset = QUALITY[quality] || QUALITY['1080p'];
  const audioOnly = Boolean(preset.audioOnly);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const video = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const vw = video?.videoWidth || 0;
    const vh = video?.videoHeight || 0;
    if (vw && vh) {
      const scale = Math.max(canvas.width / vw, canvas.height / vh);
      const w = vw * scale;
      const h = vh * scale;
      ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    rafRef.current = requestAnimationFrame(paint);
  }, []);

  const stopTracks = (ref) => {
    ref.current?.getTracks().forEach((track) => track.stop());
    ref.current = null;
  };

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    stopTracks(camRef);
    stopTracks(micRef);
    canvasStreamRef.current = null;
    setPreviewing(false);
  }, []);

  useEffect(() => () => {
    recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    stopAll();
  }, [stopAll]);

  // Opens (or re-opens) the camera — used on start, on "switch camera" and on a
  // quality change. The microphone is only opened once, so switching the camera does
  // not interrupt the audio half of the broadcast.
  async function openSource(nextFacing = facing, nextQuality = quality, { mic = true } = {}) {
    const target = QUALITY[nextQuality] || QUALITY['1080p'];
    setError('');
    try {
      if (!target.audioOnly) {
        stopTracks(camRef);
        camRef.current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: nextFacing }, width: { ideal: target.size[0] }, height: { ideal: target.size[1] }, frameRate: { ideal: target.frameRate } }
        });
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = target.size[0];
          canvas.height = target.size[1];
        }
        if (previewRef.current) {
          previewRef.current.srcObject = camRef.current;
          previewRef.current.muted = true;
          await previewRef.current.play().catch(() => {});
        }
        if (!rafRef.current) rafRef.current = requestAnimationFrame(paint);
      } else {
        stopTracks(camRef);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (mic && !micRef.current) {
        micRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 2 }
        });
      }
      setPreviewing(true);
      return true;
    } catch (err) {
      setError(`Could not reach the ${target.audioOnly ? 'microphone' : 'camera'}: ${err.message}`);
      return false;
    }
  }

  // The stream we actually broadcast: the canvas (so camera switches are seamless)
  // plus the microphone.
  function broadcastStream(target = preset) {
    const tracks = [];
    if (!target.audioOnly && canvasRef.current) {
      if (!canvasStreamRef.current) canvasStreamRef.current = canvasRef.current.captureStream(target.frameRate);
      tracks.push(...canvasStreamRef.current.getVideoTracks());
    }
    if (micRef.current) tracks.push(...micRef.current.getAudioTracks());
    return new MediaStream(tracks);
  }

  function queueChunk(sessionId, blob) {
    queueRef.current = queueRef.current
      .then(() => api(`/live/${sessionId}/chunk`, { method: 'POST', body: blob, raw: true }))
      .then((info) => setStats({ chunks: info.chunk_count, mb: (info.bytes / 1048576).toFixed(1) }))
      .catch((err) => setError(`Broadcast interrupted: ${err.message}. Check your connection.`));
  }

  const start = async () => {
    setBusy(true);
    setError('');
    fail?.('');
    try {
      const ready = previewing || (await openSource());
      if (!ready) return;
      if (!window.MediaRecorder) return setError('This browser cannot record from the camera.');

      const mime = pickMime(audioOnly);
      const { session } = await api('/live', {
        method: 'POST',
        body: {
          station_id: station.id,
          title: title.trim() || `${station.name} live`,
          kind: audioOnly ? 'audio' : 'video',
          mime: mime || null,
          ...(duration === 'permanent' ? { permanent: true } : { hours: Number(duration) })
        }
      });
      sessionRef.current = session;

      const recorder = new MediaRecorder(broadcastStream(), {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: preset.videoBitsPerSecond,
        audioBitsPerSecond: preset.audioBitsPerSecond
      });
      recorder.ondataavailable = (event) => event.data?.size && queueChunk(session.id, event.data);
      recorderRef.current = recorder;
      recorder.start(2000);

      setLive(true);
      setPermanent(Boolean(session.permanent));
      setOnline(1);
      onStarted?.(session);
      notify?.(`You are live on ${station.name}. Keep this screen open while you broadcast.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    const session = sessionRef.current;
    setBusy(true);
    try {
      if (recorderRef.current?.state === 'recording') {
        await new Promise((resolve) => {
          recorderRef.current.onstop = resolve;
          recorderRef.current.stop();
        });
      }
      await queueRef.current.catch(() => {});
      if (session) await api(`/live/${session.id}/end`, { method: 'POST' });
      notify?.('You are off air — the broadcast is saved on the station as a Relive item.');
      onEnded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      recorderRef.current = null;
      sessionRef.current = null;
      setLive(false);
      setPermanent(false);
      setStats(null);
      stopAll();
      setBusy(false);
    }
  };

  const switchCamera = async () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    if (!audioOnly) await openSource(next, quality, { mic: false });
  };

  const changeQuality = async (next) => {
    setQuality(next);
    if (previewing && !live) await openSource(facing, next);
  };

  return (
    <section className="panel stack" style={{ gap: 12 }}>
      <div className="between">
        <h3>Go live from this phone</h3>
        {live ? (
          <span className="badge badge-live"><span className="badge-pulse" /> {permanent ? 'On air 24/7' : 'On air'}</span>
        ) : (
          <span className="badge">Camera idle</span>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Broadcast straight from this device — it is the source. Switch between the front and
        back camera while you are live, and choose how long the window runs.
      </p>

      <div className="live-stage">
        <video ref={previewRef} className="live-video" playsInline muted />
        <canvas ref={canvasRef} hidden />
        {!previewing && (
          <div className="live-placeholder">
            {audioOnly ? '🎙️ Audio only — the microphone is the source' : 'Camera is off — start it below'}
          </div>
        )}
      </div>

      <div className="row">
        <div className="grow">
          <label>Live title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${station.name} live`} disabled={live} />
        </div>
        <div style={{ minWidth: 190 }}>
          <label>How long</label>
          <select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={live}>
            {WINDOWS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 210 }}>
          <label>Quality</label>
          <select value={quality} onChange={(event) => changeQuality(event.target.value)} disabled={live}>
            {Object.entries(QUALITY).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
      </div>

      <div className="row">
        {!previewing && (
          <button type="button" className="btn" onClick={() => openSource()} disabled={busy || live}>
            Start {audioOnly ? 'microphone' : 'camera'}
          </button>
        )}
        {previewing && !audioOnly && (
          <button type="button" className="btn" onClick={switchCamera} disabled={busy}>
            Switch to {facing === 'environment' ? 'front' : 'back'} camera
          </button>
        )}
        {!live ? (
          <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
            {busy ? <span className="spinner" /> : duration === 'permanent' ? 'Go live 24/7' : 'Go live'}
          </button>
        ) : (
          <button type="button" className="btn btn-danger" onClick={stop} disabled={busy}>
            {busy ? <span className="spinner" /> : 'End broadcast'}
          </button>
        )}
        {live && stats && (
          <span className="tiny muted">
            {stats.chunks} slices sent · {stats.mb} MB · {preset.label}
          </span>
        )}
      </div>

      {error && <div className="notice notice-error small">{error}</div>}
      <p className="tiny muted" style={{ margin: 0 }}>
        Keep this screen open and the phone awake while broadcasting — the browser stops
        capturing when the tab is in the background. The recording is kept and appears as a
        Relive item when you end.
      </p>
    </section>
  );
}
