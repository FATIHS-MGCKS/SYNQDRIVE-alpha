#!/usr/bin/env bash
# Regression gate: production database identity + destructive prisma fence (ephemeral CI only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
REPO_ROOT="$(cd "${ROOT}/.." && pwd)"

OPS_LIB="${ROOT}/scripts/ops/lib/production-database-identity-guard.lib.sh"
BACKUP_LIB="${ROOT}/scripts/ops/lib/production-database-backup-content-gate.lib.sh"
PRISMA_GUARD="${ROOT}/scripts/ops/lib/prisma-cli-guard.mjs"
STAMP_MJS="${ROOT}/scripts/ops/lib/production-database-migration-authority-stamp.mjs"

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
HMAC_KEY_FILE="${RUNNER_TEMP:-/tmp}/migration-authority-${EPHEMERAL_DB}.hmac.key"
openssl rand -base64 48 > "$HMAC_KEY_FILE"
chmod 600 "$HMAC_KEY_FILE"
export SYNQDRIVE_MIGRATION_AUTHORITY_HMAC_KEY_FILE="$HMAC_KEY_FILE"
export PGPASSWORD="$PG_PASSWORD"
export CI_PG_USER="$PG_USER" CI_PG_PASSWORD="$PG_PASSWORD" CI_PG_PORT="$PG_PORT"

psql_admin() {
  psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -v ON_ERROR_STOP=1 "$@"
}

createdb_if_needed() {
  psql_admin -d postgres -c "DROP DATABASE IF EXISTS \"${1}\";" >/dev/null
  psql_admin -d postgres -c "CREATE DATABASE \"${1}\";" >/dev/null
}

log "stamp: HMAC write/verify/tamper/replay"
createdb_if_needed "$EPHEMERAL_DB"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
export SYNQDRIVE_MIGRATION_AUTHORITY_STAMP_FILE="$STAMP_FILE"
export PDB_GUARD_AUTHORITY_STAMP_PATH="$STAMP_FILE"
pdb_guard_write_migration_authority_stamp "$DATABASE_URL" "$STAMP_FILE" >/dev/null
export SYNQDRIVE_MIGRATION_PREFLIGHT_NONCE="$(pdb_guard_read_migration_preflight_nonce "$STAMP_FILE")"
pdb_guard_assert_migration_authority_stamp "$DATABASE_URL"
TAMPERED="${STAMP_FILE}.tampered"
cp "$STAMP_FILE" "$TAMPERED"
sed -i 's/|ledger=[0-9]*/|ledger=999999/' "$TAMPERED"
export SYNQDRIVE_MIGRATION_AUTHORITY_STAMP_FILE="$TAMPERED"
expect_fail pdb_guard_assert_migration_authority_stamp "$DATABASE_URL"
export SYNQDRIVE_MIGRATION_AUTHORITY_STAMP_FILE="$STAMP_FILE"
export SYNQDRIVE_MIGRATION_PREFLIGHT_NONCE="wrong-nonce-replay"
expect_fail pdb_guard_assert_migration_authority_stamp "$DATABASE_URL"
export SYNQDRIVE_MIGRATION_PREFLIGHT_NONCE="$(pdb_guard_read_migration_preflight_nonce "$STAMP_FILE")"
pdb_guard_consume_migration_authority_stamp "$DATABASE_URL"
expect_fail pdb_guard_assert_migration_authority_stamp "$DATABASE_URL"

log "1) legacy stub without ledger rejected"
createdb_if_needed "guard_stub_${EPHEMERAL_DB}"
expect_fail pdb_guard_assert_live_schema_contract "guard_stub_${EPHEMERAL_DB}"

log "2) migration vs runtime DSN mismatch rejected"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
export SYNQDRIVE_MIGRATION_DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/other_db?schema=public"
expect_fail pdb_guard_assert_parsed_urls_equivalent "$DATABASE_URL" "$SYNQDRIVE_MIGRATION_DATABASE_URL" "runtime" "migration"
unset SYNQDRIVE_MIGRATION_DATABASE_URL

log "3) backup parity rejects empty dump and foreign-db rename"
EMPTY="$(mktemp /tmp/pdb-empty-backup.XXXXXX.sql.gz)"
printf '' | gzip -c > "$EMPTY"
expect_fail pdb_backup_gate_assert_dump_file "$EMPTY"
createdb_if_needed "guard_backup_src_${EPHEMERAL_DB}"
createdb_if_needed "guard_backup_other_${EPHEMERAL_DB}"
DUMP_OTHER="/tmp/guard-other-${EPHEMERAL_DB}.sql.gz"
pg_dump -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "guard_backup_other_${EPHEMERAL_DB}" | gzip -c > "$DUMP_OTHER"
CAPTURE_OTHER="${DUMP_OTHER}.capture.json"
python3 - "$CAPTURE_OTHER" "guard_backup_other_${EPHEMERAL_DB}" <<'PY'
import json, sys, datetime
path, db = sys.argv[1], sys.argv[2]
json.dump({"dbname": db, "db_oid": "999", "server_port": "5432", "captured_at": datetime.datetime.utcnow().isoformat()+"Z"}, open(path,"w"))
PY
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/guard_backup_src_${EPHEMERAL_DB}?schema=public"
expect_fail pdb_guard_assert_backup_dump_target_parity "$DATABASE_URL" "$DUMP_OTHER" "guard_backup_src_${EPHEMERAL_DB}" "$CAPTURE_OTHER"

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

log "5b) prisma schema file allowed; literal URL schema rejected"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=ephemeral
printf 'datasource db { provider = "postgresql" url = "postgresql://x" }\n' > /tmp/evil.prisma
expect_fail node "$PRISMA_GUARD" migrate deploy --schema /tmp/evil.prisma
node "$PRISMA_GUARD" migrate deploy --schema prisma/schema.prisma

log "6) app owner transition: CRUD ok, DROP blocked"
ROLE_DB="guard_role_sim_${EPHEMERAL_DB}"
createdb_if_needed "$ROLE_DB"
psql_admin -d postgres <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='guard_app') THEN CREATE ROLE guard_app LOGIN PASSWORD 'guard_app_local'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='guard_migrate') THEN CREATE ROLE guard_migrate LOGIN PASSWORD 'guard_migrate_local'; END IF;
END \$\$;
GRANT ALL PRIVILEGES ON DATABASE "${ROLE_DB}" TO guard_app;
SQL
psql_admin -d "$ROLE_DB" <<SQL
CREATE TABLE IF NOT EXISTS app_data(id int primary key);
INSERT INTO app_data VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE app_data OWNER TO guard_app;
REVOKE CREATE ON SCHEMA public FROM guard_app;
ALTER TABLE app_data OWNER TO guard_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_data TO guard_app;
GRANT USAGE, CREATE ON SCHEMA public TO guard_migrate;
SQL
PGPASSWORD=guard_app_local psql -h 127.0.0.1 -p "$PG_PORT" -U guard_app -d "$ROLE_DB" -c 'INSERT INTO app_data VALUES (2);' >/dev/null
expect_fail env PGPASSWORD=guard_app_local psql -h 127.0.0.1 -p "$PG_PORT" -U guard_app -d "$ROLE_DB" -c 'DROP TABLE app_data;'
expect_fail env PGPASSWORD=guard_app_local psql -h 127.0.0.1 -p "$PG_PORT" -U guard_app -d "$ROLE_DB" -c 'DROP SCHEMA public CASCADE;'
PGPASSWORD=guard_migrate_local psql -h 127.0.0.1 -p "$PG_PORT" -U guard_migrate -d "$ROLE_DB" -c 'CREATE TABLE IF NOT EXISTS mig_added(id int);' >/dev/null

log "7) migrate resolve blocked under deploy authority"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/synqdrive?schema=public"
export SYNQDRIVE_MIGRATION_AUTHORITY=1
expect_fail pdb_guard_assert_migration_resolve_authority
export SYNQDRIVE_MIGRATION_RECOVERY_RESOLVE_AUTHORIZED=1
unset SYNQDRIVE_MIGRATION_AUTHORITY
pdb_guard_assert_migration_resolve_authority

log "8a) backup capture verify + prisma-with-guard path gates"
bash scripts/test/production-database-backup-capture-verify.gate.sh
bash scripts/test/prisma-with-guard-path.gate.sh

log "8b) tire DS4 shadow catch-up integration (ephemeral migrate deploy)"
TIRE_DS4_DB="tire_ds4_shadow_${EPHEMERAL_DB}"
createdb_if_needed "$TIRE_DS4_DB"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${TIRE_DS4_DB}?schema=public"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=ephemeral
pdb_guard_assert_ephemeral_database_url "$DATABASE_URL"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
node "$PRISMA_GUARD" db push --accept-data-loss --skip-generate --schema prisma/schema.prisma
export TIRE_DS4_SHADOW_POSTGRES_INTEGRATION=1
export TIRE_DS4_SHADOW_POSTGRES_REQUIRED=1
npx jest tire-ds4-shadow-catchup.postgres.integration --runInBand --forceExit

log "8) bootstrap manifest integrity + dry-run"
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
bash scripts/test/production-database-guard-bootstrap-dry-run.sh

log "ALL production-database-guard gate checks PASS"
