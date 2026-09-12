#!/usr/bin/env bash
# VDC physical-state — PostgreSQL migration smoke validation.
# Uses resilient prisma migrate deploy (not db push) on the DATABASE_URL database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

MIGRATION_NAME="20260912200000_device_connection_physical_state"
PSQL_URL="${DATABASE_URL%%\?*}"

log() { printf '[physical-state-migration-test] %s\n' "$*"; }

psql_atc() {
  psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -tAc "$1"
}

log "Running resilient prisma migrate deploy"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

log "Verifying migration ${MIGRATION_NAME} is recorded as applied"
applied_count="$(psql_atc "
  SELECT COUNT(*)::text
  FROM _prisma_migrations
  WHERE migration_name = '${MIGRATION_NAME}'
    AND finished_at IS NOT NULL;
")"
applied_count="$(echo "${applied_count}" | tr -d '[:space:]')"
if [[ "${applied_count}" != "1" ]]; then
  echo "Expected exactly one applied row for ${MIGRATION_NAME}, got: ${applied_count}" >&2
  exit 1
fi

log "Verifying physical-state tables and TEXT identifier columns"
psql_atc "
DO \$\$
BEGIN
  IF to_regclass('public.device_connection_physical_states') IS NULL THEN
    RAISE EXCEPTION 'missing table device_connection_physical_states';
  END IF;
  IF to_regclass('public.device_connection_physical_state_transitions') IS NULL THEN
    RAISE EXCEPTION 'missing table device_connection_physical_state_transitions';
  END IF;

  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_states'
      AND column_name = 'organization_id'
  ) <> 'text' THEN
    RAISE EXCEPTION 'organization_id must be TEXT';
  END IF;

  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_states'
      AND column_name = 'vehicle_id'
  ) <> 'text' THEN
    RAISE EXCEPTION 'vehicle_id must be TEXT';
  END IF;

  IF (
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_connection_physical_state_transitions'
      AND column_name = 'candidate_state'
  ) <> 'NO' THEN
    RAISE EXCEPTION 'candidate_state must be NOT NULL';
  END IF;
END \$\$;
"

log "Physical-state migration smoke validation PASS (${MIGRATION_NAME})"
