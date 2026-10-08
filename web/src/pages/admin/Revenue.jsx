import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

/**
 * What stations have earned from premium content. Every sale is a row in the
 * earnings ledger; settling a payout closes out one owner's outstanding balance
 * (the money itself moves outside the app).
 */
export default function Revenue() {
  const [data, setData] = useState({ owners: [], earnings: [], payouts: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api('/admin/earnings').then(setData).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const settle = async (owner) => {
    const outstanding = owner.earned_cents - owner.settled_cents;
    const destination = owner.account_number
      ? ` — ${owner.account_name}, ${owner.bank_name} ${owner.account_number}`
      : ' (no payout details on file)';
    if (!window.confirm(`Record a payout of ${formatMoney(outstanding)} to ${owner.owner_name}${destination}?`)) return;
    setError('');
    setNotice('');
    try {
      await api('/admin/payouts', { method: 'POST', body: { owner_id: owner.owner_id } });
      setNotice(`Payout recorded for ${owner.owner_name}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <h2>Station revenue</h2>
        <span className="tiny muted">Listeners pay by card; the control room settles each owner's balance</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      <section>
        <h3>Owners</h3>
        {data.owners.length === 0 ? (
          <Empty>Nothing sold yet.</Empty>
        ) : (
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Sales</th>
                  <th>Earned</th>
                  <th>Settled</th>
                  <th>Outstanding</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.owners.map((owner) => {
                  const outstanding = owner.earned_cents - owner.settled_cents;
                  return (
                    <tr key={owner.owner_id}>
                      <td>
                        {owner.owner_name}
                        <div className="tiny muted">{owner.owner_email}</div>
                        <div className="tiny muted" style={{ marginTop: 4 }}>
                          {owner.account_number
                            ? `Payout: ${owner.account_name} · ${owner.bank_name} · ${owner.account_number}${
                                owner.routing_number ? ` · ${owner.routing_number}` : ''
                              }`
                            : 'No payout details on file'}
                        </div>
                      </td>
                      <td>{owner.sales}</td>
                      <td>{formatMoney(owner.earned_cents)}</td>
                      <td>{formatMoney(owner.settled_cents)}</td>
                      <td>
                        <b>{formatMoney(outstanding)}</b>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-primary" disabled={!outstanding} onClick={() => settle(owner)}>
                          Settle payout
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3>Recent sales</h3>
        {data.earnings.length === 0 ? (
          <Empty>No premium sales yet.</Empty>
        ) : (
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Station</th>
                  <th>Listener</th>
                  <th>Amount</th>
                  <th>Sold</th>
                  <th>Settled</th>
                </tr>
              </thead>
              <tbody>
                {data.earnings.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.media_title || '—'}</td>
                    <td className="small">
                      {sale.station_name || '—'}
                      {sale.plan === 'premium' && <span className="badge badge-accent" style={{ marginLeft: 6 }}>premium</span>}
                    </td>
                    <td className="small muted">{sale.buyer_name || '—'}</td>
                    <td>{formatMoney(sale.amount_cents)}</td>
                    <td className="small muted">{timeAgo(sale.created_at)}</td>
                    <td>
                      <span className={sale.payout_id ? 'badge badge-ok' : 'badge badge-warn'}>
                        {sale.payout_id ? 'paid out' : 'due'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3>Payout history</h3>
        {data.payouts.length === 0 ? (
          <Empty>No payouts recorded yet.</Empty>
        ) : (
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Amount</th>
                  <th>Note</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>{payout.owner_name || '—'}</td>
                    <td>{formatMoney(payout.amount_cents)}</td>
                    <td className="small muted">{payout.note || '—'}</td>
                    <td className="small muted">{timeAgo(payout.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
