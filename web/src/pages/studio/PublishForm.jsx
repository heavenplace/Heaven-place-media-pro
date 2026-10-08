import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDuration } from '../../api.js';
import FileDrop from '../../components/FileDrop.jsx';

const empty = {
  title: '',
  description: '',
  url: '',
  duration_seconds: 0,
  source: 'upload',
  access: 'free',
  price_cents: 0
};

export default function PublishForm({ station, reload, notify, fail }) {
  const [draft, setDraft] = useState({ ...empty, type: station.kind === 'tv' ? 'video' : 'audio' });
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    fail('');
    try {
      await api('/media', {
        method: 'POST',
        body: {
          ...draft,
          station_id: station.id,
          price_cents: Number(draft.price_cents),
          duration_seconds: Number(draft.duration_seconds)
        }
      });
      setDraft({ ...empty, type: draft.type });
      notify('Published — it is in the listener app now.');
      reload();
    } catch (err) {
      fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <h3>Upload media</h3>
      <p className="muted small" style={{ margin: 0 }}>Publish audio or video to {station.name}.</p>

      <div className="row">
        <div className="grow">
          <label>Title</label>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
        </div>
        <div style={{ width: 130 }}>
          <label>Type</label>
          <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
        </div>
      </div>

      <div>
        <label>File, or record it from this phone</label>
        <FileDrop
          accept={draft.type}
          label={`Upload ${draft.type}`}
          onUploaded={(file) =>
            setDraft((value) => ({ ...value, url: file.url, duration_seconds: file.duration_seconds, source: 'upload' }))
          }
        />
        {draft.url && <div className="tiny muted" style={{ marginTop: 6 }}>Ready · {formatDuration(draft.duration_seconds)}</div>}
        <div style={{ marginTop: 8 }}>
          <label>…or paste a link</label>
          <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://" />
        </div>
      </div>

      <div className="row">
        <div style={{ width: 170 }}>
          <label>Access</label>
          <select value={draft.access} onChange={(event) => setDraft({ ...draft, access: event.target.value })}>
            <option value="free">Free</option>
            <option value="premium" disabled={station.plan !== 'premium'}>Premium</option>
            <option value="paid" disabled={station.plan !== 'premium'}>Paid download</option>
          </select>
          {station.plan !== 'premium' && (
            <div className="tiny muted" style={{ marginTop: 6 }}>
              Premium and paid items need the premium licence — <Link to="/apply">apply for it</Link>.
            </div>
          )}
        </div>
        {draft.access === 'paid' && (
          <div style={{ width: 170 }}>
            <label>Price (cents)</label>
            <input
              type="number"
              min="50"
              value={draft.price_cents}
              onChange={(event) => setDraft({ ...draft, price_cents: Number(event.target.value) })}
            />
          </div>
        )}
        <div className="grow">
          <label>Notes</label>
          <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </div>
      </div>

      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? <span className="spinner" /> : 'Publish'}
      </button>
    </form>
  );
}
