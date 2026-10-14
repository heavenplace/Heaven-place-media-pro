#!/usr/bin/env bash
#
# Carries the sandbox's accounts and content onto the production stack.
#
# Two halves, because the two ends are different machines — and because neither the dump
# nor the uploads archive belongs in git: the dump holds real accounts.
#
#   1. Here, in the sandbox, from the repo root:
#        ./deploy/migrate-data.sh export /tmp/streamcast-data
#
#   2. Copy that directory to the server (scp, rsync, whatever you have), then on the
#      server, from the repo root, with the production stack already running:
#        ./deploy/migrate-data.sh import /path/to/streamcast-data
#
# The dump is taken with --clean --if-exists, so importing it replaces whatever the
# production database already holds.
set -euo pipefail

DEV_COMPOSE="docker compose -f docker-compose.base44.yml"
PROD_COMPOSE="docker compose --env-file ${ENV_FILE:-.env.prod} -f docker-compose.prod.yml"

direction="${1:?usage: migrate-data.sh export|import <dir>}"
dir="${2:?usage: migrate-data.sh export|import <dir>}"

case "$direction" in
  export)
    mkdir -p "$dir"
    echo "==> Dumping the sandbox database"
    $DEV_COMPOSE exec -T db pg_dump -U streamcast -d streamcast \
      --clean --if-exists --no-owner --no-privileges > "$dir/streamcast.sql"

    echo "==> Archiving uploaded media"
    volume=$(docker volume ls --format '{{.Name}}' | grep -E '_uploads$' | head -n1)
    [ -n "$volume" ] || { echo "no uploads volume found" >&2; exit 1; }
    docker run --rm -v "$volume":/from:ro -v "$dir":/to alpine \
      tar czf /to/uploads.tgz -C /from .

    echo "==> Wrote $dir/streamcast.sql and $dir/uploads.tgz"
    ;;

  import)
    [ -f "$dir/streamcast.sql" ] || { echo "no streamcast.sql in $dir" >&2; exit 1; }

    echo "==> Restoring the database (this replaces what is there now)"
    $PROD_COMPOSE exec -T db psql -U "${POSTGRES_USER:-streamcast}" \
      -d "${POSTGRES_DB:-streamcast}" < "$dir/streamcast.sql"

    if [ -f "$dir/uploads.tgz" ]; then
      echo "==> Restoring uploaded media"
      $PROD_COMPOSE exec -T api tar xzf - -C /app/uploads < "$dir/uploads.tgz"
    fi

    echo "==> Done — the site now serves the carried-over accounts and content."
    ;;

  *)
    echo "usage: migrate-data.sh export|import <dir>" >&2
    exit 1
    ;;
esac
