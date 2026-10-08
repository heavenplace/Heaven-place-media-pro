import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney, timeAgo } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useConfig } from '../config.js';
import { Empty } from '../components/Cards.jsx';

const DEFAULT_FEES = { standard: 500, premium: 1500 };

const COVERAGES = [
  { id: 'fm', label: 'FM only', blurb: 'One radio station for talk, music and shows.' },
  { id: 'fm_tv', label: 'FM + TV', blurb: 'A radio station and its TV twin, from one application.' }
];

const PLANS = [
  { id: 'standard', label: 'Standard', blurb: 'Publish free shows, music and video for everyone.' },
  {
    id: 'premium',
    label: 'Premium',
    blurb: 'Run free and premium content side by side, sell downloads, and collect what listeners pay for them.'
  }
];

const statusClass = (status) =>
  status === 'approved' ? 'badge badge-ok' : status === 'rejected' ? 'badge badge-warn' : 'badge';

export default function Apply() {
  const { user, ready } = useAuth();
  const config = useConfig();
  const fees = config?.station_fees ?? DEFAULT_FEES;

  const [form, setForm] = useState({ station_name: '', description: '', coverage: 'fm', plan: 'standard' });
  const [applications, setApplications] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    api('/applications/mine').then((data) => setApplications(data.applications)).catch(() => {});
  }, [user]);

  useEffect(load, [load]);

  // Landing back from Stripe: this pays the licence fee and moves the application
  // on to the control room. The webhook fulfils too, so this is only the fast path.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('checkout');
    if (!outcome) return;
    const sessionId = params.get('session_id');
    window.history.replaceState({}, '', window.location.pathname);

    if (outcome === 'cancelled') {
      setMessage('Checkout cancelled — your application is saved and its licence fee is still unpaid.');
      return;
    }
    if (!sessionId) return;

    api('/payments/confirm', { method: 'POST', body: { session_id: sessionId } })
      .then((data) => setMessage(data.message || 'Licence fee received.'))
      .catch((err) => setError(err.message))
      .finally(load);
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const data = await api('/applications', { method: 'POST', body: form });
      if (config?.payments_enabled) {
        const checkout = await api(`/applications/${data.application.id}/checkout`, {
          method: 'POST',
          body: { origin: window.location.origin }
        });
        window.location.assign(checkout.url);
        return;
      }
      setForm({ station_name: '', description: '', coverage: 'fm', plan: 'standard' });
      setMessage('Application received — the control room confirms the licence fee and opens your station.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) {
    return (
      <Empty>
        <p>Sign in to apply for a station of your own.</p>
        <Link className="btn btn-primary" to="/login?next=%2Fapply">Sign in</Link>
      </Empty>
    );
  }

  const fee = fees[form.plan] ?? DEFAULT_FEES.standard;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div>
        <h1>Open your own station</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Apply for an FM station, or FM plus its TV twin. The licence is {formatMoney(fees.standard)} on the standard
          plan and {formatMoney(fees.premium)} on premium; the control room opens your station once the fee is paid.
          Only the premium plan can publish premium and paid content, and its owner receives what listeners pay for it.
        </p>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {message && <div className="notice notice-ok">{message}</div>}

      <form className="panel stack" onSubmit={submit}>
        <h2>Station application</h2>

        <div className="row">
          <div className="grow">
            <label>Station name</label>
            <input
              value={form.station_name}
              onChange={(event) => setForm({ ...form, station_name: event.target.value })}
              placeholder="e.g. Heaven Place FM"
              required
            />
          </div>
        </div>

        <div>
          <label>What you want to run</label>
          <div className="row">
            {COVERAGES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`btn btn-sm${form.coverage === option.id ? ' btn-primary' : ''}`}
                onClick={() => setForm({ ...form, coverage: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            {COVERAGES.find((option) => option.id === form.coverage)?.blurb}
          </p>
        </div>

        <div>
          <label>Licence plan</label>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {PLANS.map((plan) => {
              const active = form.plan === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  className="panel-2 stack"
                  style={{ gap: 6, textAlign: 'left', cursor: 'pointer', borderColor: active ? 'var(--accent)' : undefined }}
                  onClick={() => setForm({ ...form, plan: plan.id })}
                >
                  <span className={active ? 'badge badge-accent' : 'badge'}>{plan.label}</span>
                  <b>{formatMoney(fees[plan.id] ?? DEFAULT_FEES[plan.id])} one-off</b>
                  <span className="tiny muted">{plan.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label>What the station is about</label>
          <textarea
            rows="3"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Tell the control room what you plan to broadcast."
          />
        </div>

        <div className="between">
          <span className="tiny muted">
            {config?.payments_enabled
              ? `You will be taken to a card checkout for ${formatMoney(fee)}.`
              : 'Card payments are off — the control room confirms the fee with you directly.'}
          </span>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : config?.payments_enabled ? `Pay ${formatMoney(fee)} and apply` : 'Submit application'}
          </button>
        </div>
      </form>

      <section className="stack">
        <h2>My applications</h2>
        {applications.length === 0 ? (
          <Empty>No applications yet.</Empty>
        ) : (
          <div className="list">
            {applications.map((application) => (
              <div key={application.id} className="row-item">
                <div>
                  <b>{application.station_name}</b>
                  <div className="tiny muted">
                    {application.coverage === 'fm_tv' ? 'FM + TV' : 'FM only'} · {(application.plan || 'standard')} plan ·{' '}
                    {formatMoney(application.fee_cents)} · applied {timeAgo(application.created_at)}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className={application.fee_status === 'paid' ? 'badge badge-ok' : 'badge badge-warn'}>
                    fee {application.fee_status}
                  </span>
                  <span className={statusClass(application.status)}>{application.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
