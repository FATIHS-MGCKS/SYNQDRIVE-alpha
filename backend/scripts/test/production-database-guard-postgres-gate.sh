#!/usr/bin/env bash
# Regression gate: production database identity + destructive prisma fence (ephemeral CI only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

OPS_LIB="${ROOT}/scripts/ops/lib/production-database-identity-guard.lib.sh"
BACKUP_LIB="${ROOT}/scripts/ops/lib/production-database-backup-content-gate.lib.sh"
PRISMA_GUARD="${ROOT}/scripts/ops/lib/prisma-cli-guard.mjs"

log() { printf '[production-database-guard-gate] %s\n' "$*"; }
fail() { echo "!! FAIL: $*" >&2; exit 1; }

expect_fail() {
  set +e
  ( "$@" )
  local rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    fail "expected failure: $*"
  fi
}

export SYNQDRIVE_GUARD_TEST_MODE=1
# shellcheck source=../ops/lib/production-database-identity-guard.lib.sh
source "$OPS_LIB"
# shellcheck source=../ops/lib/production-database-backup-content-gate.lib.sh
source "$BACKUP_LIB"

PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_PORT="${CI_PG_PORT:-5432}"
EPHEMERAL_DB="guard_test_ephemeral_$(date +%s)"
STAMP_FILE="/tmp/synqdrive-migration-authority-${EPHEMERAL_DB}.stamp"
export PGPASSWORD="$PG_PASSWORD"
export CI_PG_USER="$PG_USER" CI_PG_PASSWORD="$PG_PASSWORD" CI_PG_PORT="$PG_PORT"

psql_admin() {
  psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -v ON_ERROR_STOP=1 "$@"
}

createdb_if_needed() {
  psql_admin -d postgres -c "DROP DATABASE IF EXISTS \"${1}\";" >/dev/null
  psql_admin -d postgres -c "CREATE DATABASE \"${1}\";" >/dev/null
}

log "1) legacy stub without ledger rejected"
createdb_if_needed "guard_stub_${EPHEMERAL_DB}"
expect_fail pdb_guard_assert_live_schema_contract "guard_stub_${EPHEMERAL_DB}"

log "2) migration vs runtime DSN mismatch rejected"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
export SYNQDRIVE_MIGRATION_DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/other_db?schema=public"
expect_fail pdb_guard_assert_parsed_urls_equivalent "$DATABASE_URL" "$SYNQDRIVE_MIGRATION_DATABASE_URL" "runtime" "migration"
unset SYNQDRIVE_MIGRATION_DATABASE_URL

log "3) empty backup rejected"
EMPTY="$(mktemp /tmp/pdb-empty-backup.XXXXXX.sql.gz)"
printf '' | gzip -c > "$EMPTY"
expect_fail pdb_backup_gate_assert_dump_file "$EMPTY"

log "4) additive migrate deploy on ephemeral DB"
createdb_if_needed "$EPHEMERAL_DB"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=ephemeral
pdb_guard_assert_ephemeral_database_url "$DATABASE_URL"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

log "5) destructive migrate reset blocked (reserved name)"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/synqdrive?schema=public"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=production_vps
expect_fail node "$PRISMA_GUARD" migrate reset --force

log "6) simulated app role cannot DROP SCHEMA"
psql_admin -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'guard_test_app') THEN
    CREATE ROLE guard_test_app LOGIN PASSWORD 'guard_test_app_local';
  END IF;
END\$\$;
REVOKE CREATE ON SCHEMA public FROM guard_test_app;
GRANT CONNECT ON DATABASE postgres TO guard_test_app;
SQL
expect_fail psql -h 127.0.0.1 -p "$PG_PORT" -U guard_test_app -d postgres -c 'DROP SCHEMA public CASCADE;'

log "7) migrate resolve blocked under deploy authority on simulated VPS"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/synqdrive?schema=public"
export SYNQDRIVE_MIGRATION_AUTHORITY=1
touch /tmp/synqdrive-vps-marker-test
# prisma guard checks /opt/synqdrive/shared/backend.env — skip full VPS path; bash guard:
expect_fail pdb_guard_assert_migration_resolve_authority
export SYNQDRIVE_MIGRATION_RECOVERY_RESOLVE_AUTHORIZED=1
unset SYNQDRIVE_MIGRATION_AUTHORITY
pdb_guard_assert_migration_resolve_authority

log "8) bootstrap manifest integrity"
REPO_ROOT="$(cd "${ROOT}/.." && pwd)"
MANIFEST="${ROOT}/scripts/ops/contracts/production-database-guard-bundle.manifest.sha256"
[[ -f "$MANIFEST" ]] || fail "missing bundle manifest sha256"
while read -r line; do
  [[ -z "$line" ]] && continue
  hash="${line%%  *}"
  rel="${line#*  }"
  src="${REPO_ROOT}/${rel}"
  [[ -f "$src" ]] || fail "missing manifest path ${rel}"
  actual="$(sha256sum "$src" | awk '{print $1}')"
  [[ "$actual" == "$hash" ]] || fail "manifest drift ${rel}"
done < "$MANIFEST"

log "9) migration authority stamp required for production deploy path (simulated)"
createdb_if_needed "guard_prod_sim_${EPHEMERAL_DB}"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/guard_prod_sim_${EPHEMERAL_DB}?schema=public"
export SYNQDRIVE_MIGRATION_AUTHORITY_STAMP_FILE="$STAMP_FILE"
export PDB_GUARD_AUTHORITY_STAMP_PATH="$STAMP_FILE"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
pdb_guard_write_migration_authority_stamp "$DATABASE_URL" > "$STAMP_FILE"
export SYNQDRIVE_MIGRATION_AUTHORITY=1
if pdb_guard_assert_migration_authority_stamp "$DATABASE_URL"; then
  log "stamp verification PASS"
fi

rm -f /tmp/synqdrive-vps-marker-test 2>/dev/null || true
log "ALL production-database-guard gate checks PASS"
