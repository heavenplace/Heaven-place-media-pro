import { useCallback, useEffect, useState } from 'react';
import { api, formatDuration, formatMoney, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

export default function Media() {
  const [media, setMedia] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/admin/media').then((data) => setMedia(data.media)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

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
