import { api, formatDuration, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';
import { usePlayer } from '../../components/Player.jsx';
import PublishForm from './PublishForm.jsx';

export default function MediaTab({ station, media, reload, notify, fail }) {
  const { play } = usePlayer();

  const patch = async (item, body) => {
    try {
      await api(`/media/${item.id}`, { method: 'PATCH', body });
      reload();
    } catch (err) {
      fail(err.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try {
      await api(`/media/${item.id}`, { method: 'DELETE' });
      notify('Item deleted.');
      reload();
    } catch (err) {
      fail(err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PublishForm station={station} reload={reload} notify={notify} fail={fail} />

      <section className="stack">
        <h2>Published media</h2>
        {media.length === 0 ? (
          <Empty>Nothing published on {station.name} yet.</Empty>
        ) : (
          <div className="list">
            {media.map((item) => (
              <div key={item.id} className="panel stack" style={{ gap: 10 }}>
                <div className="between">
                  <div>
                    <b>{item.title}</b>
                    <div className="tiny muted">
                      {item.type} · {formatDuration(item.duration_seconds)} · added {timeAgo(item.created_at)}
                      {item.source === 'phone' && ' · recorded on phone'}
                      {item.visible ? '' : ' · hidden'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => play({ id: item.id, title: item.title, subtitle: item.station_name, type: item.type, url: item.url })}
                    >
                      Play
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(item)}>Delete</button>
                  </div>
                </div>

                <div className="row">
                  <div className="grow">
                    <label>Title</label>
                    <input
                      defaultValue={item.title}
                      onBlur={(event) => {
                        const title = event.target.value.trim();
                        if (title && title !== item.title) patch(item, { title });
                        else event.target.value = item.title;
                      }}
                    />
                  </div>
                  <div style={{ width: 150 }}>
                    <label>Access</label>
                    <select value={item.access} onChange={(event) => patch(item, { access: event.target.value })}>
                      <option value="free">Free</option>
                      <option value="premium">Premium</option>
                      <option value="paid">Paid download</option>
                    </select>
                  </div>
                  {item.access === 'paid' && (
                    <div style={{ width: 140 }}>
                      <label>Price (cents)</label>
                      <input
                        type="number"
                        min="50"
                        defaultValue={item.price_cents}
                        onBlur={(event) => patch(item, { price_cents: Number(event.target.value) })}
                      />
                    </div>
                  )}
                  <div style={{ width: 130 }}>
                    <label>Listing</label>
                    <select value={item.visible ? 'visible' : 'hidden'} onChange={(event) => patch(item, { visible: event.target.value === 'visible' })}>
                      <option value="visible">Visible</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </div>
                  <div style={{ width: 150 }}>
                    <label>Downloads</label>
                    <select value={item.downloadable ? 'on' : 'off'} onChange={(event) => patch(item, { downloadable: event.target.value === 'on' })}>
                      <option value="on">Downloadable</option>
                      <option value="off">Stream only</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
