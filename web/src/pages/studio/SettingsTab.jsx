import { useState } from 'react';
import { api } from '../../api.js';
import FileDrop from '../../components/FileDrop.jsx';
import PayoutSettings from './PayoutSettings.jsx';

export default function SettingsTab({ station, reload, notify, fail }) {
  const [draft, setDraft] = useState({
    name: station.name,
    description: station.description ?? '',
    artwork_url: station.artwork_url ?? ''
  });
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    fail('');
    try {
      await api(`/stations/${station.id}`, { method: 'PATCH', body: draft });
      notify('Station details saved.');
      reload();
    } catch (err) {
      fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <form className="panel stack" onSubmit={submit}>
        <h3>Station details</h3>
        <p className="muted small" style={{ margin: 0 }}>How {station.name} is listed in the listener app.</p>

        <div className="row">
          <div className="grow">
            <label>Name</label>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </div>
          <div style={{ width: 140 }}>
            <label>Type</label>
            <input value={station.kind === 'tv' ? 'TV' : 'Radio'} disabled />
          </div>
        </div>

        <div>
          <label>Description</label>
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </div>

        <div>
          <label>Artwork</label>
          <FileDrop
            accept="image"
            label="Upload station artwork"
            record={false}
            onUploaded={(file) => setDraft((value) => ({ ...value, artwork_url: file.url }))}
          />
          {draft.artwork_url && (
            <div className="row" style={{ marginTop: 8, gap: 10 }}>
              <img src={draft.artwork_url} alt="" width="56" height="56" style={{ borderRadius: 10, objectFit: 'cover' }} />
              <span className="tiny muted">Artwork ready</span>
            </div>
          )}
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Save changes'}
        </button>
      </form>

      <PayoutSettings notify={notify} fail={fail} />
    </div>
  );
}
