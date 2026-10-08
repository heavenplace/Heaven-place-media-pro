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

The main control-room account is whatever `ADMIN_EMAIL` names, with `ADMIN_PASSWORD` as
its password. Both are app secrets delivered in `/run/base44/app.env` (outside the repo);
`.env.base44-defaults` only carries the `admin@streamcast.pro` / `control-room` fallback
used when no secret is set.

- On start, `ensureAdmin()` (`api/db.js`) creates that address as `role = 'admin'`,
  `tier = 'premium'`.
- If the address **already exists** — someone registered it as a listener, or signed in
  with Google — it is promoted to `admin` but keeps its own password. A Google-created
  account has an unguessable hash and so has no password login until one is set (which is
  what the Android apps need, since Google sign-in does not work in a WebView):
  `UPDATE users SET password_hash = <bcryptjs hash of ADMIN_PASSWORD>`.

Everyone else registers from `/register`. Access levels: a listener account can own
stations and use the studio (`/studio`, which only ever shows its own stations); `/admin`
and every `/api/admin/*` route are `role = 'admin'` only, and a signed-out or non-admin
visitor gets told to sign in rather than being dropped into the listener app.

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
- **The listener player** (`web/src/components/Player.jsx`) is the app's one persistent player:
  audio and video keep running as the listener moves between pages, and both play behind the same
  bar — artwork (or the video's own picture), title and station, a scrubber with elapsed/total time,
  play/pause and close. Video adds mute and fullscreen, and on a phone its picture sits on its own
  line above the controls. A live stream has no known length, so the bar reads "On air / Live"
  instead of a scrubber. `play({...})` takes an optional `artwork`; pass the station's `artwork_url`
  (media rows carry it as `station_artwork`) or a podcast's `artwork_url` so the bar shows the real
  cover — for a video that value is also its poster, and without it the bar falls back to a plain
  tile. This is the listener bar only: a phone broadcast watched on a station page uses
  `LivePlayer.jsx` and its own stage.
- **The creator dashboard** is `/studio` (`web/src/pages/studio/`) with five tabs:
  Overview, Media, Live windows, Podcasts and Station settings. It reads the owner-scoped
  `GET /api/stations/mine`, `GET /api/media/mine` (includes hidden items) and
  `GET /api/live/mine` (active first); every write reuses the normal routes, which scope
  themselves to the owner through `canManageStation`.
- **Podcasts** are published from that dashboard's Podcasts tab:
  `GET /api/podcasts/mine` (the account's own shows), `POST /api/podcasts` (any signed-in
  creator starts their own show; only an admin may assign one to another account) and
  `POST /api/podcasts/:id/episodes` (owner or admin). Episodes are recorded on the phone
  or uploaded through the same `FileDrop.jsx` as media.
- **Live** has two shapes, both rows in `live_sessions`:
  - a *window* over an item that was already published — a set duration (1/4/12/24 hours)
    or `permanent = true` for 24/7. An open-ended window stores no `expires_at`, so every
    "on air" check is `status = 'live' AND (expires_at IS NULL OR expires_at > now())`.
  - a *phone broadcast*, where the owner's device is the source. `LiveBroadcaster.jsx`
    captures the camera and microphone, paints the video onto a canvas (so switching
    between the front and back camera keeps one continuous stream) and records it with
    `MediaRecorder` in two-second slices. Each slice goes to `POST /api/live/:id/chunk`
    (raw body, owner only) and is appended to `uploads/live/<session id>.<webm|mp4>`; the
    session's `mime`, `chunk_count` and `recording_url` follow along.
  - A listener follows that growing file: `GET /api/live/:id/manifest` reports the bytes
    that exist, and `LivePlayer.jsx` appends each new byte range (a `Range` request on
    `/uploads/live/...`, which express.static serves) to a `MediaSource` buffer, staying a
    couple of seconds behind the live edge. A browser without MediaSource falls back to
    playing the file.
  - **Every broadcast ends up on the station's Relive page**, whatever stops it. Ending it
    by hand (`POST /api/live/:id/end`) archives what was recorded as a **Relive** item: a
    normal `media` row with `source = 'live'`, shown in the station page's Relive section
    and playable on demand. Two paths make sure nothing is missed:
    - `LiveBroadcaster.jsx` ends its session from the way out — a `pagehide` listener and
      the unmount cleanup send `POST /api/live/:id/end` with `keepalive`, so closing the
      tab, reloading or leaving the page still archives the broadcast.
    - `sweepLiveRecordings()` (`api/routes/live.js`) runs every 15s and on every live-list
      request. It closes a phone broadcast that stopped sending slices (`last_chunk_at`
      older than two minutes) and a timed window whose `expires_at` passed, then archives
      every ended session that still has no `media` row. `saveRecording` is idempotent —
      its insert is guarded on the recording url — so an end request racing the sweep still
      yields one Relive item. Opening a new window ends *and archives* the previous one.
  - Limits worth knowing: capture only runs while the page is open and in the foreground
    (a backgrounded tab stops drawing the canvas, which freezes the stream), quality is
    bounded by the phone's encoder and its connection, viewers need a browser with
    MediaSource for the live edge, and a station has one broadcast at a time — opening a
    new window ends the previous one.
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
- **Moderation** is the control room's review desk (`web/src/pages/admin/Moderation.jsx`,
  the Moderation tab). It lists creator-published media — uploads, phone recordings and
  Relive captures — with the station and the owner behind each item, and offers four
  actions plus removal:
  - `GET /api/admin/moderation` (`?status=flagged|hidden`, `?q=` over title, station and
    owner) returns `summary` counters and the items, flagged first.
  - `POST /api/admin/media/:id/moderate` with `{ action: 'flag' | 'unflag' | 'hide' |
    'restore', reason }`. A **flag** only marks the item for the control room
    (`media.flagged`, `flag_reason`, `flagged_at`, `flagged_by`); **hide** sets the
    existing `media.visible = false`, which is what takes it out of the listener app, and
    **restore** puts it back. Every action is written to the activity feed as `moderate`.
  - `DELETE /api/admin/media/:id` removes the item for good, with a confirmation in the UI.
  - Only admins: `/api/admin/*` is behind `router.use(auth({ admin: true }))`, and the
    studio never shows these controls.
- **Active listeners** is a 5-minute rolling count of `listen` activity rows;
  per-station stream time sums the live-session windows.
- `SEED_DEMO=1` seeds demo stations with public sample media URLs, so the preview
  has something to play without uploading anything.

## Mobile apps (APK)

Two **native** Android apps (Kotlin + Jetpack Compose — no WebView, no Capacitor) live in
one Gradle project at `mobile/native/`. `:core` holds the API client, the session store and
the Compose UI kit; each app is its own module:

- `:listener` — `pro.streamcast.listener`, "StreamCast Pro"
- `:admin` — `pro.streamcast.controlroom`, "StreamCast Control Room"

A native client calls the API origin directly (there is no web proxy in front of it), so
`API_BASE_URL` is baked into each app's `BuildConfig` at build time. They are independent
clients, not a copy of the site: both read the same API, so an admin's change appears in
the listener app as soon as the API answers.

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
- Vite has no mime type for `.apk`, so a phone saved the download as a `.zip` (an APK is
  a zip inside). `web/vite.config.js` now serves `/downloads/*.apk` as
  `application/vnd.android.package-archive` with an attachment filename. Any host serving
  the APKs in a real deployment needs those same headers.
- `mobile/build-apks.sh` is the whole build; `mobile/Dockerfile` is the toolchain
  (JDK 21 + Android SDK 35 + Gradle 8.11.1). The Gradle cache and the signing key live in
  the `gradle_cache` and `keystore` volumes, so repeat builds are quick and keep the same
  signing key. A first build downloads the Android/Kotlin/Compose dependencies (about two
  minutes); later builds take well under a minute.
- **Moving to a real domain** means rebuilding with one value —
  `API_BASE_URL=https://api.stream.example docker compose -f docker-compose.mobile.yml run --rm android`.
  `API_BASE_URL` is passed at build time and never committed, because the sandbox address
  changes whenever the environment is recreated. Left unset, the build uses this
  environment's API origin (`https://8000-$BASE44_PUBLIC_HOST_SUFFIX`).
- Gradle build output (`mobile/native/**/build/`, `.gradle/`, `.kotlin/`) is git-ignored;
  `gradle clean` in `mobile/native` starts from scratch. The projects have no wrapper —
  the toolchain image installs Gradle (`mobile/Dockerfile`).
- Release APKs are signed with a **development key** (`streamcast-dev.jks` in the
  `keystore` volume, password from `ANDROID_KEYSTORE_PASSWORD`). Keep that file: it is
  what lets a later build update an app that is already installed. Use your own key
  before publishing to the Play Store.
- Android 15 forces edge-to-edge for a `targetSdk 35` app, so each native app pads its root
  with `Modifier.safeDrawingPadding()` (`ListenerApp`, `ControlRoomApp`) — without it the
  status bar covers the header. The web page needs the same care: `web/index.html` sets
  `viewport-fit=cover` and `web/src/styles.css` pads the sticky header with
  `env(safe-area-inset-top)` and the app/player with `env(safe-area-inset-bottom)`.
- The apps sign in with email + password only (the account form talks to
  `/api/auth/login` and `/api/auth/register` and keeps the bearer token in
  `SharedPreferences`). Google sign-in stays a web-only flow — a native Google Sign-In
  client is not wired up.
- **What the native apps cover today**: the listener app has sign in/browse (Home, Radio,
  TV, Podcasts), station pages and one persistent ExoPlayer that keeps audio running
  behind a bar with artwork/title/live badge, plus mute/fullscreen for video; the control
  room has Dashboard, Stations (approve/suspend/delete), Moderation (flag/hide/restore/
  delete), Live (take off air) and Users (role/tier). **Still web-only**: the creator
  studio (uploading, live windows, phone broadcasting), premium checkout/downloads,
  podcast authoring, access-request approvals and the APK download page.
- The old Capacitor shells (`mobile/listener`, `mobile/admin`) are gone. If an installed
  app still shows the web page, it is an older APK — the native build ships as
  versionCode 3 under the same package names and the same signing key, so it updates in
  place.

## Environment and sandbox notes

- `BASE44_PREVIEW_MODE=1` is supplied by the platform and passed through to the
  services. Nothing in the app gates behavior on it today; it is available for
  sandbox-only overrides and must not be hardcoded to `1`.
- The web dev server is reached through the platform proxy, which forwards the
  request `Host` as `<port>-<sandbox id>.$BASE44_SANDBOX_HOST_DOMAIN`. Vite's
  allowed-host check is satisfied by `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`,
  which the platform sets rather than a permissive `allowedHosts` config.
- The web dev server watches the bind-mounted source with `CHOKIDAR_USEPOLLING=true`
  (in `docker-compose.base44.yml`): without polling, Vite keeps serving the module it
  cached before the edit, so a change looks like it never applied. After a restart the
  first page load can still be the previous bundle — reload the preview once.
- `CORS_ORIGIN` allows `https://3000-${BASE44_PUBLIC_HOST_SUFFIX}` on the API so
  the API port can be called directly (webhooks/clients) as well as through the
  web proxy. It references the variable, never a resolved hostname.

## Verify

```bash
curl -s localhost:3000/ | head -5            # web serves the app shell
curl -s localhost:8000/health                # {"ok":true,"service":"api"}
curl -s localhost:8000/api/config            # which integrations are switched on
curl -s localhost:8000/api/live              # what is on air right now
curl -s localhost:8000/api/live/1/manifest   # bytes available for a phone broadcast
curl -s "localhost:8000/api/stations?kind=tv" | head -c 120   # what the TV tab loads
curl -sI localhost:3000/downloads/streamcast-listener-release.apk | head -3   # APK download
```

The APKs themselves are checked with the SDK tools (no emulator can boot in this sandbox —
there is no `/dev/kvm`), so treat a build as verified only up to these:

```bash
docker compose -f docker-compose.mobile.yml run --rm android
docker compose -f docker-compose.mobile.yml run --rm --entrypoint bash android -c '
  BT=/opt/android-sdk/build-tools/35.0.0
  $BT/aapt2 dump badging /app/web/public/downloads/streamcast-listener-release.apk | head -4
  $BT/apksigner verify --print-certs /app/web/public/downloads/streamcast-admin-release.apk | head -3
  unzip -l /app/web/public/downloads/streamcast-listener-release.apk | grep -ciE "capacitor|assets/www"'
```
`aapt2` should name `pro.streamcast.listener` / `pro.streamcast.controlroom` with
`MainActivity` as the launcher, `apksigner` should show the development key, and the last
count must be `0` — a non-zero count means a WebView shell crept back into the build.

Test-harness pitfalls — these show up in the logs as alarming-looking errors but are
the check script's fault, not the app's:

- `psql` prints its command tag (`INSERT 0 1`) to stdout even with `-tA`, so
  `id=$(psql -c "INSERT ... RETURNING id")` captures `<id>\nINSERT 0 1`. Take the first
  line (`| head -n1`) — otherwise the tag leaks into the next SQL statement (syntax
  error in the `db` log) and into JSON bodies (a body-parser 400 in the `api` log with
  the tag quoted back at you).
- `activity` has no `title` column; it is `type` + `detail`, and `live_sessions` has
  `started_at`, not `created_at`.
- A `psql` capture that leaks its command tag into a later statement shows up as a
  syntax error in the `db` log; a leaked tag inside a JSON body shows up as a
  body-parser 400 in the `api` log. Both are the script, not the app.
