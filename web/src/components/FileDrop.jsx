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

  // The picker has to offer every format a station may publish: a bare `audio/*` hides the
  // files whose type the device does not recognise (an .opus or .flac on Windows), so the
  // extensions are named beside the wildcard.
  const acceptAttr =
    accept === 'video'
      ? 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.ogv,.avi,.3gp,.ts,.mpg,.mpeg,.wmv'
      : accept === 'image'
        ? 'image/*'
        : 'audio/*,.mp3,.m4a,.m4b,.aac,.ogg,.oga,.opus,.flac,.wav,.aif,.aiff,.wma,.weba,.mka';

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      const uploaded = await uploadFile(file);
      // Read the length with the element that matches the file itself, so a video dropped
      // on an audio form still reports its own duration.
      const declared = file.type || uploaded.mime || '';
      const kind = declared.startsWith('video/')
        ? 'video'
        : declared.startsWith('audio/')
          ? 'audio'
          : accept === 'video'
            ? 'video'
            : 'audio';
      const duration_seconds = await readDuration(uploaded.url, kind);
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
