import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Empty } from '../../components/Cards.jsx';

const METHODS = [
  { id: 'bank', label: 'Bank transfer' },
  { id: 'crypto', label: 'Cryptocurrency' },
  { id: 'prcpay', label: 'PrcPay' },
  { id: 'other', label: 'Other' }
];

const EMPTY = {
  label: '',
  method: 'bank',
  currency: '',
  country: '',
  account_name: '',
  account_number: '',
  bank_name: '',
  network: '',
  rate_per_usd: '',
  instructions: ''
};

const methodLabel = (method) => METHODS.find((entry) => entry.id === method)?.label || 'Payment';

/**
 * Where station owners pay. One row per receiving account — a bank account in a national
 * currency, or a crypto wallet — each with the rate that turns the $5 / $15 licence into an
 * exact amount in that currency. Applicants pay one of these accounts and hand over the
 * proof; verifying that proof on the Applications tab opens the station and switches
 * monetisation on.
 */
export default function PaymentAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/admin/payment-accounts')
      .then((data) => setAccounts(data.accounts))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/admin/payment-accounts', { method: 'POST', body: draft });
      setDraft(EMPTY);
      setNotice('Payment account added — applicants can pay it now.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (account) => {
    setError('');
    setNotice('');
    try {
      await api(`/admin/payment-accounts/${account.id}`, { method: 'PATCH', body: { active: !account.active } });
      setNotice(account.active ? `${account.label} is hidden from applicants.` : `${account.label} is available again.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (account) => {
    if (!window.confirm(`Remove the ${account.currency} account “${account.label}”?`)) return;
    setError('');
    setNotice('');
    try {
      await api(`/admin/payment-accounts/${account.id}`, { method: 'DELETE' });
      setNotice('Payment account removed.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const rate = Number(draft.rate_per_usd);
  const preview = rate > 0 ? `standard ≈ ${(rate * 5).toFixed(draft.method === 'crypto' ? 6 : 2)} · premium ≈ ${(rate * 15).toFixed(draft.method === 'crypto' ? 6 : 2)}` : '';

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <h2>Payment accounts</h2>
        <span className="tiny muted">Where applicants send the $5 / $15 station licence — in their own currency</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      <form className="panel stack" onSubmit={create}>
        <h3>Add a receiving account</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Set how many units of the currency one US dollar buys, so the app can show the exact licence fee for that
          account. A transfer for less or more does not cover the licence.
        </p>

        <div className="row">
          <div className="grow">
            <label>Label</label>
            <input
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              placeholder="e.g. Naira bank transfer"
              required
            />
          </div>
          <div style={{ width: 200 }}>
            <label>Method</label>
            <div className="row">
              {METHODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`btn btn-sm${draft.method === option.id ? ' btn-primary' : ''}`}
                  onClick={() => setDraft({ ...draft, method: option.id })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="row">
          <div className="grow">
            <label>Currency</label>
            <input
              value={draft.currency}
              onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })}
              placeholder="NGN, EUR, USD, BTC, USDT…"
              required
            />
          </div>
          <div className="grow">
            <label>Country (optional)</label>
            <input value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} placeholder="Nigeria" />
          </div>
          <div className="grow">
            <label>Units per US$1</label>
            <input
              value={draft.rate_per_usd}
              onChange={(event) => setDraft({ ...draft, rate_per_usd: event.target.value })}
              placeholder="e.g. 1500"
              inputMode="decimal"
              required
            />
            {preview && <div className="tiny muted">{preview} {draft.currency}</div>}
          </div>
        </div>

        <div className="row">
          <div className="grow">
            <label>Account holder</label>
            <input value={draft.account_name} onChange={(event) => setDraft({ ...draft, account_name: event.target.value })} />
          </div>
          <div className="grow">
            <label>Bank (optional)</label>
            <input value={draft.bank_name} onChange={(event) => setDraft({ ...draft, bank_name: event.target.value })} />
          </div>
        </div>

        <div className="row">
          <div className="grow">
            <label>Account number / wallet address</label>
            <input
              value={draft.account_number}
              onChange={(event) => setDraft({ ...draft, account_number: event.target.value })}
            />
          </div>
          <div className="grow">
            <label>Network (crypto)</label>
            <input value={draft.network} onChange={(event) => setDraft({ ...draft, network: event.target.value })} placeholder="TRC20, ERC20…" />
          </div>
        </div>

        <div>
          <label>Instructions for the applicant</label>
          <input
            value={draft.instructions}
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            placeholder="e.g. Send as a transfer and paste the reference below."
          />
        </div>

        <div className="between">
          <span className="tiny muted">Applicants pick one account when they pay the licence.</span>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Add account'}
          </button>
        </div>
      </form>

      <section className="stack">
        <h3>Accounts</h3>
        {accounts.length === 0 ? (
          <Empty>No receiving accounts yet — add one so applicants can pay.</Empty>
        ) : (
          <div className="list">
            {accounts.map((account) => (
              <div key={account.id} className="row-item">
                <div>
                  <b>
                    {account.currency} · {account.label}
                  </b>
                  <div className="tiny muted">
                    {methodLabel(account.method)}
                    {[
                      account.account_name,
                      account.bank_name,
                      account.account_number,
                      account.network,
                      account.country
                    ].filter(Boolean).length
                      ? ` · ${[account.account_name, account.bank_name, account.account_number, account.network, account.country]
                          .filter(Boolean)
                          .join(' · ')}`
                      : ''}
                  </div>
                  {account.instructions && <div className="tiny muted">{account.instructions}</div>}
                  <div className="tiny muted">
                    Standard: <b>{account.standard_label}</b> · Premium: <b>{account.premium_label}</b> · rate {Number(account.rate_per_usd)} / US$1
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={account.active ? 'badge badge-ok' : 'badge badge-warn'}>
                    {account.active ? 'available' : 'hidden'}
                  </span>
                  <button className="btn btn-sm" type="button" onClick={() => toggle(account)}>
                    {account.active ? 'Hide' : 'Show'}
                  </button>
                  <button className="btn btn-sm btn-danger" type="button" onClick={() => remove(account)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="tiny muted" style={{ margin: 0 }}>
        Applicants pay one of these accounts in the exact currency amount shown, then upload the reference and proof.
        Verify that proof in the Applications tab to mark the fee paid and open the station.
      </p>
    </div>
  );
}
