import { useEffect, useState } from 'react';
import { api, formatMoney } from '../api.js';
import FileDrop from './FileDrop.jsx';

const METHOD_LABEL = { bank: 'Bank transfer', crypto: 'Cryptocurrency', other: 'Other' };

/**
 * Paying the licence fee by transfer instead of card. The control room sets up accounts in
 * different national currencies and cryptocurrencies, each with its own rate, so the exact
 * amount to send — the $5 standard or $15 premium licence in that currency, never less or
 * more — is shown next to the account. The applicant then hands over the proof, which the
 * control room verifies before the station is opened and monetisation switched on.
 */
export default function LicencePayment({ application, notify, fail, onDone }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/payment-accounts')
      .then((data) => setAccounts(data.accounts))
      .catch((err) => setError(err.message));
  }, []);

  const account = accounts.find((item) => item.id === accountId) ?? accounts[0] ?? null;
  const amountLabel = !account ? '' : application.plan === 'premium' ? account.premium_label : account.standard_label;

  const submit = async () => {
    if (!account) return;
    setBusy(true);
    setError('');
    try {
      await api(`/applications/${application.id}/proof`, {
        method: 'POST',
        body: { payment_account_id: account.id, reference, note, proof_url: proofUrl }
      });
      notify?.('Proof sent — the control room verifies it and opens your station.');
      onDone?.();
    } catch (err) {
      setError(err.message);
      fail?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel stack" style={{ gap: 14, background: 'var(--panel-2, rgba(255,255,255,0.03))' }}>
      <div className="between">
        <h3 style={{ margin: 0 }}>Pay the licence fee by transfer</h3>
        <span className="badge badge-accent">{formatMoney(application.fee_cents)} · {application.plan || 'standard'}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Send the exact amount below to one of the control room's accounts, then hand over the proof. The fee is{' '}
        {formatMoney(application.fee_cents)} whichever currency you pay in — never less or more.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      {accounts.length === 0 ? (
        <div className="notice notice-warn">The control room has not set up a payment account yet — check back shortly.</div>
      ) : (
        <>
          <div>
            <label>Pay into</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {accounts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`btn btn-sm${item.id === account?.id ? ' btn-primary' : ''}`}
                  onClick={() => setAccountId(item.id)}
                >
                  {item.currency} · {item.label}
                </button>
              ))}
            </div>
          </div>

          {account && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row-item">
                <div>
                  <b>{METHOD_LABEL[account.method] || 'Payment'}</b>
                  <div className="tiny muted">
                    {[
                      account.account_name,
                      account.bank_name,
                      account.account_number,
                      account.network,
                      account.country
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'The control room will share the details.'}
                  </div>
                  {account.instructions && <div className="tiny muted">{account.instructions}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tiny muted">Send exactly</div>
                  <b style={{ color: 'var(--accent)' }}>{amountLabel}</b>
                </div>
              </div>
            </div>
          )}

          <div className="row">
            <div className="grow">
              <label>Reference or transaction id</label>
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. the transfer reference from your bank or wallet"
                required
              />
            </div>
          </div>

          <div>
            <label>Proof of payment (optional screenshot)</label>
            <FileDrop
              accept="image"
              label="Upload a screenshot or receipt"
              record={false}
              onUploaded={(file) => setProofUrl(file.url)}
            />
          </div>

          <div>
            <label>Note for the control room</label>
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </div>

          <div className="between">
            <span className="tiny muted">Verification can take a little while.</span>
            <button className="btn btn-primary" type="button" onClick={submit} disabled={busy || !reference.trim()}>
              {busy ? <span className="spinner" /> : 'I have paid — send proof'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
