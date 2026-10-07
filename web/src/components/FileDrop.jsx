import { useRef, useState } from 'react';
import { readDuration, uploadFile } from '../api.js';

/**
 * Upload a file, or record one straight from this phone/computer.
 * Calls onUploaded({ url, name, mime, duration_seconds, source }).
 */
export default function FileDrop({ accept = 'audio', label = 'Choose a file', record = true, onUploaded }) {
  const inputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const acceptAttr = accept === 'video' ? 'video/*' : accept === 'image' ? 'image/*' : 'audio/*';

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      const uploaded = await uploadFile(file);
      const duration_seconds = await readDuration(uploaded.url, accept === 'video' ? 'video' : 'audio');
      setDone(uploaded.name);
      onUploaded?.({ ...uploaded, duration_seconds, source: 'upload' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        accept === 'video' ? { audio: true, video: true } : { audio: true }
      );
      const chunks = [];
      chunksRef.current = chunks;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = accept === 'video' ? 'video/webm' : 'audio/webm';
        const blob = new Blob(chunks, { type });
        const file = new File([blob], `phone-recording-${Date.now()}.webm`, { type });
        await handleFile(file);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(`Could not reach the microphone or camera: ${err.message}`);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className={`drop${over ? ' over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        {busy ? (
          <span className="row" style={{ justifyContent: 'center' }}><span className="spinner" /> Uploading…</span>
        ) : (
          <>
            <div>{label}</div>
            <div className="tiny muted">Tap to browse, or drop a file here</div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        hidden
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {record && (
        <div className="row">
          {recording ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={stopRecording}>
              Stop and upload
            </button>
          ) : (
            <button type="button" className="btn btn-sm" onClick={startRecording} disabled={busy}>
              {accept === 'video' ? 'Record video from this phone' : 'Record audio from this phone'}
            </button>
          )}
          {recording && <span className="small muted">Recording… tap stop when you are done</span>}
        </div>
      )}

      {done && <div className="notice notice-ok tiny">Uploaded {done}</div>}
      {error && <div className="notice notice-error tiny">{error}</div>}
    </div>
  );
}
