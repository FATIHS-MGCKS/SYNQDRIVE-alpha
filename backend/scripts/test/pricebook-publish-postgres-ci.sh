#!/usr/bin/env bash
# Disposable PostgreSQL gate for pricebook publish regression.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[pricebook-publish-postgres-gate] %s\n' "$*"; }
fail() { printf '[pricebook-publish-postgres-gate] FAIL: %s\n' "$*" >&2; exit 1; }

if [[ "${DATABASE_URL:-}" == *"app.synqdrive"* || "${DATABASE_URL:-}" == *"srv1374778"* ]]; then
  fail 'production-like DATABASE_URL is not permitted'
fi

PG_HOST="${CI_PG_HOST:-127.0.0.1}"
PG_PORT="${CI_PG_PORT:-5432}"
PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"

EPHEMERAL_DB="${PRICEBOOK_PUBLISH_PG_DB:-pricebook_publish_disposable_$(date +%s)_$$}"
if ! [[ "$EPHEMERAL_DB" =~ ^pricebook_publish_disposable_[a-z0-9_]+$ ]]; then
  fail 'database name must match ^pricebook_publish_disposable_[a-z0-9_]+$'
fi
CREATED_BY_GATE=0

export PGPASSWORD="$PG_PASSWORD"
export PGHOST="$PG_HOST"
export PGPORT="$PG_PORT"

psql_admin() {
  psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d postgres "$@"
}

cleanup() {
  if [[ "${CREATED_BY_GATE:-0}" == 1 && -n "${EPHEMERAL_DB:-}" ]]; then
    psql_admin -c "DROP DATABASE IF EXISTS \"${EPHEMERAL_DB}\";" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log "create disposable database ${EPHEMERAL_DB}"
psql_admin -c "CREATE DATABASE \"${EPHEMERAL_DB}\";" >/dev/null
CREATED_BY_GATE=1

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${EPHEMERAL_DB}?schema=public"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

export PRICEBOOK_PUBLISH_POSTGRES_INTEGRATION=1
npm run test:billing:pricebook-publish:postgres

log 'PASS'