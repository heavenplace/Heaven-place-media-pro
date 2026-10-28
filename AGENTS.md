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
- PrcPay (port 3001): `prcpay-dev/`, a local stand-in for the payment API so the instant
  rail can be exercised without a merchant account. `PRCPAY_BASE_URL` points at it by
  default — set that variable to the real API host to bypass it (see "PrcPay" below).

First boot installs `node_modules` into named volumes (`api_node_modules`,
`web_node_modules`) — this keeps the repo clean and survives restarts.
Demo content is seeded only when the `stations` table is empty (`SEED_DEMO=1`).

## Deploy

The sandbox stack is a development environment and there is no publish step inside
Base44: `docker-compose.prod.yml` is the production stack, for a host that stays up (a VPS
or any machine that runs Docker). The app needs a long-running Node process, Postgres and
a disk for the media it serves, so shared/cPanel hosting cannot run it.

```bash
cp deploy/.env.prod.example .env.prod     # fill it in; .env.prod is git-ignored
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

- `web` is the only public service (ports 80/443). It is Caddy serving the built site and
  forwarding `/api` and `/uploads` to `api`, so the site, the API and the media share one
  origin — which is what the web client's relative `/api` calls and the Android apps
  (`BuildConfig.API_BASE_URL`, called as `<origin>/api/...`) both need.
- `SITE_ADDRESS` is the subdomain, and Caddy obtains and renews its Let's Encrypt
  certificate — so the DNS record must point at the host first and 80/443 must be
  reachable. That certificate is where the https comes from; nothing else terminates TLS.
- `api` runs the same source as the sandbox without the watcher (`api/Dockerfile`) and
  creates the schema and the `ADMIN_EMAIL` account on boot. `JWT_SECRET` must be set and
  must not change later: unset, it falls back to a hardcoded development value.
- Uploads live in the `uploads` volume and the database in `db_data` — both have to
  survive a restart, and both are what `deploy/migrate-data.sh` moves.
- The APK buttons serve `web/public/downloads/*.apk`, which is build output and
  git-ignored: build them against the deployed origin before building the web image
  (`API_BASE_URL=https://<subdomain> docker compose -f docker-compose.mobile.yml run --rm android`),
  or the buttons 404.
- Google and Stripe need the new origin too: add it to the OAuth client's authorized
  JavaScript origins, and point the Stripe webhook at
  `https://<subdomain>/api/payments/webhook`.

Carrying the sandbox's data over: `./deploy/migrate-data.sh export <dir>` here, copy the
directory to the server, then `./deploy/migrate-data.sh import <dir>` there. The dump holds
real accounts, so it stays out of the repo.

### This app's deployment

The production host is an **Oracle Cloud Always Free VM** — an Ampere A1 instance (up to
4 OCPUs / 24 GB, free), which is a machine with root that runs Docker, and that is the
whole requirement. `deploy/oracle/README.md` is the step-by-step;
`deploy/oracle/vm-setup.sh` prepares a fresh VM (Docker, the host firewall, swap) and
`deploy/oracle/cloud-init.yaml` is the Docker half of it at instance-creation time.

- **Oracle Cloud blocks a port twice.** The VCN's security list filters it on the cloud
  side (console only — ingress TCP 80 and 443 from `0.0.0.0/0`), and the VM's own firewall
  drops it again: the Oracle Linux images keep iptables rules that accept SSH and reject
  the rest, reloaded at boot. `vm-setup.sh` does the host half. Miss either one and the
  site answers on the VM itself and nowhere else.
- **ARM (aarch64) needs nothing special here.** `node:22-alpine`, `caddy:2-alpine` and
  `postgres:16-alpine` all publish arm64, `api/` has no native dependencies, and the web
  lockfile carries the arm64 `rollup` and `esbuild` builds. The Android toolchain
  (`docker-compose.mobile.yml`, `mobile/Dockerfile`) is x86-64 only — build the APKs on a
  desktop and copy them in.
- **There is no name to point at the VM, and `streamcastpro.ct.ws` cannot be used.** Left
  blank, `deploy/deploy.sh` fills `SITE_ADDRESS`/`PUBLIC_ORIGIN` in as
  `<public ip>.sslip.io` — a free name that resolves to whichever IP it is asked about and
  that Let's Encrypt issues for — writes it into `.env.prod` (so the name and the
  certificate stay put, and `migrate-data.sh` reads a real value) and says so. A domain you
  own, or a free DuckDNS subdomain, is the permanent answer: put the bare name and the same
  name with its scheme in `.env.prod` and point its A record here first.

**Why not `streamcastpro.ct.ws`.** That name resolves to InfinityFree's free shared hosting
(185.27.134.101), and both halves of that are a dead end: the plan is PHP + MySQL served
from an `/htdocs` directory — no Node process, no Postgres, no Docker, no shell access, and
no long-running process at all, so it cannot host this stack — and `ct.ws` is InfinityFree's
own domain, served from their nameservers, so the account cannot repoint it at a VM either.

`deploy/deploy.sh` is the one command that does the rest on the host:

    ./deploy/deploy.sh            # validate, build, start, health-check
    ./deploy/deploy.sh --check    # validate only — starts nothing

A first run writes `.env.prod` from the example and stops so the passwords can be filled
in, and it refuses to start while any required value is still a `change-me` placeholder.
Its DNS preflight is a warning, not a stop: Caddy keeps retrying the certificate on its
own once the name resolves here.

Left to do on the host, none of which lives in the repository:

- Open ingress TCP 80 and 443 in the VCN's security list, and open the same two in the
  VM's own firewall (`sudo ./deploy/oracle/vm-setup.sh`), **before the first start** —
  Caddy asks Let's Encrypt for a certificate for exactly `SITE_ADDRESS`, and the challenge
  only passes once that name resolves here and the port is reachable from the internet.
- Reserve the instance's public IP (Instances → the instance → Attached VNICs → the VNIC →
  Edit → Reserved public IP), so the name published on keeps pointing here after a stop.
- Add the deployed origin to the Google OAuth client's authorized JavaScript origins, and
  point the Stripe webhook at `https://<name>/api/payments/webhook`.
- Rebuild the APKs against the deployed origin before building the web image, or the
  download buttons 404 (they are git-ignored build output):
  `API_BASE_URL=https://<name> docker compose -f docker-compose.mobile.yml run --rm android`.

## Sign in

The main control-room account is whatever `ADMIN_EMAIL` names, with `ADMIN_PASSWORD` as
its password. Both are app secrets delivered in `/run/base44/app.env` (outside the repo);
`.env.base44-defaults` only carries the `admin@streamcast.pro` / `control-room` fallback
used when no secret is set. **While the secrets are set that sample is not a working
sign-in**, and `ensureAdmin()` is the only thing that decides which address and password
work — so "Incorrect email or password" means the combination being typed is not the one
the secrets hold.

- On start, `ensureAdmin()` (`api/db.js`) creates that address as `role = 'admin'`,
  `tier = 'premium'`, with `ADMIN_PASSWORD` as its password.
- If the address **already exists** — someone registered it as a listener, or signed in
  with Google — it is promoted to `admin`, and its password is replaced when the account has
  no usable password (`password_set = false`, which a Google-created account has: this is
  what gives it one, and what the Android apps need since they sign in with email + password
  only) or when `ADMIN_PASSWORD` holds a **new** value.
- **`ADMIN_PASSWORD` is applied when it changes, not on every boot.** `ensureAdmin()` keeps a
  SHA-256 fingerprint of the value it last applied in `app_settings`
  (`admin_password_fingerprint`), so a restart with the same secret leaves the account alone.
  That is deliberate: the control room changes its own password at `/account`, and the api
  service restarts on every source edit (`node --watch`) and every recreate — comparing the
  hash with `ADMIN_PASSWORD` on each boot put the secret back and locked the owner out with
  the password they had just chosen. Boot with the same value logs
  `control-room password left as it is`.
- **The way back in is a *different* `ADMIN_PASSWORD`**: upload a new one and the recreated
  api service sets it on the next boot. Re-uploading the value that is already stored does
  nothing (same fingerprint) — and it does not need to, because that value is the password
  the account verifies unless someone changed it at `/account`.
- **Never put a `$` in `ADMIN_PASSWORD`.** The platform writes the value double-quoted
  into `/run/base44/app.env` and compose interpolates the contents on the way in, so `$$`
  reaches the process as a single `$` and `$name` as nothing at all: the account ends up
  with a password that is not the one that was typed, and every sign-in is refused with
  "Incorrect email or password". Verified with a probe — `x1$$y2` reaches the process as
  `x1$y2` when the value is unquoted or double-quoted, while single quotes keep it intact.
  Letters, digits and other punctuation (`!`, `-`, `_`, `#`) survive untouched, so pick the
  password from those.
- After a secret is uploaded the api service has to be **recreated** to re-read the file —
  `docker compose -f docker-compose.base44.yml up -d --force-recreate api` — because a
  plain `up -d` leaves the container on its old environment.

- **An address is normalised in one place before it is stored or looked up.** `api/emails.js`
  holds `normalizeEmail()` — the invisible characters a phone keyboard, a mail-app copy or a
  paste leaves in an address (the left-to-right mark U+200E an Android keyboard puts in front
  of a pasted address, a zero-width space, a non-breaking space, a soft hyphen) are dropped and
  the address trimmed — and `isSingleAddress()`. `String.trim()` alone removes none of those
  characters, and an address stored with one can never be matched by the address its owner
  types: two station owners were locked out of their own accounts that way, refused with
  "Incorrect email or password" whatever they typed. Register, sign-in and Google sign-in all
  normalise through it, so the address the owner types always matches the row on file.
  `isSingleAddress()` refuses a pasted contact list (several addresses separated by line
  breaks — one owner's row held five) with "Enter one email address" instead of storing an
  address nobody can sign in with. The web form's own `type="email"` validation rejects a
  marked address before it is ever posted, so a mark reaches the API from the native apps,
  whose address fields are plain text.
- **Sign-in matches the password against every row that carries the address, oldest first.**
  `users.email` is `UNIQUE` **as typed**, so two rows can carry one address when they differ
  only by case — or by one of the invisible characters, on a row stored before they were
  stripped — and sign-in's `lower(email)` lookup matches both. The password decides which
  account this is, and the older row still wins when both match (that is the one holding the
  stations). Comparing only the oldest row refused an owner whose password belonged to the
  other one with "Incorrect email or password" for good, however often they retried; register
  no longer creates a second row (it checks `lower(email)`), so this is what a legacy pair
  still needs.
- **The control room can issue a new password for any account**
  (`POST /api/admin/users/:id/password`, the Users tab's "New password"), which is the
  listener's counterpart of re-uploading `ADMIN_PASSWORD` and the only way back in for an
  owner who has forgotten theirs: no mail provider is configured, so `/forgot-password` sends
  no link — it tells them to ask the control room. The route sets the hash, sets
  `password_set = true` (so a Google-created account becomes one the native apps can sign in
  with), logs `password_reset` to the activity feed, and returns the password **once** for
  the admin to pass on; it is not stored in readable form. It generates `base64url`
  (letters, digits, `-`, `_`) unless the admin supplies one, so nothing gets mangled on the
  way to whoever types it. The owner changes it at `/account` once in. An admin resetting
  their own password this way does not disturb the `ADMIN_PASSWORD` fingerprint, so the same
  secret is not re-applied over it on the next boot.

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
| `PRCPAY_API_KEY` | PrcPay — instant pay-ins and instant payouts (see "PrcPay" below) |
| `PRCPAY_BASE_URL` | the PrcPay API host the server calls, path prefix included — the sandbox default is the local stand-in `http://prcpay:3001/api` |
| `PRCPAY_ACCOUNT` | this platform's own PrcPay account — defaults to `streamcastpro` |
| `PRCPAY_CHARGE_PATH` / `PRCPAY_TRANSFER_PATH` | the two endpoint paths — default `/charge` and `/transfer` |
| `PRCPAY_WEBHOOK_IPS` | comma-separated PrcPay source addresses; without it the settlement webhook trusts nobody |
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
  and links or creates the account by verified email. Accounts created this way start with
  `password_set = false` and an unguessable hash, so the password form stays shut for them
  until they set one. Only `GOOGLE_CLIENT_ID` is needed — no client secret, no redirect URI. The origin the
  button is served from must be listed under "Authorized JavaScript origins" for that
  client id in the Google console, or Google refuses to render the button.
- **A Google account can carry a password.** `users.password_set` is the flag that tells
  "no password yet" from "a password the owner knows", because the unguessable hash a
  Google sign-up stores looks exactly like a real one. Register and `ensureAdmin` set it
  true; a Google sign-up leaves it false. The column arrives in `api/db.js` MIGRATIONS with
  `DEFAULT false`, which is also what lets an account created *before* it set its first
  password without one. `POST /api/auth/password` (`{ current_password?, password }`,
  signed in) is the one route: it demands the current password only when `password_set` is
  true, then stores the new hash and sets the flag. `publicUser()` reports the flag as
  `has_password`, and `/account` (`web/src/pages/Account.jsx`, linked from the name in the
  header) offers "Set a password" or "Change your password" accordingly. This is the path
  that gives a Google-created account a password the native apps can sign in with — they
  use email + password only.
- **Uploads** go to the `uploads` volume and are served from `/uploads/...`.
  Audio/video/image only, 500 MB per file. Phone recordings are captured with
  `MediaRecorder` in the browser and uploaded the same way (`FileDrop.jsx`).
  - **Every audio and video format a station publishes plays, whatever the machine that
    picked it knows.** A browser or a phone only names the file types it happens to know,
    so the same `.opus` or `.flac` arrives as `audio/ogg` on one machine and
    `application/octet-stream` (or with no type at all) on the next. `MEDIA_TYPES` in
    `api/uploads.js` is the single list: it decides what `POST /api/uploads` accepts (the
    mimetype family, else the extension — documents and archives are still refused, now
    with a 400 instead of a 500, logged as one `[api] rejected a request: ...` line
    rather than a stack trace, because a refused upload is the client's mistake), the
    `mime` it reports back, and the `Content-Type` `express.static` serves the file with. The static handler's built-in mime table knows
    less — it served a `.opus` as `application/octet-stream`, which some players refuse —
    so there the extension is authoritative. A new format is one line in that map.
  - The studio's picker names the extensions beside `audio/*` / `video/*` (a bare wildcard
    hides files the device does not recognise), and the file itself decides the media type:
    an MP4 dropped on an audio form publishes as video rather than playing sound only
    (`PublishForm.jsx`). Playback stays the browser's own decoder — nothing is transcoded.
  - What actually decodes is the client's business, not the API's: Chrome/Firefox/Edge play
    Opus, Ogg, FLAC, WAV, MP3, AAC/M4A and MP4; Safari plays no Ogg/Opus and no Matroska,
    and raw `.aac` (ADTS) plays nowhere. The player therefore says "This browser cannot play
    this file type." instead of leaving a bar that looks stuck (`Player.jsx`).
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
- **A station's streaming settings are one pair of columns, shared by every place it goes
  live from.** `stations.stream_quality` (`audio` | `720p` | `1080p` | `1080p60` | `4k`)
  and `stations.stream_window` (the same `1`/`4`/`12`/`24`/`permanent` keys the go-live
  form offers) are written by `PATCH /api/stations/:id/stream` (`api/routes/stations.js`,
  owner or admin) and read back off the station row, so all three go-live surfaces open on
  the same choices: the owner's studio (`LiveBroadcaster.jsx`, and the window in
  `LiveTab.jsx`), the control room's live desk (`web/src/pages/admin/Live.jsx`, which also
  mounts the same broadcaster for whichever station the admin picks) and the Android
  studio. The vocabulary lives in `web/src/liveSettings.js` and, mirrored,
  `mobile/native/core/.../LiveSettings.kt` — adding a preset means both. A station with no
  saved pair opens on `1080p` whatever its kind — every owner gets the camera stage Metro TV
  has, with the front/back switch and the picture that is going out — and one hour. "Audio
  only (FM / radio)" is still a preset an owner can pick.
  The route is deliberately separate from `PATCH /:id` so picking a quality is not a
  `station_update` entry in the activity feed, and saving it is best-effort: a failed write
  never stops a broadcast.
- **Live** has two shapes, both rows in `live_sessions`:
  - a *window* over an item that was already published — a set duration (1/4/12/24 hours)
    or `permanent = true` for 24/7. An open-ended window stores no `expires_at`, so every
    "on air" check is `status = 'live' AND (expires_at IS NULL OR expires_at > now())`.
  - a *phone broadcast*, where the owner's device is the source — from the web studio's
    `LiveBroadcaster.jsx` or the Android studio's `LiveBroadcast.kt` (see the mobile notes).
    `LiveBroadcaster.jsx`
    captures the camera and microphone, paints the video onto a canvas (so switching
    between the front and back camera keeps one continuous stream) and records it with
    `MediaRecorder` in two-second slices. Each slice goes to `POST /api/live/:id/chunk`
    (raw body, owner only) and is appended to `uploads/live/<session id>.<webm|mp4>`; the
    session's `mime`, `chunk_count` and `recording_url` follow along.
  - A listener follows that growing file: `GET /api/live/:id/manifest` reports the bytes
    that exist, and `LivePlayer.jsx` appends each new byte range (a `Range` request on
    `/uploads/live/...`, which express.static serves) to a `MediaSource` buffer, staying a
    couple of seconds behind the live edge. A browser without MediaSource falls back to
    playing the file, and so does one whose buffer refuses the stream — a recording that
    carries no picture, say, which is a listener left staring at a black player otherwise.
    A browser that refuses to start playback on its own says "Press play to start the
    stream." rather than leaving a still frame.
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
  - Five things keep a *phone* broadcast up, all in `LiveBroadcaster.jsx`:
    - The `<canvas>` **is** the studio's stage: the owner watches the picture being
      streamed, not the raw camera (that is the off-screen `.live-source` element, still laid
      out because it is the canvas's drawing source). The canvas stays a real, painted
      element — a `display:none` canvas is one some mobile browsers stop capturing from.
    - The recorder does not start until the camera has produced a frame
      (`waitForFirstFrame`): a broadcast that opens on an empty canvas reaches viewers as a
      black picture, and a device that never delivers a frame records no picture track at
      all — which is what a viewer's player then refuses to show.
    - The recorder is built **before** the live session so `recorder.mimeType` can be read
      back and stored as the session's `mime` — a browser that supports none of the listed
      types (Safari records MP4, not WebM) still records something, and the session, the
      file extension `api/routes/live.js` writes and every listener's `LivePlayer` all key
      off that value. `video/mp4;codecs=avc1…` and `audio/mp4;codecs=mp4a…` are in the
      candidate list for Safari; canvas capture falls back to `webkitCaptureStream`.
    - A screen **wake lock** is held for the length of the broadcast, so a phone left alone
      does not dim or lock and freeze the canvas. It is re-taken when the page becomes
      visible again, and a `visibilitychange` handler says so when the tab goes to the
      background mid-broadcast.
    - Each two-second slice is retried **once**. Slices are appended to the one growing file
      listeners follow, so a slice lost to a momentary drop leaves a hole in everyone's
      stream.
  - Limits worth knowing: capture only runs while the page is open and in the foreground
    (a backgrounded tab stops drawing the canvas, which freezes the stream), quality is
    bounded by the phone's encoder and its connection, viewers need a browser with
    MediaSource for the live edge — the native listener app follows the same file instead
    (see the mobile notes) — and a station has one broadcast at a time: opening a new window
    ends the previous one, and so does a broadcast started from the Android studio.
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
- **PrcPay is the instant rail beside Stripe.** PrcPay publishes no API reference, so the
  contract the app was built against lives in `api/prcpay.js` and everything that could
  differ from it is configuration rather than code: `PRCPAY_BASE_URL` (the API host,
  including any path prefix), `PRCPAY_CHARGE_PATH` / `PRCPAY_TRANSFER_PATH` (defaults
  `/charge` and `/transfer`), `PRCPAY_ACCOUNT` (this platform's own PrcPay account —
  `streamcastpro` — sent as `merchant`), and the key as `Authorization: Bearer`. A charge
  is `POST {PRCPAY_BASE_URL}/charge { merchant, account, amount, currency, reference,
  description }` and a transfer is `POST {PRCPAY_BASE_URL}/transfer` in the same shape;
  amounts are **decimal in the currency's own units, never cents**. Every PrcPay currency
  is accepted except `PRCP` — PrcPay's own token — which `POST /api/prcpay/checkout`
  refuses.
  - **The sandbox has a PrcPay it can actually reach.** `prcpay-dev/server.mjs` runs as the
    `prcpay` service on port 3001 and answers both calls — bearer required, `{ id, status:
    'succeeded' }` back — so the instant rail can be exercised end to end without a
    merchant account; `.env.base44-defaults` points `PRCPAY_BASE_URL` at it
    (`http://prcpay:3001/api`). It moves no money and never sees `PRCPAY_API_KEY`. Set
    `PRCPAY_BASE_URL` as a secret to the real API and the stand-in is never called — the
    secret is listed after the defaults file, so it always wins. A PrcPay running on the
    machine that hosts the sandbox is reachable from the api service as
    `host.docker.internal:3001` (`extra_hosts` in the compose file). Until
    `PRCPAY_BASE_URL` names a host that answers, a charge fails with a 502 and nothing is
    charged.
  - **Pay-in settles inside the request — there is no redirect to come back from.**
    `POST /api/prcpay/checkout` (`{ kind: 'premium' | 'download' | 'licence', account,
    currency }`, with `media_id` or `application_id` for the last two) debits the payer's
    own PrcPay account (the card on it) and grants the membership or download immediately.
    For a **licence** it marks the application's fee paid **and** verified in the same
    request (`currency`, `amount_units`, `payment_reference`, note "Settled on PrcPay") —
    exactly the state the settlement webhook writes when the money arrives unannounced,
    which then finds the row already paid and does nothing. A fee already paid is refused
    with 409. `web/src/components/PrcPayButton.jsx` is that control for Premium and
    downloads; the licence is paid from the Android listener app's **Licence** tab.
  - **Payouts are instant too.** `creditEarnings` (`api/payments.js`) transfers each sale to
    the publishing station owner's own PrcPay account as it is recorded and writes the
    `payouts` row itself (`provider = 'prcpay'`), which is what marks the earning settled.
    An owner who has not named a PrcPay account stays on the control room's manual ledger
    exactly as before, so both shapes coexist. A PrcPay failure is logged and leaves the
    sale on that ledger rather than losing it.
  - **The control room takes PrcPay as a receiving account** — `method = 'prcpay'` in
    `payment_accounts`, added from the Payments desk like any other account. A licence fee
    paid into it is settled by PrcPay's own notification: `POST /api/prcpay/webhook` marks
    the application paid **and** verified, so the station opens without anyone checking a
    screenshot. Notifications carry no signature, so the source address list in
    `PRCPAY_WEBHOOK_IPS` is the whole check — with it unset the endpoint refuses every
    caller (403).
- **Stations are licensed, and listeners apply for one.** `web/src/pages/Apply.jsx`
  (`/apply`) offers **FM only** or **FM + TV** and a licence: **standard $5** or
  **premium $15** (`STATION_FEE_STANDARD_CENTS` / `STATION_FEE_PREMIUM_CENTS`, published
  as `station_fees` in `GET /api/config`). The fee is paid by card as the application is
  submitted: `POST /api/applications` records it, `POST /api/applications/:id/checkout`
  opens the Stripe session, and `fulfil()` sets `fee_status = 'paid'` idempotently, so a
  confirm plus a webhook still pays once. `GET /api/applications/mine` is what the
  applicant sees. Without a Stripe key the application is still recorded and the control
  room collects the fee with "Mark fee collected" (`POST /api/admin/applications/:id/fee`)
  — the same manual-fallback shape as Premium.
  - The control room's **Applications** tab is `GET /api/admin/applications`;
    `POST /api/admin/applications/:id/review` takes `{ action: 'approve' | 'reject', note }`.
    Approving needs `fee_status = 'paid'` and opens the station in the applicant's name on
    the plan they paid for — plus a second station named `<name> TV` for an FM + TV
    application. Both ids are kept on the application (`station_id`, `tv_station_id`).
- **The licence governs premium content.** `stations.plan` is `standard` or `premium`, and
  only a premium station may publish `access = 'premium'` or `'paid'` items: the API
  refuses with 403 when creating one or when an edit sets that access
  (`standardPlanStation` in `api/guards.js`), naming the station that must upgrade. The
  Publish form disables those two choices on a standard station. Demo stations are seeded
  on the premium licence, because the demo media includes premium and paid items.
- **Station revenue is a ledger the control room settles, not an automatic transfer.** A
  paid download credits the publishing station's owner in `earnings` — `creditEarnings` in
  `api/payments.js`, keyed on the checkout session so a double fulfilment credits once.
  Only `kind = 'download'` reaches the ledger: a membership is platform-wide and has no
  single station behind it. The studio's Overview shows the station's earned, sales and
  outstanding balance (`GET /api/earnings/mine`); the control room's **Revenue** tab
  (`GET /api/admin/earnings`) lists owners with earned/settled/outstanding, every sale and
  the payout history, and `POST /api/admin/payouts` writes one `payouts` row for an owner's
  whole outstanding balance and marks those `earnings` rows settled. Nothing is transferred
  by the app — the money moves outside it and the payout row is the record — **except** for
  an owner who has set a PrcPay account: those sales are transferred to it instantly (see
  "PrcPay" below) and reach this ledger already settled.
- **Owners leave the control room somewhere to send the money.** `payout_accounts` (one row
  per user) holds `account_name`, `bank_name`, `account_number`, an optional
  `routing_number` and a free-text `note`. The owner enters them in the studio's **Station
  settings** tab (`web/src/pages/studio/PayoutSettings.jsx`, `GET`/`PUT
  /api/earnings/account`); one profile covers every station the account owns. The Revenue
  tab shows the details beside each owner and the payout confirmation names where the money
  is going. They are kept as typed — a record for a manual transfer, not a payment
  credential held by a provider — and the API returns them only to the owning account and
  to admins. A `prcpay_account` (with the `prcpay_currency` it settles in) is the one field
  that is a payment destination rather than an instruction: setting it switches that
  owner's sales to instant PrcPay payouts, and the bank fields then become optional.
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
- **Deleting a published item takes the file with it, and neither the live desk nor the
  recording sweep puts it back.** `DELETE /api/media/:id` and `DELETE /api/admin/media/:id`
  both go through `removeMedia` (`api/mediaCleanup.js`): the row, the file behind its
  `/uploads/...` url (`removeStoredFile` in `api/uploads.js` — a pasted link or one of the
  seeded samples has no local file), a live window still *on air* over the item is closed, and
  the session's `recording_url` is cleared. That last one matters: `sweepLiveRecordings()`
  archives every ended broadcast whose `recording_url` is not in `media`, so a deleted **Relive
  capture** would otherwise be re-created by the next sweep. A sale keeps its amount
  (`earnings.media_id`) and a window keeps its history (`live_sessions.media_id`) — both keys
  are `ON DELETE SET NULL`. Entitlements and access requests cascade away with the item. The
  controls are the studio's Media tab (owner), the control room's Moderation desk (admin), and
  **the Delete on a card in the media library** (`web/src/pages/Library.jsx`), which is shown
  only to the item's station owner and to admins — a listener's card has no Delete at all.
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
  client is not wired up, so an account created with Google sets a password once on the web
  at `/account` and then signs in here with it.
- **What the native apps cover today**: the listener app has sign in/browse (Home, Radio,
  TV, Podcasts), station pages and one persistent ExoPlayer that keeps audio running
  behind a bar with artwork/title/live badge, plus mute/fullscreen for video; the control
  room has Dashboard, Stations (approve/suspend/delete), Moderation (flag/hide/restore/
  delete), Live (take off air) and Users (role/tier).
- **A listener watches a phone broadcast from the app as well.** `PlayerController` keys off
  `Playable.liveSessionId`, which `LiveSession.toPlayable()` sets for anything whose `mime`
  marks it a phone broadcast (a window over a published item has none). For one of those it
  holds off opening the file until the phone's first slice has landed, then re-opens the
  growing file at the position it had reached whenever `GET /api/live/:id/manifest` reports
  more bytes — so playback sits a couple of seconds behind the live edge, exactly as the web
  `LivePlayer` does — and opens the final part once more when the session ends, leaving what
  played available on the station as a Relive item. Everything else plays as a complete file
  as before.
- **The listener home mirrors the web home page** (`HomeScreen` in `Screens.kt`): hero
  (badge, strapline, blurb, "Browse radio"/"Browse TV"), On air now with the same card
  copy ("until HH:mm" / "on air 24/7", "Tune in"/"Station", or "Watch live" for a phone
  broadcast), Radio stations, TV stations and Latest uploads, each capped at 4 or 6 items
  with a "See all" chip. Keep the two in step when the web home changes — the native
  cards take their wording from `LiveSession.airLabel`/`isPhoneBroadcast` (`Models.kt`).
- **The creator studio is in the listener app**, its own tab behind the header's "Studio"
  chip (`StudioScreen.kt`) — the web dashboard's five tabs against the same owner-scoped
  API (`/stations/mine`, `/media/mine`, `/live/mine`, `/podcasts/mine`): Overview,
  Media, Live windows, Podcasts and Station settings. It signs in as the same account and
  shows only that account's stations, exactly like the web studio.
  - Media publishes a file the phone picked (a `GetContent` picker streamed to
    `POST /api/uploads`, see `Api.upload` in `core/Api.kt`) or a pasted link, then
    `POST /api/media`; each item can be hidden or deleted.
  - Live windows reuse `POST /api/live` with `hours` or `permanent`, plus
    `/:id/extend` and `/:id/end`.
  - Podcasts create shows, publish episodes (upload or link) and delete episodes.
  - Settings renames the station, edits its description and uploads artwork
    (`PATCH /api/stations/:id`).
  - The **Licence** tab (the header chip beside Studio, `LicenceScreen.kt`) applies for a
    station licence — name, description, FM / FM + TV, standard / premium — and pays the
    fee instantly from the PrcPay account the form names (`POST /api/applications`, then
    `POST /api/prcpay/checkout` with `kind = 'licence'`), against the same rows the web's
    `/apply` page writes. The studio's empty state offers it too. Card checkout and the
    manual transfer-proof upload stay web-only.
  - **Going live from the phone works here too.** `LiveBroadcast.kt` is the native counterpart
    of the web studio's broadcaster: `MediaRecorder` writes a WebM file in the app cache
    (VP8 + Opus, or Opus alone when the owner picks the audio-only preset) and every couple of seconds
    `PhoneBroadcast.kt` posts whatever the recorder appended since the last slice to
    `POST /api/live/:id/chunk` — the same endpoint, and the same growing file the website's
    `LiveBroadcaster.jsx`, the web `LivePlayer` and the native viewer all follow. WebM is the
    one container Android writes progressively — an MP4 gets its index only when recording
    stops — and `MediaRecorder.OutputFormat.WEBM` arrived in Android 10, so below API 29 the
    panel says so and offers the published-item window instead. The recorder is built before
    the session, so a device that refuses the camera fails before anything goes on air; the
    broadcast ends when the owner stops it or leaves the studio, and the API's sweep archives
    it either way. The stage comes first, as it does on the web: `startCamera()` opens the chosen
    lens (`facing` — "environment" or "user") and paints it on the studio's surface before
    anything is on air, the front/back switch turns it round, and "Go live" hands that same
    camera to the recorder instead of opening the lens twice. The surface is composed only once
    a camera is open — an empty one paints black over the "Camera is off — start it below" line
    — leaving the studio releases it (`releaseCamera()`), and so does picking the audio-only
    preset. The panel offers the same live title, window and quality choices as the web
    studio (`QUALITY_PRESETS` in `core/.../LiveSettings.kt`), writes the chosen pair back to
    the station through `PATCH /api/stations/:id/stream` and shows the camera's own preview
    while it is live (`LiveBroadcast.attachPreview`) — best-effort throughout, so a device
    that refuses a preview still records. A camera that will not hand the recorder the size a
    preset asks for falls back to 480p rather than refusing to go live.
  - **Still web-only**: premium checkout/downloads, access-request approvals and the APK
    download page.
- **`JSONObject.optString` turns a JSON null into the string `"null"`** on Android, which
  once made a live window look like a phone broadcast and pointed the player at
  `/null`. Every optional column goes through the private `JSONObject.text()` helper in
  `core/Models.kt` instead — use it for new nullable fields.
- The old Capacitor shells (`mobile/listener`, `mobile/admin`) are gone. If an installed
  app still shows the web page, it is an older APK — the native build ships as
  versionCode 4 under the same package names and the same signing key, so it updates in
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
curl -s localhost:3001/health                 # the local PrcPay stand-in
docker compose -f docker-compose.base44.yml logs --tail=20 prcpay   # what the app sent it
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
- The database role is `streamcast` (the compose `POSTGRES_USER`), never `postgres`: an
  ad-hoc `psql -U postgres` shows as `FATAL: role "postgres" does not exist` in the `db`
  log while the app itself is fine. Use
  `docker compose -f docker-compose.base44.yml exec -T db psql -U streamcast -d streamcast ...`.
- `activity` has no `title` column; it is `type` + `detail`, and `live_sessions` has
  `started_at`, not `created_at`.
- `station_applications` has no `contact_email` column — the applicant's address is the
  joined `users.email` (`SELECT a.*, u.email AS user_email …`). A
  `SELECT …, contact_email, … FROM station_applications` shows as
  `ERROR: column "contact_email" does not exist` in the `db` log while the app is fine.
- `users` has no `user_id` column — its key is `id`, and `user_id` is the foreign key
  pointing at it on the child tables (`activity`, `favorites`, `entitlements`,
  `payout_accounts`, `payouts`, …). A `SELECT id, user_id, … FROM users` shows as
  `ERROR: column "user_id" does not exist` in the `db` log; select `id` instead.
- `pg_stat_user_tables` names its oid column `relid`, not `oid`, so
  `pg_stat_get_last_analyze_time(oid)` shows as `ERROR: column "oid" does not exist` —
  pass `relid`.
- A `psql` capture that leaks its command tag into a later statement shows up as a
  syntax error in the `db` log; a leaked tag inside a JSON body shows up as a
  body-parser 400 in the `api` log. Both are the script, not the app.
- A script that interpolates an empty variable into a JSON body (`"station_id":$ID,`
  with `ID` unset) sends invalid JSON. Since the fix in `server.js`, the API answers
  `400 {"error":"The request body is not valid JSON"}` and logs a single
  `[api] rejected a request with a malformed JSON body` line — no stack trace. An
  `ERROR: ... violates foreign key constraint "stations_owner_id_fkey"` in the `db` log
  with `owner_id=(0)` is a script inserting a station for a user id it never resolved;
  the API resolves the owner itself and rejects an unknown one with 400.
