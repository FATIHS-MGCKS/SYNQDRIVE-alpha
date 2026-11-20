#!/usr/bin/env bash
# Contract: greenfield-disposable-migrate-recovery.sh fail-closed preflight (no migrate).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNNER="${ROOT}/scripts/test/greenfield-disposable-migrate-recovery.sh"

expect_rc() {
  local want="$1"
  shift
  set +e
  "$@"
  local got=$?
  set -e
  if [[ "$got" -ne "$want" ]]; then
    echo "expected exit $want got $got: $*" >&2
    exit 1
  fi
}

echo "preflight: missing opt-in → 41"
expect_rc 41 env DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/synqdrive_p12_preflight_x' bash "$RUNNER"

echo "preflight: forbidden host → ephemeral guard (non-zero)"
set +e
env SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1 DATABASE_URL='postgresql://u:p@app.synqdrive.eu:5432/synqdrive_p12_x' bash "$RUNNER" >/dev/null 2>&1
host_rc=$?
set -e
if [[ "$host_rc" -eq 0 ]]; then
  echo "expected non-zero for forbidden host" >&2
  exit 1
fi

echo "preflight: disallowed db name → 42"
expect_rc 42 env SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1 DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/not_allowlisted_db' bash "$RUNNER"

echo "preflight: bad credentials → 44"
expect_rc 44 env SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1 DATABASE_URL='postgresql://nobody:bad@127.0.0.1:5433/synqdrive_p12_preflight_x' bash "$RUNNER"

if PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
  DB="synqdrive_p12_preflight_pop_$(date +%s)"
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE \"${DB}\";" >/dev/null
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d "$DB" -c 'CREATE TABLE _prisma_migrations (id TEXT); INSERT INTO _prisma_migrations VALUES ('\''x'\'');' >/dev/null
  echo "preflight: populated _prisma_migrations → 43"
  expect_rc 43 env SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1 DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/${DB}" bash "$RUNNER"
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -c "DROP DATABASE \"${DB}\";" >/dev/null
else
  echo "skip populated-db case (no local postgres on 5433)"
fi

echo "greenfield-disposable-migrate-recovery-preflight.selftest: PASS"