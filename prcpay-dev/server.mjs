/**
 * A local stand-in for the PrcPay API, for development only.
 *
 * The app talks to it because `.env.base44-defaults` points `PRCPAY_BASE_URL` at
 * `http://prcpay:3001/api` (see AGENTS.md → "PrcPay"). It answers the same two calls
 * the app makes — `POST /api/charge` and `POST /api/transfer`, both with an
 * `Authorization: Bearer` header, both answering `{ id, status: 'succeeded' }` — so the
 * whole instant-rail flow (pay-in, instant payout to an owner's PrcPay account, and the
 * licence-fee notification) can be exercised end to end without a real merchant account.
 *
 * To use the real PrcPay instead, set `PRCPAY_BASE_URL` (a secret, and the dashboard
 * value always wins over this file's default) to the real API host; this service is then
 * simply never called.
 *
 * It moves no money and never sees `PRCPAY_API_KEY`: any non-empty bearer token is
 * accepted, and nothing is verified or stored beyond the request line it logs.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3001);

const send = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });

const bearer = (req) => {
  const header = String(req.headers.authorization ?? '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'prcpay-dev' });
  if (url.pathname === '/') {
    return send(res, 200, {
      service: 'prcpay-dev',
      note: 'Local stand-in for the PrcPay API — development only. See AGENTS.md → "PrcPay".',
      endpoints: ['POST /api/charge', 'POST /api/transfer']
    });
  }

  const kind = url.pathname === '/api/charge' ? 'charge' : url.pathname === '/api/transfer' ? 'transfer' : null;
  if (!kind) return send(res, 404, { error: `No PrcPay endpoint at ${url.pathname}` });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  if (!bearer(req)) return send(res, 401, { error: 'Missing Authorization: Bearer token' });

  const body = await readBody(req);
  if (!body) return send(res, 400, { error: 'The request body is not valid JSON' });

  const missing = ['merchant', 'account', 'amount', 'currency'].filter((field) => !String(body[field] ?? '').trim());
  if (missing.length) return send(res, 400, { error: `Missing ${missing.join(', ')}` });

  const { merchant, account, amount, currency, reference, description } = body;
  const id = `${kind === 'charge' ? 'chg' : 'trf'}_${reference || Date.now()}`;
  console.log(
    `[prcpay-dev] ${kind} ${amount} ${String(currency).toUpperCase()} ` +
      `merchant=${merchant} account=${account} ref=${reference ?? '-'}${description ? ` (${description})` : ''}`
  );

  send(res, 200, {
    id,
    status: 'succeeded',
    kind,
    merchant,
    account,
    amount,
    currency: String(currency).toUpperCase(),
    reference: reference ?? id,
    description: description ?? null
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[prcpay-dev] listening on 0.0.0.0:${PORT} — POST /api/charge, POST /api/transfer`);
});
