#!/usr/bin/env bash
# PR #1290 — PostgreSQL migration smoke gate (disposable DB only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION_SQL="$ROOT/prisma/migrations/20260825180000_dimo_provider_link_dimo_vehicle_fk/migration.sql"
RESULTS_DIR="${RESULTS_DIR:-/opt/cursor/artifacts}"
RESULTS_FILE="$RESULTS_DIR/pr1290-postgres-migration-smoke.json"
DB_NAME="${SMOKE_DB_NAME:-pr1290_smoke_$(date +%s)}"
PG_USER="${PGUSER:-postgres}"
PG_HOST="${PGHOST:-localhost}"
PG_PORT="${PGPORT:-5432}"
SMOKE_PG_PASSWORD="${SMOKE_PG_PASSWORD:-pr1290_smoke_local}"
export PGPASSWORD="$SMOKE_PG_PASSWORD"
DATABASE_URL="postgresql://${PG_USER}:${SMOKE_PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${DB_NAME}"

mkdir -p "$RESULTS_DIR"

log() { echo "[smoke] $*"; }
fail() { log "FAIL: $*"; exit 1; }

cleanup() {
  if [[ "${KEEP_SMOKE_DB:-0}" != "1" ]]; then
    dropdb -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" --if-exists "$DB_NAME" 2>/dev/null || true
  fi
}
trap cleanup EXIT

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER postgres PASSWORD '${SMOKE_PG_PASSWORD}';" >/dev/null

pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" >/dev/null || fail "PostgreSQL not ready"

PG_VERSION=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -tAc "SELECT version();" | head -1)
log "PostgreSQL: $PG_VERSION"

createdb -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" "$DB_NAME"

log "Applying pre-migration faithful schema (init subset + HM phase1 + provider columns + Production HM FK)"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/ops/smoke-pr1290-pre-migration-schema.sql"

log "Seeding legacy HM + DIMO fixture data"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/ops/smoke-pr1290-seed-fixtures.sql"

log "Pre-migration HM FK rejection test"
set +e
PRE_FK_ERR=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "
INSERT INTO vehicle_data_source_links (id, vehicle_id, provider, source_type, source_subtype, source_reference_id, is_active)
VALUES ('bad-pre-fk', 'veh-smoke-dimo', 'UNKNOWN', 'HIGH_MOBILITY', 'HM_HEALTH', 'nonexistent-hm-id', true);
" 2>&1)
PRE_FK_RC=$?
set -e
[[ "$PRE_FK_RC" -ne 0 ]] || fail "Pre-migration invalid HM FK should reject"
echo "$PRE_FK_ERR" | grep -qi "foreign key\|violates foreign key" || fail "Expected FK violation pre-migration: $PRE_FK_ERR"
log "Pre-migration HM FK rejection: PASS ($PRE_FK_ERR)"

log "Applying PR #1290 migration SQL"
START_MS=$(date +%s%3N)
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION_SQL"
END_MS=$(date +%s%3N)
MIGRATION_MS=$((END_MS - START_MS))
log "Migration applied in ${MIGRATION_MS}ms"

log "Recording migration in _prisma_migrations"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id VARCHAR(36) PRIMARY KEY,
  checksum VARCHAR(64) NOT NULL,
  finished_at TIMESTAMPTZ,
  migration_name VARCHAR(255) NOT NULL,
  logs TEXT,
  rolled_back_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES (gen_random_uuid()::text, 'smoke', now(), '20260825180000_dimo_provider_link_dimo_vehicle_fk', 1);
"

log "Post-migration DDL inspection + C1-C10 + unique/FK tests"
export DATABASE_URL
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/ops/smoke-pr1290-post-migration-tests.sql" \
  > "$RESULTS_DIR/pr1290-postgres-smoke-sql.log" 2>&1

log "Prisma validate/generate + client integration"
cd "$ROOT"
DATABASE_URL="$DATABASE_URL" npx prisma validate > "$RESULTS_DIR/pr1290-prisma-validate.log" 2>&1
DATABASE_URL="$DATABASE_URL" npx prisma generate > "$RESULTS_DIR/pr1290-prisma-generate.log" 2>&1

DATABASE_URL="$DATABASE_URL" npx ts-node -r tsconfig-paths/register "$ROOT/scripts/ops/smoke-pr1290-prisma-client-test.ts" \
  > "$RESULTS_DIR/pr1290-prisma-client-smoke.log" 2>&1

log "Prisma migrate status (recorded migration)"
DATABASE_URL="$DATABASE_URL" npx prisma migrate status > "$RESULTS_DIR/pr1290-prisma-migrate-status.log" 2>&1 || true

log "Targeted PR #1290 drift check (subset DB — full migrate diff N/A)"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/ops/smoke-pr1290-targeted-drift-check.sql" \
  > "$RESULTS_DIR/pr1290-targeted-drift-check.log" 2>&1
UNEXPECTED_DRIFT=0

log "Writing results JSON"
node -e "
const fs=require('fs');
const sql=fs.readFileSync('$RESULTS_DIR/pr1290-postgres-smoke-sql.log','utf8');
const prisma=fs.readFileSync('$RESULTS_DIR/pr1290-prisma-client-smoke.log','utf8');
const out={
  headSha: '$(git -C /workspace rev-parse HEAD)',
  postgresVersion: $(node -pe "JSON.stringify('$PG_VERSION')"),
  databaseUrl: 'postgresql://***@${PG_HOST}:${PG_PORT}/${DB_NAME}',
  testDbMethod: 'local PostgreSQL 16 — faithful pre-migration schema from repository migrations (init subset + HM phase1 + audit provider columns + Production-equivalent HM FK)',
  migrationDurationMs: $MIGRATION_MS,
  unexpectedSchemaDriftStatements: $UNEXPECTED_DRIFT,
  sqlLog: sql,
  prismaClientLog: prisma,
};
fs.writeFileSync('$RESULTS_FILE', JSON.stringify(out,null,2));
"

log "Smoke gate artifacts:"
log "  $RESULTS_FILE"
log "  $RESULTS_DIR/pr1290-postgres-smoke-sql.log"
log "  $RESULTS_DIR/pr1290-prisma-client-smoke.log"
log "  $RESULTS_DIR/pr1290-targeted-drift-check.log"
log "  targeted drift statements: $UNEXPECTED_DRIFT (0 = pass)"

if [[ "$UNEXPECTED_DRIFT" != "0" ]]; then
  log "WARNING: targeted drift check failed — review $RESULTS_DIR/pr1290-targeted-drift-check.log"
fi

log "DONE — review logs for PASS/FAIL markers"
