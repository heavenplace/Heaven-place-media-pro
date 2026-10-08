/**
 * PrcPay — the instant-settlement rail that runs beside Stripe.
 *
 * PrcPay publishes no API reference, so the contract below is the one this app was
 * built against, and the parts of it that can differ are configuration rather than
 * code (see AGENTS.md → "PrcPay"):
 *
 *   POST {PRCPAY_BASE_URL}/payments  { merchant, account, amount, currency, reference, description }
 *   POST {PRCPAY_BASE_URL}/payouts   { merchant, amount, currency, account, reference, description }
 *
 * `merchant` is this platform's own PrcPay account (`PRCPAY_ACCOUNT`, default
 * "streamcastpro"); the API key travels as `Authorization: Bearer <key>`. Amounts are
 * decimal in the currency's own units, never minor units. Every PrcPay currency is
 * accepted except PRCP — PrcPay's own token — which the app refuses outright.
 *
 * Nothing here holds a credential: the key is a secret delivered in /run/base44/app.env.
 */

const base = () => String(process.env.PRCPAY_BASE_URL ?? 'https://api.prcpay.com').trim().replace(/\/+$/, '');
const key = () => String(process.env.PRCPAY_API_KEY ?? '').trim();

export const PRCPAY_MERCHANT = () => String(process.env.PRCPAY_ACCOUNT ?? 'streamcastpro').trim();

/** PRCP is PrcPay's own token; the platform does not accept it. */
export const BLOCKED_CURRENCY = 'PRCP';

export const prcpayEnabled = () => Boolean(base() && key());

export const normalizeCurrency = (currency) => String(currency ?? '').trim().toUpperCase();

export const isSupportedCurrency = (currency) => {
  const code = normalizeCurrency(currency);
  return /^[A-Z0-9]{2,10}$/.test(code) && code !== BLOCKED_CURRENCY;
};

/** Cents to the decimal amount PrcPay expects: 600 -> "6", 150 -> "1.5". */
export const decimalAmount = (cents) => {
  const value = Number(cents ?? 0) / 100;
  if (!Number.isFinite(value) || value <= 0) return '0';
  return String(Number(value.toFixed(6)));
};

// PrcPay settles instantly, so a response without an explicit status is a success.
const settledStatuses = ['succeeded', 'success', 'completed', 'paid', 'settled', 'instant', 'approved'];
const isSettled = (payload) => {
  const status = String(payload?.status ?? '').toLowerCase();
  return status === '' || settledStatuses.includes(status);
};

const identify = (payload, fallback) =>
  String(payload?.id ?? payload?.transaction_id ?? payload?.transfer_id ?? payload?.reference ?? fallback);

async function call(path, body) {
  const response = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key()}`
    },
    body: JSON.stringify({ merchant: PRCPAY_MERCHANT(), ...body })
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 300) };
  }

  if (!response.ok) {
    const reason = payload?.error || payload?.message || payload?.raw || `PrcPay answered ${response.status}`;
    throw Object.assign(new Error(String(reason)), { status: response.status });
  }
  return payload ?? {};
}

/** Debits a listener's PrcPay account (its linked PrcPay card) for one purchase. */
export const charge = async ({ cents, currency, account, reference, description }) => {
  const payload = await call('/payments', {
    amount: decimalAmount(cents),
    currency: normalizeCurrency(currency),
    account,
    reference,
    description
  });
  return { id: identify(payload, reference), status: payload.status ?? 'succeeded', settled: isSettled(payload) };
};

/** Sends money to another PrcPay account — an owner's own, the instant a sale lands. */
export const payout = async ({ cents, currency, account, reference, description }) => {
  const payload = await call('/payouts', {
    amount: decimalAmount(cents),
    currency: normalizeCurrency(currency),
    account,
    reference,
    description
  });
  return { id: identify(payload, reference), status: payload.status ?? 'succeeded', settled: isSettled(payload) };
};

const normalizeIp = (value) => String(value ?? '').trim().replace(/^::ffff:/, '');

/**
 * PrcPay's notifications carry no signature to check, so the source address is the only
 * proof they come from PrcPay: `PRCPAY_WEBHOOK_IPS` is the comma-separated allowlist.
 * With none configured nothing is trusted, so the endpoint stays shut rather than
 * accepting any caller.
 */
export const webhookTrusted = (req) => {
  const allowed = String(process.env.PRCPAY_WEBHOOK_IPS ?? '')
    .split(',')
    .map(normalizeIp)
    .filter(Boolean);
  if (!allowed.length) return false;

  const forwarded = normalizeIp(String(req.headers['x-forwarded-for'] ?? '').split(',')[0]);
  const candidates = [req.ip, req.socket?.remoteAddress, forwarded].map(normalizeIp).filter(Boolean);
  return candidates.some((ip) => allowed.includes(ip));
};
