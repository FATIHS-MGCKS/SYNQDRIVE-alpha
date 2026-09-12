#!/usr/bin/env bash
# Prove RFRF F2 migration.sql executes against a realistic pre-F2 PostgreSQL schema.
# SAFE ISOLATED USE ONLY — localhost dedicated database, never production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_SHA="${RFRF_F2_PRE_SCHEMA_SHA:-503416c82e4daca298e80c134e0baaba4393b768}"
PORT="${RFRF_F2_PG_PORT:-5433}"
DB="${RFRF_F2_MIGRATION_PROOF_DB:-synqdrive_rfrf_f2_migration_proof}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PRISMA_BIN="${ROOT}/node_modules/.bin/prisma"
MIGRATION_SQL="${ROOT}/prisma/migrations/20260912123000_rfrf_f2_raw_refuel_candidates/migration.sql"
PRE_SCHEMA="/tmp/rfrf-pre-f2-schema.prisma"
DATABASE_URL="postgresql://postgres@localhost:${PORT}/${DB}?schema=public"
export DATABASE_URL

log() { printf '[rfrf-f2-migration-proof] %s\n' "$*"; }

log "Creating isolated database ${DB} on localhost:${PORT}"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"DROP DATABASE IF EXISTS ${DB} WITH (FORCE);\""
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d postgres -c \"CREATE DATABASE ${DB};\""

log "Materializing pre-F2 schema from ${BASE_SHA}"
git show "${BASE_SHA}:backend/prisma/schema.prisma" > "${PRE_SCHEMA}"
cd "${ROOT}"
"${PRISMA_BIN}" db push --schema="${PRE_SCHEMA}" --accept-data-loss --skip-generate >/tmp/rfrf-pre-f2-db-push.log 2>&1

log "Verifying raw_refuel_candidates is absent before F2 SQL"
BEFORE="$(su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -Atc \"SELECT to_regclass('public.raw_refuel_candidates');\"")"
if [[ -n "${BEFORE}" ]]; then
  echo "Expected raw_refuel_candidates to be absent, found: ${BEFORE}" >&2
  exit 1
fi

log "Executing F2 migration.sql (single-shot, not idempotent by design)"
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -v ON_ERROR_STOP=1 -f \"${MIGRATION_SQL}\"" >/tmp/rfrf-f2-migration-exec.log 2>&1

log "Verifying post-F2 schema objects"
VERIFY_SQL="/tmp/rfrf-f2-migration-verify.sql"
cat > "${VERIFY_SQL}" <<'SQL'
SELECT CASE WHEN to_regclass('public.raw_refuel_candidates') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS table_exists;
SELECT is_nullable
FROM information_schema.columns
WHERE table_name = 'raw_refuel_candidates'
  AND column_name = 'candidate_identity_key';
SELECT COUNT(*) AS enum_count
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN (
    'RawRefuelCandidateLifecycleState',
    'RawRefuelCandidateSignalChannel',
    'RawRefuelAbsoluteSignalTrust',
    'RawRefuelCandidateRejectionReason'
  );
SELECT COUNT(*) AS index_count
FROM pg_indexes
WHERE tablename = 'raw_refuel_candidates';
SELECT COUNT(*) AS candidate_rows FROM raw_refuel_candidates;
SELECT CASE WHEN to_regclass('public.vehicle_energy_events') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS base_table_preserved;
SQL
su - postgres -c "${PG_BIN}/psql -h localhost -p ${PORT} -d ${DB} -v ON_ERROR_STOP=1 -f \"${VERIFY_SQL}\""

log "F2 migration SQL proof completed successfully"
