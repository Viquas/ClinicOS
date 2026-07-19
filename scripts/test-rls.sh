#!/usr/bin/env bash
#
# Verifies tenant isolation against a real Postgres.
#
# RLS is the actual security boundary of this product — the application-layer
# permission checks are a usability layer over it. So the policies get executed
# and asserted against, not reviewed by eye.
#
# Spins up a throwaway cluster, applies every migration in order, and runs
# drizzle/tests/rls.sql. Requires a local Postgres install (brew install
# postgresql@16); does not touch any real database.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA_DIR="${TMPDIR:-/tmp}/clinicos-rls-pgdata"
SOCKET_DIR="/tmp/clinicos-pg"
PORT=55433
DB=clinicos_rls_check

export PGHOST=127.0.0.1
export PGPORT="$PORT"
export PGUSER=postgres
# Homebrew Postgres aborts at startup ("postmaster became multithreaded")
# unless the locale is fully resolved.
export LC_ALL=C

cleanup() {
  pg_ctl -D "$PGDATA_DIR" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PGDATA_DIR" "$SOCKET_DIR"
}
trap cleanup EXIT

rm -rf "$PGDATA_DIR"
mkdir -p "$SOCKET_DIR"
initdb -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null

# The socket dir must be short: Postgres caps the socket path at 103 bytes and
# the default scratch paths blow past it.
pg_ctl -D "$PGDATA_DIR" \
  -o "-p $PORT -k $SOCKET_DIR -h 127.0.0.1" \
  -l "$PGDATA_DIR/server.log" start >/dev/null

for _ in $(seq 1 40); do
  pg_isready -q && break
  sleep 0.25
done

psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB;"

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

for migration in "$ROOT"/drizzle/*.sql; do
  echo "applying $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$migration"
done

echo
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/drizzle/tests/rls.sql" 2>&1 \
  | grep -oE "(pass|FAIL): .*|--- ALL RLS ASSERTIONS PASSED ---"
