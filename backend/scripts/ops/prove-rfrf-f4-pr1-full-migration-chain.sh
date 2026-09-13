#!/usr/bin/env bash
# Prove full repository migration chain on an empty isolated PostgreSQL database.
# SAFE ISOLATED USE ONLY — never production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${RFRF_F4_FULL_CHAIN_PG_PORT:-5433}"
DB="${RFRF_F4_FULL_CHAIN_DB:-synqdrive_rfrf_f4_full_chain_proof}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PRISMA_BIN="${ROOT}/node_modules/.bin/prisma"
DATABASE_URL="postgresql://postgres@localhost:${PORT}/${DB}?schema=public"
export DATABASE_URL

log() { printf '[rfrf-f4-full-chain-proof] %s\n' "$*"; }

psql_atc() {
  su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -Atc \"$1\""
}

cleanup() {
  su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"DROP DATABASE IF EXISTS ${DB} WITH (FORCE);\"" >/dev/null 2>&1 || true
}

log "Creating empty isolated database ${DB} on localhost:${PORT}"
cleanup
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"CREATE DATABASE ${DB};\""

cd "${ROOT}"
log "Running: npx prisma migrate deploy (empty database, no baseline shortcut)"
DEPLOY_LOG="/tmp/rfrf-f4-full-chain-deploy.log"
if ! "${PRISMA_BIN}" migrate deploy >"${DEPLOY_LOG}" 2>&1; then
  log "FULL_REPOSITORY_MIGRATION_CHAIN=FAIL"
  tail -40 "${DEPLOY_LOG}" >&2 || true
  cleanup
  exit 1
fi

MIGRATION_COUNT="$(find "${ROOT}/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
APPLIED_COUNT="$(psql_atc "SELECT COUNT(*)::text FROM _prisma_migrations WHERE rolled_back_at IS NULL;")"
CHECK_EXISTS="$(psql_atc "SELECT COUNT(*)::text FROM pg_constraint WHERE conname = 'vehicle_energy_events_source_identity_check';")"
F4_COLUMNS="$(psql_atc "
  SELECT COUNT(*)::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vehicle_energy_events'
    AND column_name IN ('detection_source', 'source_event_key');
")"

log "migration_dirs=${MIGRATION_COUNT} applied_rows=${APPLIED_COUNT} f4_columns=${F4_COLUMNS} source_identity_check=${CHECK_EXISTS}"

if [[ "${APPLIED_COUNT}" != "${MIGRATION_COUNT}" ]]; then
  log "FULL_REPOSITORY_MIGRATION_CHAIN=FAIL (applied ${APPLIED_COUNT} != dirs ${MIGRATION_COUNT})"
  cleanup
  exit 1
fi

if [[ "${F4_COLUMNS}" != "2" || "${CHECK_EXISTS}" != "1" ]]; then
  log "FULL_REPOSITORY_MIGRATION_CHAIN=FAIL (F4 schema artifacts missing after deploy)"
  cleanup
  exit 1
fi

cleanup
log "FULL_REPOSITORY_MIGRATION_CHAIN=PASS (empty DB, ${APPLIED_COUNT} migrations, no baseline shortcut)"
