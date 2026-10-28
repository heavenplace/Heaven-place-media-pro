import { useCallback, useEffect, useState } from 'react';
import { api, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  // The password the control room just issued, shown once so it can be handed to its owner.
  const [issued, setIssued] = useState(null);

  const load = useCallback(() => {
    api('/admin/users').then((data) => setUsers(data.users)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const patch = async (user, body) => {
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (user) => {
    try {
      const data = await api(`/admin/users/${user.id}/password`, { method: 'POST' });
      setError('');
      setIssued({ email: data.user.email, password: data.password });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <div className="between">
        <h2>Users</h2>
        <span className="tiny muted">Invite, promote and manage membership</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {issued && (
        <div className="notice notice-ok stack">
          <div>
            New password for <strong>{issued.email}</strong>:{' '}
            <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, userSelect: 'all' }}>
              {issued.password}
            </code>
          </div>
          <div className="tiny muted">
            Send it to them — it is shown once. They can change it at Account once they are signed in.
          </div>
          <button className="btn btn-sm" type="button" onClick={() => setIssued(null)} style={{ alignSelf: 'flex-start' }}>
            Done
          </button>
        </div>
      )}

      {users.length === 0 ? (
        <Empty>No accounts yet.</Empty>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Tier</th>
                <th>Unlocks</th>
                <th>Last seen</th>
                <th>Joined</th>
                <th>Password</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td className="small">{user.email}</td>
                  <td>
                    <select value={user.role} onChange={(event) => patch(user, { role: event.target.value })} style={{ width: 120 }}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <select value={user.tier} onChange={(event) => patch(user, { tier: event.target.value })} style={{ width: 130 }}>
                      <option value="free">free</option>
                      <option value="premium">premium</option>
                    </select>
                  </td>
                  <td>{user.unlocks}</td>
                  <td className="small muted">{user.last_seen ? timeAgo(user.last_seen) : 'never'}</td>
                  <td className="small muted">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-sm" type="button" onClick={() => resetPassword(user)}>
                      New password
                    </button>
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
