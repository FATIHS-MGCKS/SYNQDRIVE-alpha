#!/usr/bin/env bash
# Disposable PostgreSQL verification for VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V2.sql (offline only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
BACKEND="${ROOT}/backend"
EVIDENCE="${ROOT}/architecture/vehicle-onboarding/evidence"

export VO2_PG_HOST="${VO2_PG_HOST:-127.0.0.1}"
export VO2_PG_PORT="${VO2_PG_PORT:-5432}"
export VO2_PG_USER="${VO2_PG_USER:-synqdrive}"
export VO2_PG_PASSWORD="${VO2_PG_PASSWORD:-synqdrive}"
export PGPASSWORD="${VO2_PG_PASSWORD}"

ADMIN_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/postgres"
INT_DB="vo_sig_b1_sql_v2_${RANDOM}_$(date +%s)"
INT_DATABASE_URL="postgresql://${VO2_PG_USER}:${VO2_PG_PASSWORD}@${VO2_PG_HOST}:${VO2_PG_PORT}/${INT_DB}?schema=public"

cleanup() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${INT_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${INT_DB}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[vo-sig-b1-sql-v2] create database ${INT_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${INT_DB}\";"

cd "${BACKEND}"
DATABASE_URL="${INT_DATABASE_URL}" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

cd "${BACKEND}"
NODE_PATH="${BACKEND}/node_modules" DATABASE_URL="${INT_DATABASE_URL}" \
  npx tsx "${ROOT}/architecture/vehicle-onboarding/evidence/scripts/vo-sig-b1-simple-repair-review-v3.ephemeral.test.ts" \
  | tee "${EVIDENCE}/VO_SIG_B1_SIMPLE_REPAIR_V3_TEST_EVIDENCE.log"

echo "[vo-sig-b1-sql-v3] passed"
