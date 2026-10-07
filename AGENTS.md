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

## Configuration

`GET /api/config` publishes what the web app needs on load (a Google client id is not
a secret — it is visible in any page that uses it): `google_client_id`,
`payments_enabled`, `premium_price_cents`. The web app reads it once through
`web/src/config.js`, which is why the Google button and the card buttons appear only
when the server is actually set up for them.

| Variable | Needed for |
| --- | --- |
| `JWT_SECRET` | signing sessions — required, a dev placeholder is generated |
| `GOOGLE_CLIENT_ID` | the Google sign-in button and the server-side token check |
| `STRIPE_SECRET_KEY` | card checkout for Premium memberships and paid downloads |
| `STRIPE_WEBHOOK_SECRET` | the Stripe webhook signature — optional |
| `PREMIUM_PRICE_CENTS` | Premium price in cents (default `600`) |
| `WEB_ORIGIN` | an extra origin allowed as a checkout return url, when not already in `CORS_ORIGIN` |

Secrets arrive in `/run/base44/app.env` (outside the repo) and are listed last in the
api service's `env_file`. The app boots without the Google and Stripe values: the
sign-in page shows a hint where the button would be, and the Premium page falls back
to the manual request flow. Card checkout also needs `STRIPE_SECRET_KEY` to be a real
key — a placeholder only makes the app start, it does not take money.

## Things worth knowing

- **Auth** is email + password, JWT bearer tokens, hashed with bcrypt.
  Google sign-in uses the browser credential flow: the web app renders Google's own
  button (`web/src/components/GoogleSignIn.jsx`) and posts the ID token it hands back
  to `POST /api/auth/google`, which verifies it against the client id (`api/google.js`)
  and links or creates the account by verified email. Accounts created this way get an
  unguessable password hash, so the password form stays shut for them. Only
  `GOOGLE_CLIENT_ID` is needed — no client secret, no redirect URI. The origin the
  button is served from must be listed under "Authorized JavaScript origins" for that
  client id in the Google console, or Google refuses to render the button.
- **Uploads** go to the `uploads` volume and are served from `/uploads/...`.
  Audio/video/image only, 500 MB per file. Phone recordings are captured with
  `MediaRecorder` in the browser and uploaded the same way (`FileDrop.jsx`).
- **Live** is a scheduled window over an existing item (`live_sessions.expires_at`),
  not a real-time broadcast relay. True camera/audio broadcast to many listeners
  needs a streaming service (e.g. an RTMP/HLS provider) — the live control screens
  are ready to point at one.
- **Payments** run through Stripe Checkout once `STRIPE_SECRET_KEY` is set.
  `POST /api/payments/checkout` opens a hosted session for a Premium membership
  (monthly) or one paid download; access is granted by `POST /api/payments/confirm`
  when the browser lands back on the success url, and by the
  `POST /api/payments/webhook` webhook (`STRIPE_WEBHOOK_SECRET`) in a deployment that
  can receive one. Both call the same idempotent `fulfil()` in `api/payments.js`, so a
  payment confirmed twice still unlocks once. The webhook is mounted in `server.js`
  BEFORE `express.json()` because the signature check needs the raw body — keep that
  order. The manual request/approval flow is unchanged and is what the Premium page
  falls back to when no Stripe key is set.
- **Active listeners** is a 5-minute rolling count of `listen` activity rows;
  per-station stream time sums the live-session windows.
- `SEED_DEMO=1` seeds demo stations with public sample media URLs, so the preview
  has something to play without uploading anything.

## Mobile apps (APK)

Two Android apps wrap the same web app, which is why an admin's changes show up in the
listener app immediately — there is nothing to sync between them:

- `pro.streamcast.listener` — "StreamCast Pro", opens `/`
- `pro.streamcast.controlroom` — "StreamCast Control Room", opens `/admin`

They are thin Capacitor shells pointed at the live site, so the address is baked into
each build and the apps always run the deployed code.

```bash
docker compose -f docker-compose.mobile.yml run --rm android
```

- Produces four files in `web/public/downloads/` (git-ignored, and served at
  `/downloads/...` so they can be fetched from the preview host):
  `streamcast-{listener,admin}-{debug,release}.apk`.
- The home page offers both downloads (`web/src/components/GetTheApp.jsx`): the listener
  APK and the control-room APK, to anyone. Those are plain links to `/downloads/...`, and
  the files are build output — a real deployment has to upload the built APKs alongside
  the site or the buttons 404.
- `mobile/build-apks.sh` is the whole build; `mobile/Dockerfile` is the toolchain
  (JDK 21 + Android SDK 35). The Gradle cache and the signing key live in the
  `gradle_cache` and `keystore` volumes, so repeat builds are quick and keep the same
  signing key.
- **Moving to a real domain** means rebuilding with one value —
  `WEB_URL=https://stream.example docker compose -f docker-compose.mobile.yml run --rm android`.
  `WEB_URL` is passed at build time and never committed, because the sandbox address
  changes whenever the environment is recreated.
- `mobile/*/android/` is generated by `npx cap add android` on the first build and is
  git-ignored. Delete it to start from a clean Gradle project.
- Release APKs are signed with a **development key** (`streamcast-dev.jks` in the
  `keystore` volume, password from `ANDROID_KEYSTORE_PASSWORD`). Keep that file: it is
  what lets a later build update an app that is already installed. Use your own key
  before publishing to the Play Store.
- Google sign-in does **not** work inside the APKs — Google blocks its sign-in flow in
  embedded WebViews. Email + password works fine; the fix is a native Google Sign-In
  plugin, which is not wired up yet.

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
curl -s localhost:8000/api/config            # which integrations are switched on
```
