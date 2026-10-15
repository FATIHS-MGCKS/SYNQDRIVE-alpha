#!/usr/bin/env bash
# Disposable PostgreSQL certification for DTC-01B/01C snapshot apply integration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

export CI_PG_CONTAINER="${CI_PG_CONTAINER:-dtc01b-ci-postgres}"
PG_CONTAINER="${CI_PG_CONTAINER}"
PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_PORT="${CI_PG_PORT:-5432}"
BASE_DB="${CI_PG_BASE_DB:-synqdrive}"
DISPOSABLE_DB="${DTC01B_DISPOSABLE_DB:-dtc01b_test_ci}"

bash scripts/test/ci-start-postgres.sh

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${DISPOSABLE_DB}?schema=public"

docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${BASE_DB}" -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DISPOSABLE_DB}' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS ${DISPOSABLE_DB};" \
  -c "CREATE DATABASE ${DISPOSABLE_DB};"

echo "DTC01B_DISPOSABLE_DATABASE=${DISPOSABLE_DB}"
echo "DATABASE_URL=${DATABASE_URL}"

npm ci
npx prisma generate
npx prisma migrate deploy

export DTC_01B_PG_INTEGRATION=1
npm test -- --testPathPatterns=dtc-01b.postgres.integration.spec --runInBand

echo "DTC-01B PostgreSQL integration: PASS"
