#!/usr/bin/env bash
# DI-DEF-019 GATE 1 — isolated PostgreSQL integration gate for Reference Capture lockSessionRow.
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ID="rc-def019-$(date +%s)"
DOCKER_CMD="${DOCKER_CMD:-docker}"
PG_PORT="${TEST_POSTGRES_PORT:-55433}"
PG_DB="rc_def019_${GATE_ID//-/_}"
PG_USER="rc_def019_test"
PG_PASS="rc_def019_${GATE_ID}_local"
PG_CONTAINER="rc-def019-pg-${GATE_ID}"

export TEST_POSTGRES_HOST="127.0.0.1"
export TEST_POSTGRES_PORT="${PG_PORT}"
export RC_DEF019_POSTGRES_USER="${PG_USER}"
export RC_DEF019_POSTGRES_PASSWORD="${PG_PASS}"

cleanup() {
  ${DOCKER_CMD} rm -f "${PG_CONTAINER}" 2>/dev/null || true
  ${DOCKER_CMD} volume rm "rc-def019-pg-vol-${GATE_ID}" 2>/dev/null || true
}

use_local_postgres() {
  if [[ -n "${RC_DEF019_USE_LOCAL_POSTGRES:-}" ]]; then
    return 0
  fi
  if ! ${DOCKER_CMD} info >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if use_local_postgres; then
  echo "==> Docker unavailable or RC_DEF019_USE_LOCAL_POSTGRES set — using existing local PostgreSQL"
  export TEST_POSTGRES_DATABASE="${TEST_POSTGRES_DATABASE:-synqdrive_rc_def019_test}"
  export DATABASE_URL="${DATABASE_URL:-postgresql://${PG_USER}:rc_def019_local_test@127.0.0.1:5432/${TEST_POSTGRES_DATABASE}?schema=public}"
else
  export TEST_POSTGRES_DATABASE="${PG_DB}"
  trap cleanup EXIT

  echo "==> Starting isolated PostgreSQL 16 on localhost:${PG_PORT}"
  ${DOCKER_CMD} run -d --name "${PG_CONTAINER}" \
    -e POSTGRES_USER="${PG_USER}" \
    -e POSTGRES_PASSWORD="${PG_PASS}" \
    -e POSTGRES_DB="${PG_DB}" \
    -p "127.0.0.1:${PG_PORT}:5432" \
    -v "rc-def019-pg-vol-${GATE_ID}:/var/lib/postgresql/data" \
    postgres:16

  echo "==> Waiting for PostgreSQL readiness"
  for i in $(seq 1 60); do
    if ${DOCKER_CMD} exec "${PG_CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  ${DOCKER_CMD} exec "${PG_CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}"

  export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${TEST_POSTGRES_HOST}:${TEST_POSTGRES_PORT}/${PG_DB}?schema=public"
fi

echo "TEST_POSTGRES_HOST=${TEST_POSTGRES_HOST}"
echo "TEST_POSTGRES_PORT=${TEST_POSTGRES_PORT}"
echo "TEST_POSTGRES_DATABASE=${TEST_POSTGRES_DATABASE}"
echo "TEST_POSTGRES_IS_PRODUCTION=NO"

cd "${BACKEND_ROOT}"

PRISMA_BIN="${BACKEND_ROOT}/node_modules/.bin/prisma"

echo "==> prisma validate"
"${PRISMA_BIN}" validate

echo "==> prisma migrate deploy (isolated, resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

echo "==> Reference Capture unit/regression tests (HF calibration focus)"
npm test -- \
  reference-capture-hf-calibration-concurrency \
  reference-capture-hf-calibration-lifecycle \
  reference-capture-hf-calibration-phase.policy \
  --runInBand --forceExit

echo "==> DI-DEF-019 real PostgreSQL integration suite"
REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1 npm test -- \
  reference-capture-lock-session.postgres.integration \
  --runInBand --forceExit

echo "==> backend build"
npm run build

echo "==> git diff --check"
cd "${BACKEND_ROOT}/.."
git diff --check

echo "==> GATE 1 complete"
echo "REAL_POSTGRES_USED=YES"
echo "GATE_1_PASS=YES"
