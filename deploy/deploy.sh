#!/usr/bin/env bash
#
# One command to put the production stack live on a Docker host.
#
#   On the server, from the repo root:
#     ./deploy/deploy.sh                     # validate, build, start, health-check
#     ./deploy/deploy.sh --check             # validate only — nothing is built or started
#     ENV_FILE=other.env ./deploy/deploy.sh  # use a different environment file
#
# This runs docker-compose.prod.yml: Postgres, the API and Caddy on one origin (see
# deploy/Caddyfile). The sandbox dev stack (docker-compose.base44.yml) is a different
# thing and is never touched from here.
#
# What it cannot do, because it needs you or the app's own dashboards:
#   - fill in .env.prod — a first run writes it from deploy/.env.prod.example and stops
#   - the DNS record and the Let's Encrypt challenge (the preflight only warns)
#   - the Google OAuth origin and the Stripe webhook
#   - building the APKs — the exact command is printed at the end of the run
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

check_only=false
case "${1:-}" in
  --check) check_only=true ;;
  "") ;;
  *) echo "usage: deploy.sh [--check]" >&2; exit 2 ;;
esac

say() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# --- 1. the tools this needs ------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker is not installed on this host"
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not available"

# --- 2. the environment file ------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  cp deploy/.env.prod.example "$ENV_FILE"
  die "created $ENV_FILE from deploy/.env.prod.example — fill it in, then run this again"
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

say "using $ENV_FILE (site address: ${SITE_ADDRESS:-unset})"

missing=()
for name in SITE_ADDRESS PUBLIC_ORIGIN POSTGRES_PASSWORD JWT_SECRET ADMIN_EMAIL ADMIN_PASSWORD; do
  case "${!name:-}" in
    ""|change-me|you@example.com) missing+=("$name") ;;
  esac
done
[ ${#missing[@]} -eq 0 ] || die "still to fill in $ENV_FILE: ${missing[*]}"

case "$SITE_ADDRESS" in
  */*|*" "*|http://*|https://*)
    die "SITE_ADDRESS must be a bare hostname, e.g. streamcast.example.com" ;;
esac
case "$PUBLIC_ORIGIN" in
  http://*|https://*) ;;
  *) die "PUBLIC_ORIGIN must include the scheme, e.g. https://streamcast.example.com" ;;
esac

# --- 3. the stack itself ----------------------------------------------------
"${COMPOSE[@]}" config --quiet || die "docker-compose.prod.yml does not resolve with $ENV_FILE"

# --- 4. preflight: will Caddy be able to get a certificate? -----------------
# Caddy asks Let's Encrypt for a certificate for exactly SITE_ADDRESS, and that only
# works once the name resolves here. Warning only, never a stop: the stack itself is
# correct either way, it just will not serve https until the record points here.
case "$SITE_ADDRESS" in
  *.*)
    resolved="$(getent hosts "$SITE_ADDRESS" 2>/dev/null | awk '{print $1}' | head -n1 || true)"
    local_ips="$(hostname -I 2>/dev/null || true)"
    if [ -z "$resolved" ]; then
      say "warning: $SITE_ADDRESS does not resolve yet — point its A record here, or Caddy cannot get a certificate"
    elif ! grep -qw -- "$resolved" <<<"$local_ips"; then
      say "warning: $SITE_ADDRESS resolves to $resolved, which is not an address of this machine"
      say "         Caddy's certificate challenge will fail until the record points here"
    fi
    ;;
esac

if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ':(80|443)$'; then
  say "note: something already holds port 80 or 443 — fine if it is this stack, otherwise stop it first"
fi

if $check_only; then
  say "$ENV_FILE and docker-compose.prod.yml both check out — nothing was built or started (--check)"
  exit 0
fi

# --- 5. build and start -----------------------------------------------------
say "building and starting the stack (a first run takes a few minutes)"
"${COMPOSE[@]}" up -d --build

# --- 6. wait for the healthchecks ------------------------------------------
say "waiting for the services to report healthy"
deadline=$((SECONDS + 180))
while :; do
  not_ready="$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | awk '$2 != "healthy" {print $1}')"
  [ -z "$not_ready" ] && break
  if [ "$SECONDS" -ge "$deadline" ]; then
    "${COMPOSE[@]}" ps
    die "still unhealthy after three minutes: $not_ready — '${COMPOSE[*]} logs <service>' shows why"
  fi
  sleep 3
done
say "all services healthy"

# --- 7. does the site answer at its own address? ---------------------------
if code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "http://$SITE_ADDRESS/" 2>/dev/null)" &&
   [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
  say "$SITE_ADDRESS answers (HTTP $code) — the site is live"
else
  say "the stack is up on this host, but $SITE_ADDRESS did not answer"
  say "usually the DNS record still points elsewhere, or ports 80/443 are closed at the firewall"
  say "Caddy keeps retrying the certificate on its own once the name resolves here"
fi

# --- 8. what is still manual ------------------------------------------------
cat <<EOF

Still to do by hand:
  - the APK download buttons 404 until they are built against this origin:
      API_BASE_URL=$PUBLIC_ORIGIN docker compose -f docker-compose.mobile.yml run --rm android
    then rebuild the web image:  ${COMPOSE[*]} up -d --build web
  - add $PUBLIC_ORIGIN to the Google OAuth client's authorized JavaScript origins
  - point the Stripe webhook at $PUBLIC_ORIGIN/api/payments/webhook
  - carry the existing accounts and content over, from the sandbox:
      ./deploy/migrate-data.sh export <dir>   # there, then copy <dir> to this host
      ./deploy/migrate-data.sh import <dir>   # here
EOF
