import { useCallback, useEffect, useState } from 'react';
import { api, formatDuration, formatMoney, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';
import FileDrop from '../../components/FileDrop.jsx';

const emptyDraft = {
  station_id: '',
  title: '',
  description: '',
  type: 'audio',
  access: 'free',
  price_cents: 0,
  url: '',
  duration_seconds: 0
};

export default function Media() {
  const [media, setMedia] = useState([]);
  const [stations, setStations] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/admin/media').then((data) => setMedia(data.media)).catch((err) => setError(err.message));
    api('/admin/stations').then((data) => setStations(data.stations)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  // The control room may publish to any station (the API lets an admin manage them all).
  const publish = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/media', {
        method: 'POST',
        body: {
          ...draft,
          station_id: Number(draft.station_id),
          price_cents: Number(draft.price_cents),
          duration_seconds: Number(draft.duration_seconds)
        }
      });
      setDraft({ ...emptyDraft, station_id: draft.station_id, type: draft.type });
      setNotice('Published — it is in the listener app now.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const patch = async (item, body) => {
    try {
      await api(`/media/${item.id}`, { method: 'PATCH', body });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try {
      await api(`/media/${item.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <div className="between">
        <h2>Media</h2>
        <span className="tiny muted">Access, pricing, visibility and downloads</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      <form className="panel stack" onSubmit={publish}>
        <h3>Publish to a station</h3>
        <div className="row">
          <div className="grow">
            <label>Station</label>
            <select
              value={draft.station_id}
              onChange={(event) => {
                const station = stations.find((item) => item.id === Number(event.target.value));
                setDraft({ ...draft, station_id: event.target.value, type: station?.kind === 'tv' ? 'video' : 'audio' });
              }}
              required
            >
              <option value="">— pick a station —</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>{station.name} ({station.kind})</option>
              ))}
            </select>
          </div>
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
          <label>File, or record it here</label>
          <FileDrop
            accept={draft.type}
            label={`Upload ${draft.type}`}
            onUploaded={(file) => setDraft((value) => ({ ...value, url: file.url, duration_seconds: file.duration_seconds }))}
          />
          <div style={{ marginTop: 8 }}>
            <label>…or paste a link</label>
            <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://" />
          </div>
        </div>

        <div className="row">
          <div style={{ width: 150 }}>
            <label>Access</label>
            <select value={draft.access} onChange={(event) => setDraft({ ...draft, access: event.target.value })}>
              <option value="free">Free</option>
              <option value="premium">Premium</option>
              <option value="paid">Paid download</option>
            </select>
          </div>
          {draft.access === 'paid' && (
            <div style={{ width: 150 }}>
              <label>Price (cents)</label>
              <input type="number" min="50" value={draft.price_cents} onChange={(event) => setDraft({ ...draft, price_cents: Number(event.target.value) })} />
            </div>
          )}
          <div className="grow">
            <label>Notes</label>
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>

        <button className="btn btn-primary" type="submit">Publish</button>
      </form>

      {media.length === 0 ? (
        <Empty>Nothing published yet.</Empty>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Station</th>
                <th>Type</th>
                <th>Access</th>
                <th>Price</th>
                <th>Length</th>
                <th>Downloads</th>
                <th>Visible</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {media.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td className="small">{item.station_name}</td>
                  <td>{item.type}</td>
                  <td>
                    <select value={item.access} onChange={(event) => patch(item, { access: event.target.value })} style={{ width: 120 }}>
                      <option value="free">free</option>
                      <option value="premium">premium</option>
                      <option value="paid">paid</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={item.price_cents}
                      onBlur={(event) => patch(item, { price_cents: Number(event.target.value) })}
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>{formatDuration(item.duration_seconds)}</td>
                  <td>
                    <label className="tiny row" style={{ gap: 6, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={item.downloadable}
                        onChange={(event) => patch(item, { downloadable: event.target.checked })}
                        style={{ width: 'auto' }}
                      />
                      {item.unlock_count} {item.access === 'free' ? '' : `/ ${formatMoney(item.price_cents)}`}
                    </label>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.visible}
                      onChange={(event) => patch(item, { visible: event.target.checked })}
                      style={{ width: 'auto' }}
                    />
                  </td>
                  <td className="small muted">{timeAgo(item.created_at)}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer">Open</a>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(item)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
