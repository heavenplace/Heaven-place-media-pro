# StreamCast Pro — working notes

Digital radio / TV / podcast platform. One web app serves both sides:
the listener app and the **control room** at `/admin` (admins only).
Everything the control room publishes appears in the listener app immediately,
because both read the same API.

## Run it

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

- Web (public origin, port 3000): Vite dev server, proxies `/api` and `/uploads` to the API.
- API (port 8000): Express, `node --watch` on the bind-mounted `api/` source.
- Database: Postgres 16 in the `db` service. Schema is created on boot by `api/db.js`.

First boot installs `node_modules` into named volumes (`api_node_modules`,
`web_node_modules`) — this keeps the repo clean and survives restarts.
Demo content is seeded only when the `stations` table is empty (`SEED_DEMO=1`).

## Sign in

The control-room account is created on first boot from `.env.base44-defaults`:

- `admin@streamcast.pro` / `control-room` (role `admin`, tier `premium`)

Change those values (or the account, from the Users screen) for anything real.
Everyone else registers from `/register`.

## Things worth knowing

- **Auth** is email + password, JWT bearer tokens, hashed with bcrypt.
  Google sign-in is not wired: it needs an OAuth client id/secret. The button on the
  sign-in page explains that rather than pretending to work.
- **Uploads** go to the `uploads` volume and are served from `/uploads/...`.
  Audio/video/image only, 500 MB per file. Phone recordings are captured with
  `MediaRecorder` in the browser and uploaded the same way (`FileDrop.jsx`).
- **Live** is a scheduled window over an existing item (`live_sessions.expires_at`),
  not a real-time broadcast relay. True camera/audio broadcast to many listeners
  needs a streaming service (e.g. an RTMP/HLS provider) — the live control screens
  are ready to point at one.
- **Payments** are request-based: a listener requests Premium or a paid download,
  the control room approves, and the unlock is granted immediately. Real card
  checkout needs a provider (e.g. Stripe) wired into `api/routes/requests.js`.
- **Active listeners** is a 5-minute rolling count of `listen` activity rows;
  per-station stream time sums the live-session windows.
- `SEED_DEMO=1` seeds demo stations with public sample media URLs, so the preview
  has something to play without uploading anything.

## Environment and sandbox notes

- `BASE44_PREVIEW_MODE=1` is supplied by the platform and passed through to the
  services. Nothing in the app gates behavior on it today; it is available for
  sandbox-only overrides and must not be hardcoded to `1`.
- The web dev server is reached through the platform proxy, which forwards the
  request `Host` as `<port>-<sandbox id>.$BASE44_SANDBOX_HOST_DOMAIN`. Vite's
  allowed-host check is satisfied by `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`,
  which the platform sets rather than a permissive `allowedHosts` config.
- `CORS_ORIGIN` allows `https://3000-${BASE44_PUBLIC_HOST_SUFFIX}` on the API so
  the API port can be called directly (webhooks/clients) as well as through the
  web proxy. It references the variable, never a resolved hostname.

## Verify

```bash
curl -s localhost:3000/ | head -5            # web serves the app shell
curl -s localhost:8000/health                # {"ok":true,"service":"api"}
```
