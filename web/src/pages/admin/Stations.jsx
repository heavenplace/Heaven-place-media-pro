import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';
import FileDrop from '../../components/FileDrop.jsx';

const STATUSES = ['pending', 'approved', 'suspended'];

const emptyDraft = { name: '', kind: 'radio', description: '', artwork_url: '', owner_id: '' };

export default function Stations() {
  const [stations, setStations] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/stations${filter ? `?status=${filter}` : ''}`)
      .then((data) => setStations(data.stations))
      .catch((err) => setError(err.message));
    api('/admin/users').then((data) => setUsers(data.users)).catch(() => {});
  }, [filter]);

  useEffect(load, [load]);

  // Stations are created here, from the control room, and the admin names the owner.
  const create = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/stations', { method: 'POST', body: { ...draft, owner_id: draft.owner_id || undefined } });
      setDraft(emptyDraft);
      setCreating(false);
      setNotice('Station created and live.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (station) => {
    if (!window.confirm(`Delete "${station.name}" and everything published on it?`)) return;
    setError('');
    try {
      await api(`/stations/${station.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const update = async (station, patch) => {
    try {
      await api(`/admin/stations/${station.id}`, { method: 'PATCH', body: patch });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <div className="between">
        <h2>Stations</h2>
        <div className="row">
          <select value={filter} onChange={(event) => setFilter(event.target.value)} style={{ width: 160 }}>
            <option value="">All</option>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setCreating((value) => !value)}>
            {creating ? 'Close' : 'Add station'}
          </button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      {creating && (
        <form className="panel stack" onSubmit={create}>
          <h3>New station</h3>
          <div className="row">
            <div className="grow">
              <label>Name</label>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
            </div>
            <div style={{ width: 140 }}>
              <label>Type</label>
              <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>
                <option value="radio">Radio</option>
                <option value="tv">TV</option>
              </select>
            </div>
            <div className="grow">
              <label>Owner</label>
              <select value={draft.owner_id} onChange={(event) => setDraft({ ...draft, owner_id: event.target.value })}>
                <option value="">Me (control room)</option>
                {users.map((person) => (
                  <option key={person.id} value={person.id}>{person.name} ({person.email})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label>Description</label>
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          <div>
            <label>Artwork</label>
            <FileDrop accept="image" label="Upload station artwork" record={false} onUploaded={(file) => setDraft((value) => ({ ...value, artwork_url: file.url }))} />
            {draft.artwork_url && <div className="tiny muted" style={{ marginTop: 6 }}>Artwork ready</div>}
          </div>
          <button className="btn btn-primary" type="submit">Create station</button>
        </form>
      )}

      {stations.length === 0 ? (
        <Empty>No stations in this view.</Empty>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Station</th>
                <th>Owner</th>
                <th>Items</th>
                <th>Status</th>
                <th>Verified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id}>
                  <td>
                    <input
                      defaultValue={station.name}
                      onBlur={(event) => {
                        const name = event.target.value.trim();
                        if (name && name !== station.name) update(station, { name });
                        else event.target.value = station.name;
                      }}
                      style={{ width: 190 }}
                    />
                    <div className="tiny muted">
                      <Link to={`/station/${station.id}`}>{station.kind} page</Link>
                    </div>
                  </td>
                  <td>
                    <select
                      value={station.owner_id ?? ''}
                      onChange={(event) => update(station, { owner_id: event.target.value ? Number(event.target.value) : null })}
                      style={{ width: 170 }}
                    >
                      <option value="">No owner</option>
                      {users.map((person) => (
                        <option key={person.id} value={person.id}>{person.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>{station.media_count}</td>
                  <td>
                    <select value={station.status} onChange={(event) => update(station, { status: event.target.value })} style={{ width: 130 }}>
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>{station.verified ? 'Yes' : 'No'}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => update(station, { verified: !station.verified })}
                      >
                        {station.verified ? 'Unverify' : 'Verify'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(station)}>Delete</button>
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
