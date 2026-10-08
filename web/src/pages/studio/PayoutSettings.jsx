import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const EMPTY = { account_name: '', bank_name: '', account_number: '', routing_number: '', note: '' };

/**
 * Where this account's settled earnings are sent. One profile covers every station the
 * account owns; the control room reads it when it records a payout. The transfer itself
 * happens outside the app — this is only the instruction for it.
 */
export default function PayoutSettings({ notify, fail }) {
  const [draft, setDraft] = useState(EMPTY);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/earnings/account')
      .then((data) => {
        if (!data.account) return;
        const { account_name, bank_name, account_number, routing_number, note } = data.account;
        setDraft({
          account_name,
          bank_name,
          account_number,
          routing_number: routing_number ?? '',
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
        Where the control room sends the earnings from every station on this account. Use the name on the bank
        account, not the station name.
      </p>

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
            required
          />
        </div>
      </div>

      <div className="row">
        <div className="grow">
          <label>Account number</label>
          <input
            value={draft.account_number}
            onChange={(event) => setDraft({ ...draft, account_number: event.target.value })}
            required
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
