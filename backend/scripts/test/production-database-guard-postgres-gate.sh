#!/usr/bin/env bash
# Regression gate: production database identity + destructive prisma fence (ephemeral CI only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OPS_LIB="${ROOT}/scripts/ops/lib/production-database-identity-guard.lib.sh"
BACKUP_LIB="${ROOT}/scripts/ops/lib/production-database-backup-content-gate.lib.sh"
PRISMA_GUARD="${ROOT}/scripts/ops/lib/prisma-cli-guard.mjs"

log() { printf '[production-database-guard-gate] %s\n' "$*"; }
fail() { echo "!! FAIL: $*" >&2; exit 1; }

# shellcheck source=../ops/lib/production-database-identity-guard.lib.sh
source "$OPS_LIB"
# shellcheck source=../ops/lib/production-database-backup-content-gate.lib.sh
source "$BACKUP_LIB"

PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_PORT="${CI_PG_PORT:-5432}"
EPHEMERAL_DB="guard_test_ephemeral_$(date +%s)"
PROD_SHAPE_DB="guard_test_prod_shape_$(date +%s)"

export PGPASSWORD="$PG_PASSWORD"

psql_admin() {
  psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -v ON_ERROR_STOP=1 "$@"
}

createdb_if_needed() {
  psql_admin -d postgres -c "DROP DATABASE IF EXISTS \"${1}\";" >/dev/null
  psql_admin -d postgres -c "CREATE DATABASE \"${1}\";" >/dev/null
}

log "1) reject production-like reserved name on ephemeral profile"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=ephemeral
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/synqdrive?schema=public"
if pdb_guard_assert_ephemeral_database_url "$DATABASE_URL" 2>/dev/null; then
  fail "expected reject reserved synqdrive database name"
fi
log "PASS reserved name rejected"

log "2) reject forbidden host fragment"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@srv1374778.hstgr.cloud:5432/${EPHEMERAL_DB}?schema=public"
if pdb_guard_assert_ephemeral_database_url "$DATABASE_URL" 2>/dev/null; then
  fail "expected reject forbidden host"
fi
log "PASS forbidden host rejected"

log "3) legacy stub without ledger fails live contract"
createdb_if_needed "$PROD_SHAPE_DB"
if pdb_guard_assert_live_schema_contract "$PROD_SHAPE_DB" 2>/dev/null; then
  fail "expected stub DB without ledger to fail schema contract"
fi
log "PASS stub without ledger rejected"

log "4) additive migrate deploy allowed on ephemeral DB via guarded prisma"
createdb_if_needed "$EPHEMERAL_DB"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=ephemeral
pdb_guard_assert_ephemeral_database_url "$DATABASE_URL"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
log "PASS migrate deploy on ephemeral"

log "5) destructive prisma migrate reset blocked for reserved database name"
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/synqdrive?schema=public"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=production_vps
if node "$PRISMA_GUARD" migrate reset --force 2>/dev/null; then
  fail "expected migrate reset to be blocked"
fi
log "PASS migrate reset blocked"

log "6) backup content gate rejects empty/small dump"
EMPTY="$(mktemp /tmp/pdb-empty-backup.XXXXXX.sql.gz)"
printf '' | gzip -c > "$EMPTY"
if pdb_backup_gate_assert_dump_file "$EMPTY" 2>/dev/null; then
  fail "expected empty backup to fail content gate"
fi
log "PASS empty backup rejected"

log "7) undocumented bypass env rejected"
export SYNQDRIVE_PRODUCTION_GUARD_BYPASS=1
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
if pdb_guard_assert_ephemeral_database_url "$DATABASE_URL" 2>/dev/null; then
  fail "expected bypass env to be rejected"
fi
unset SYNQDRIVE_PRODUCTION_GUARD_BYPASS
log "PASS bypass env rejected"

log "8) app role without CREATE cannot DROP SCHEMA (simulated plan)"
psql_admin -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'guard_test_app') THEN
    CREATE ROLE guard_test_app LOGIN PASSWORD 'guard_test_app_local';
  END IF;
END\$\$;
REVOKE CREATE ON SCHEMA public FROM guard_test_app;
SQL
if psql -h 127.0.0.1 -p "$PG_PORT" -U guard_test_app -d postgres -c 'DROP SCHEMA public CASCADE;' 2>/dev/null; then
  fail "expected guard_test_app DROP SCHEMA to fail"
fi
log "PASS simulated app role blocked from DROP SCHEMA"

log "ALL production-database-guard gate checks PASS"
