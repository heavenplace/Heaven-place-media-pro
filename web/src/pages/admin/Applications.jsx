import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney, timeAgo } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

const statusClass = (status) =>
  status === 'approved' ? 'badge badge-ok' : status === 'rejected' ? 'badge badge-warn' : 'badge';

/**
 * Station applications: listeners ask for a station (FM only, or FM + TV), pick the
 * standard or premium licence and pay the fee by card. Approving opens the station
 * in their name — and its TV twin for an FM + TV application.
 */
export default function Applications() {
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api('/admin/applications')
      .then((data) => setApplications(data.applications))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const post = async (path, body, success) => {
    setError('');
    setNotice('');
    try {
      await api(path, { method: 'POST', body });
      setNotice(success);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const pending = applications.filter((application) => application.status === 'pending').length;

  return (
    <div className="stack">
      <div className="between">
        <h2>Station applications</h2>
        <span className="tiny muted">
          {pending} waiting · standard {formatMoney(500)} / premium {formatMoney(1500)} · the fee is paid before review
        </span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      {applications.length === 0 ? (
        <Empty>No applications yet.</Empty>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Station</th>
                <th>Plan</th>
                <th>Licence fee</th>
                <th>Asked</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id}>
                  <td>
                    {application.user_name || '—'}
                    <div className="tiny muted">{application.user_email}</div>
                  </td>
                  <td>
                    {application.station_name}
                    <div className="tiny muted">
                      {application.coverage === 'fm_tv' ? 'FM + TV' : 'FM only'}
                      {application.description ? ` · ${application.description}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={application.plan === 'premium' ? 'badge badge-accent' : 'badge'}>
                      {application.plan || 'standard'}
                    </span>
                  </td>
                  <td>
                    {formatMoney(application.fee_cents)}
                    <div className="tiny muted">
                      <span className={application.fee_status === 'paid' ? 'badge badge-ok' : 'badge badge-warn'}>
                        {application.fee_status}
                      </span>
                    </div>
                    {application.proof_status && application.proof_status !== 'none' && (
                      <div className="tiny muted">
                        <span
                          className={
                            application.proof_status === 'verified'
                              ? 'badge badge-ok'
                              : application.proof_status === 'rejected'
                              ? 'badge badge-warn'
                              : 'badge'
                          }
                        >
                          proof {application.proof_status}
                        </span>
                      </div>
                    )}
                    {application.payment_reference && (
                      <div className="tiny muted">
                        {Number(application.amount_units)} {application.currency} · ref {application.payment_reference}
                        {application.proof_url && (
                          <>
                            {' · '}
                            <a href={application.proof_url} target="_blank" rel="noreferrer">
                              view proof
                            </a>
                          </>
                        )}
                      </div>
                    )}
                    {application.proof_note && <div className="tiny muted">{application.proof_note}</div>}
                    {application.proof_review_note && (
                      <div className="tiny muted">review: {application.proof_review_note}</div>
                    )}
                  </td>
                  <td className="small muted">{timeAgo(application.created_at)}</td>
                  <td>
                    <span className={statusClass(application.status)}>{application.status}</span>
                    {application.review_note && <div className="tiny muted">{application.review_note}</div>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {application.proof_status === 'submitted' && (
                        <>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() =>
                              post(
                                `/admin/applications/${application.id}/proof`,
                                { action: 'verify' },
                                'Licence payment verified — the fee is paid and the station can be opened.'
                              )
                            }
                          >
                            Verify payment
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              const note = window.prompt('Why could the payment not be verified?');
                              if (note === null) return;
                              post(
                                `/admin/applications/${application.id}/proof`,
                                { action: 'reject', note },
                                'Payment proof rejected.'
                              );
                            }}
                          >
                            Reject payment
                          </button>
                        </>
                      )}
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          post(
                            `/admin/applications/${application.id}/fee`,
                            { paid: application.fee_status !== 'paid' },
                            application.fee_status === 'paid' ? 'Fee marked unpaid.' : 'Fee marked collected.'
                          )
                        }
                      >
                        {application.fee_status === 'paid' ? 'Mark unpaid' : 'Mark fee collected'}
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={application.status !== 'pending' || application.fee_status !== 'paid'}
                        onClick={() => post(`/admin/applications/${application.id}/review`, { action: 'approve' }, 'Station opened.')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={application.status !== 'pending'}
                        onClick={() => post(`/admin/applications/${application.id}/review`, { action: 'reject' }, 'Application rejected.')}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="tiny muted" style={{ margin: 0 }}>
        Verify a transfer payment to mark the fee paid — that is what lets the application be approved. Approving opens
        the station on the plan the applicant paid for, and a premium station can publish premium and paid items, with
        its owner earning what listeners pay for them (settle those balances from the Revenue tab). Set the accounts
        applicants pay into on the Payment accounts tab.
      </p>
    </div>
  );
}
