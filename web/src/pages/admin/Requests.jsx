import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

export default function Requests() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/admin/requests').then((data) => setRequests(data.requests)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const decide = async (request, status) => {
    try {
      await api(`/admin/requests/${request.id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <div className="between">
        <h2>Access requests</h2>
        <span className="tiny muted">Approving unlocks the download or the membership instantly</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {requests.length === 0 ? (
        <Empty>No requests yet.</Empty>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Listener</th>
                <th>Wants</th>
                <th>Item</th>
                <th>Price</th>
                <th>Asked</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    {request.user_name}
                    <div className="tiny muted">{request.user_email}</div>
                  </td>
                  <td>{request.kind === 'premium' ? 'Premium membership' : 'Download'}</td>
                  <td className="small">{request.media_title || '—'}</td>
                  <td>{request.price_cents ? formatMoney(request.price_cents) : '—'}</td>
                  <td className="small muted">{timeAgo(request.created_at)}</td>
                  <td>
                    <span className={`badge ${request.status === 'approved' ? 'badge-ok' : request.status === 'denied' ? 'badge-warn' : ''}`}>
                      {request.status}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => decide(request, 'approved')} disabled={request.status === 'approved'}>
                        Approve
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => decide(request, 'denied')} disabled={request.status === 'denied'}>
                        Deny
                      </button>
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
