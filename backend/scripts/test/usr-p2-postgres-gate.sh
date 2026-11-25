#!/usr/bin/env bash
# USR-P2 disposable PostgreSQL gate (local CI / agent VM with system PostgreSQL).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "${DATABASE_URL:-}" == *"app.synqdrive"* || "${DATABASE_URL:-}" == *"production"* ]]; then
  echo "Refusing production-like DATABASE_URL" >&2
  exit 1
fi

EPHEMERAL_DB="${USR_P2_PG_DB:-usr_p2_disposable_$(date +%s)}"
PG_HOST="${CI_PG_HOST:-127.0.0.1}"
PG_PORT="${CI_PG_PORT:-5432}"

log() { printf '[usr-p2-postgres-gate] %s\n' "$*"; }

log "Creating disposable database ${EPHEMERAL_DB}"
if command -v sudo >/dev/null && id -u postgres >/dev/null 2>&1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"${EPHEMERAL_DB}\";" >/dev/null
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres \
    -c "CREATE DATABASE \"${EPHEMERAL_DB}\" OWNER synqdrive;" >/dev/null
else
  PGPASSWORD="${USR_P2_PG_PASSWORD:-synqdrive}" psql -h "$PG_HOST" -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"${EPHEMERAL_DB}\";" >/dev/null
  PGPASSWORD="${USR_P2_PG_PASSWORD:-synqdrive}" psql -h "$PG_HOST" -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -d postgres \
    -c "CREATE DATABASE \"${EPHEMERAL_DB}\" OWNER synqdrive;" >/dev/null
fi

export PGPASSWORD="${USR_P2_PG_PASSWORD:-synqdrive}"
export DATABASE_URL="postgresql://${USR_P2_PG_USER:-synqdrive}:${PGPASSWORD}@${PG_HOST}:${PG_PORT}/${EPHEMERAL_DB}?schema=public"

log "migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

export JWT_SECRET="${JWT_SECRET:-usr-p2-pg-test-secret}"

log "USR-P2 access revocation PostgreSQL"
export USR_P2_ACCESS_REVOCATION_PG=1
npx jest usr-p2-access-revocation.postgres.integration.spec.ts --runInBand --forceExit

log "USR-P2 session concurrency PostgreSQL"
export USR_P2_SESSION_CONCURRENCY_PG=1
npx jest usr-p2-session-concurrency.postgres.integration.spec.ts --runInBand --forceExit

log "USR-P1A session audit PostgreSQL (P1A residuals gate)"
export USR_P1A_SESSION_AUDIT_PG=1
npx jest usr-p1a-session-audit-certification.postgres.integration.spec.ts --runInBand --forceExit

log "PASS disposable DB ${EPHEMERAL_DB}"
echo "USR_P2_PG_EXECUTED=1 DATABASE_URL=${DATABASE_URL}"