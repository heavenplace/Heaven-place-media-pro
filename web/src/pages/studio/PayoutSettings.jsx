import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const EMPTY = {
  account_name: '',
  bank_name: '',
  account_number: '',
  routing_number: '',
  prcpay_account: '',
  prcpay_currency: 'USD',
  note: ''
};

/**
 * Where this account's earnings are sent. One profile covers every station the account
 * owns. An owner who names a PrcPay account is paid the moment an item sells — the
 * money lands there instantly; the bank details are the alternative, and what the
 * control room uses to settle by transfer.
 */
export default function PayoutSettings({ notify, fail }) {
  const [draft, setDraft] = useState(EMPTY);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/earnings/account')
      .then((data) => {
        if (!data.account) return;
        const { account_name, bank_name, account_number, routing_number, prcpay_account, prcpay_currency, note } =
          data.account;
        setDraft({
          account_name,
          bank_name: bank_name ?? '',
          account_number: account_number ?? '',
          routing_number: routing_number ?? '',
          prcpay_account: prcpay_account ?? '',
          prcpay_currency: prcpay_currency ?? 'USD',
          note: note ?? ''
        });
        setSaved(true);
      })
      .catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    fail('');
    try {
      await api('/earnings/account', { method: 'PUT', body: draft });
      setSaved(true);
      notify('Payout details saved.');
    } catch (err) {
      fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <h3>Payout details</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Where the earnings from every station on this account are sent. Name a PrcPay account to be paid the
        instant an item sells, or leave the bank details for the control room to settle by transfer. Use the
        name on the account, not the station name.
      </p>

      <div className="row">
        <div className="grow">
          <label>PrcPay account (instant payouts)</label>
          <input
            value={draft.prcpay_account}
            onChange={(event) => setDraft({ ...draft, prcpay_account: event.target.value })}
            placeholder="Your PrcPay account — every sale is transferred here at once"
          />
        </div>
        <div style={{ width: 140 }}>
          <label>Settles in</label>
          <input
            value={draft.prcpay_currency}
            onChange={(event) => setDraft({ ...draft, prcpay_currency: event.target.value.toUpperCase() })}
            placeholder="USD"
          />
        </div>
      </div>

      <div className="row">
        <div className="grow">
          <label>Account holder</label>
          <input
            value={draft.account_name}
            onChange={(event) => setDraft({ ...draft, account_name: event.target.value })}
            required
          />
        </div>
        <div className="grow">
          <label>Bank</label>
          <input
            value={draft.bank_name}
            onChange={(event) => setDraft({ ...draft, bank_name: event.target.value })}
            required={!draft.prcpay_account}
          />
        </div>
      </div>

      <div className="row">
        <div className="grow">
          <label>Account number</label>
          <input
            value={draft.account_number}
            onChange={(event) => setDraft({ ...draft, account_number: event.target.value })}
            required={!draft.prcpay_account}
          />
        </div>
        <div className="grow">
          <label>Routing / sort code / SWIFT</label>
          <input
            value={draft.routing_number}
            onChange={(event) => setDraft({ ...draft, routing_number: event.target.value })}
          />
        </div>
      </div>

      <div>
        <label>Note for the control room</label>
        <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
      </div>

      <div className="between">
        <span className="tiny muted">
          {saved ? 'Saved — the control room sees these details.' : 'Not saved yet.'}
        </span>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Save payout details'}
        </button>
      </div>
    </form>
  );
}
