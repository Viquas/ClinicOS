#!/usr/bin/env bash
#
# Local Postgres for development.
#
# Runs the real migrations against a real database so queries are verified
# against actual SQL rather than a mock. Supabase-specific roles are created
# so the RLS migration applies unchanged — the same file that will run against
# the Mumbai project.
#
#   scripts/dev-db.sh start   → boot, migrate, print DATABASE_URL
#   scripts/dev-db.sh stop    → shut down
#   scripts/dev-db.sh reset   → wipe and re-migrate
#
# Requires a local Postgres install (brew install postgresql@16).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA_DIR="$ROOT/.pgdata"
SOCKET_DIR="/tmp/clinicos-dev-pg"
PORT=55440
DB=clinicos_dev

export PGHOST=127.0.0.1
export PGPORT="$PORT"
export PGUSER=postgres
# Homebrew Postgres aborts at startup ("postmaster became multithreaded")
# unless the locale is fully resolved.
export LC_ALL=C

DATABASE_URL="postgresql://postgres@127.0.0.1:${PORT}/${DB}"

start() {
  if pg_isready -q 2>/dev/null; then
    echo "already running"
  else
    if [ ! -d "$PGDATA_DIR" ]; then
      echo "initialising cluster..."
      initdb -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
    fi

    mkdir -p "$SOCKET_DIR"
    # Socket dir must be short: Postgres caps the path at 103 bytes.
    pg_ctl -D "$PGDATA_DIR" \
      -o "-p $PORT -k $SOCKET_DIR -h 127.0.0.1" \
      -l "$PGDATA_DIR/server.log" start >/dev/null

    for _ in $(seq 1 40); do pg_isready -q && break; sleep 0.25; done
    echo "postgres up on :$PORT"
  fi

  if ! psql -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
    createdb "$DB"
    echo "created database $DB"
  fi

  # Roles Supabase provides that a vanilla cluster does not.
  psql -v ON_ERROR_STOP=1 -q -d "$DB" <<'SQL'
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','supabase_auth_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I', r);
    end if;
  end loop;
end $$;
SQL

  migrate
  echo
  echo "DATABASE_URL=$DATABASE_URL"
}

migrate() {
  # drizzle-kit's journal lives in drizzle/meta; applying by hand keeps this
  # script dependency-free and matches how the RLS migration must be applied.
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );"

  for file in "$ROOT"/drizzle/*.sql; do
    name="$(basename "$file")"
    applied=$(psql -tAq -d "$DB" -c "select 1 from _migrations where name = '$name'")
    if [ -z "$applied" ]; then
      echo "applying $name"
      psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$file"
      psql -q -d "$DB" -c "insert into _migrations (name) values ('$name')"
    fi
  done
}

stop() {
  pg_ctl -D "$PGDATA_DIR" stop -m fast >/dev/null 2>&1 || true
  echo "stopped"
}

reset() {
  stop
  rm -rf "$PGDATA_DIR"
  echo "wiped"
  start
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  reset) reset ;;
  migrate) migrate ;;
  url) echo "$DATABASE_URL" ;;
  *) echo "usage: dev-db.sh [start|stop|reset|migrate|url]"; exit 1 ;;
esac
