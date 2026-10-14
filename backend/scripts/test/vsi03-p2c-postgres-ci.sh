#!/usr/bin/env bash
# Disposable PostgreSQL certification for VSI-03 P2C observation ledger.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${VSI03_PG_HOST:-127.0.0.1}"
PG_PORT="${VSI03_PG_PORT:-5432}"
PG_USER="${VSI03_PG_USER:-synqdrive}"
PG_PASSWORD="${VSI03_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${VSI03_PG_ADMIN_DB:-postgres}"
VSI03_DB="${VSI03_PG_DATABASE:-vsi03_test_ci}"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${VSI03_DB}?schema=public"
export VSI03_READONLY_COMPOSER_PG=1

echo "VSI03 P2C postgres CI: host=${PG_HOST} db=${VSI03_DB}"

if command -v psql >/dev/null 2>&1; then
  PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 \
    -c "SELECT 1 FROM pg_database WHERE datname = '${VSI03_DB}'" | grep -q 1 \
    || PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE ${VSI03_DB}"
fi

npx prisma migrate deploy

npx jest \
  --runInBand \
  --verbose \
  vsi-provider-source-observation.postgres.integration \
  vsi-provider-source-observation.concurrency.postgres.integration
