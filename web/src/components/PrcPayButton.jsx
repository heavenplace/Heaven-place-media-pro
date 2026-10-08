import { useState } from 'react';
import { api, formatMoney } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

// Any PrcPay currency is accepted except PRCP, PrcPay's own token. The short list is
// only a convenience — the field takes any other code too.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'KES', 'ZAR', 'INR', 'CAD', 'AUD', 'USDT', 'USDC', 'BTC', 'ETH'];

/**
 * Paying with the card on a PrcPay account. The charge is taken server-side against the
 * account named here and settles at once, so the purchase unlocks in the same request —
 * there is no redirect to come back from.
 */
export default function PrcPayButton({ kind, mediaId = null, amountCents, onDone, note }) {
  const { refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const pay = async () => {
    setBusy(true);
    setMessage('');
    try {
      const data = await api('/prcpay/checkout', {
        method: 'POST',
        body: { kind, media_id: mediaId, account, currency }
      });
      setMessage(data.message || 'Paid — settled on PrcPay.');
      setOpen(false);
      await refresh?.();
      onDone?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="stack" style={{ gap: 6 }}>
      {!open ? (
        <button className="btn btn-sm" type="button" onClick={() => setOpen(true)}>
          Pay {formatMoney(amountCents)} with PrcPay
        </button>
      ) : (
        <>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="grow"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="Your PrcPay account"
            />
            <input
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              list="prcpay-currencies"
              style={{ width: 92 }}
              aria-label="Currency"
            />
            <datalist id="prcpay-currencies">
              {CURRENCIES.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-primary" type="button" onClick={pay} disabled={busy || !account.trim()}>
              {busy ? <span className="spinner" /> : `Pay ${formatMoney(amountCents)} with PrcPay`}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </>
      )}
      {note && !message && <span className="tiny muted">{note}</span>}
      {message && <span className="tiny muted">{message}</span>}
    </span>
  );
}
