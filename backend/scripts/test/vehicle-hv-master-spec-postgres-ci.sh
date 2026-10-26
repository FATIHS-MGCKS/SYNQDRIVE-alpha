#!/usr/bin/env bash
set -euo pipefail

log() { printf '[vehicle-hv-master-spec-postgres-ci] %s\n' "$*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DB_NAME="synqdrive_hv_master_spec_ci_$(date +%s)"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/${DB_NAME}?schema=public}"

if ! command -v psql >/dev/null 2>&1; then
  log "SKIP: psql not available"
  exit 0
fi

log "Creating disposable database ${DB_NAME}"
createdb "$DB_NAME" 2>/dev/null || true

log "Applying Prisma migrations"
npx prisma migrate deploy --schema=prisma/schema.prisma

export VEHICLE_HV_MASTER_SPEC_PG=1
npm test -- vehicles-hv-master-specification.postgres.integration.spec.ts

log "Dropping disposable database ${DB_NAME}"
dropdb --if-exists "$DB_NAME" 2>/dev/null || true

log "vehicle-hv-master-spec-postgres-ci completed successfully"
