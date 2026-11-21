#!/usr/bin/env bash
set -euo pipefail
# Never read .env or use production connection variables. This cluster is disposable.
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSSLROOTCERT DATABASE_URL SUPABASE_DB_URL
command -v initdb >/dev/null || { echo 'Local PostgreSQL binaries are required'; exit 1; }
command -v pg_ctl >/dev/null || { echo 'Local PostgreSQL binaries are required'; exit 1; }
root=/tmp/phase1
if [ -e "$root/data/PG_VERSION" ]; then echo 'Existing /tmp/phase1 cluster: refusing to overwrite it'; exit 1; fi
mkdir -p "$root/socket"
as_pg=()
if [ "$(id -u)" = 0 ]; then
  chown -R 1000:1000 "$root"
  as_pg=(setpriv --reuid=1000 --regid=1000 --clear-groups)
fi
cleanup() {
  "${as_pg[@]}" pg_ctl -D "$root/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$root"
}
trap cleanup EXIT
"${as_pg[@]}" initdb -D "$root/data" -U postgres --auth=trust --no-locale --encoding=UTF8 >/dev/null
"${as_pg[@]}" pg_ctl -D "$root/data" -l "$root/server.log" -o "-k $root/socket -p 55439 -h ''" -w start >/dev/null
psql -X -h "$root/socket" -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE phase1_tests' >/dev/null
psql -X -h "$root/socket" -p 55439 -U postgres -d phase1_tests -v ON_ERROR_STOP=1 -f src/test/fixtures/security-phase1-baseline.sql >/dev/null
for migration in drizzle/migrations/001[6-9]_*.sql drizzle/migrations/002*.sql; do
  psql -X -h "$root/socket" -p 55439 -U postgres -d phase1_tests -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done
export PHASE1_TEST_SOCKET="$root/socket"
# An explicit local-DB command cannot skip: readiness is checked before Vitest.
psql -X -h "$root/socket" -p 55439 -U postgres -d phase1_tests -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
bunx vitest run "$@"