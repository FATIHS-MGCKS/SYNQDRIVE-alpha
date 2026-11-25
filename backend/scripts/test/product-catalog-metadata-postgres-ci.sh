#!/usr/bin/env bash
# Disposable PostgreSQL certification for Product Catalog Editor P1 metadata PATCH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

export CI_PG_CONTAINER="${CI_PG_CONTAINER:-product-metadata-p1-ci-postgres}"
PG_CONTAINER="${CI_PG_CONTAINER}"
PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_PORT="${CI_PG_PORT:-5432}"
BASE_DB="${CI_PG_BASE_DB:-synqdrive_ci_ephemeral}"
DISPOSABLE_DB="synqdrive_product_metadata_p1"

fail_closed_database_url() {
  local name="$1" url="$2"
  local lower="${url,,}"
  case "$lower" in
    *127.0.0.1*|*localhost*|*@postgres:*) ;;
    *)
      echo "${name} must target ephemeral local PostgreSQL (127.0.0.1, localhost, or CI service host postgres)" >&2
      exit 1
      ;;
  esac
  case "$lower" in
    *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*|*synqdrive.eu*)
      echo "${name} must not reference production hosts" >&2
      exit 1
      ;;
  esac
}

assert_disposable_database_name() {
  local db_name="$1"
  if [[ "${db_name}" != "synqdrive_product_metadata_p1" ]]; then
    echo "Refusing: database name must be synqdrive_product_metadata_p1 (got ${db_name})" >&2
    exit 1
  fi
}

assert_disposable_database_name "${DISPOSABLE_DB}"

bash scripts/test/ci-start-postgres.sh

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${DISPOSABLE_DB}?schema=public"
fail_closed_database_url "DATABASE_URL" "${DATABASE_URL}"

docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${BASE_DB}" -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DISPOSABLE_DB}' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS ${DISPOSABLE_DB};" \
  -c "CREATE DATABASE ${DISPOSABLE_DB};"

echo "PRODUCT_METADATA_DISPOSABLE_DATABASE=${DISPOSABLE_DB}"
echo "DATABASE_URL=${DATABASE_URL}"

npm ci
npx prisma generate
export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1
bash scripts/test/prisma-migrate-deploy-resilient.sh

FIXTURE_SQL="${ROOT}/scripts/test/sql/ensure-product-metadata-p1-catalog-fixtures.sql"
if [[ ! -f "${FIXTURE_SQL}" ]]; then
  echo "missing fixture SQL: ${FIXTURE_SQL}" >&2
  exit 1
fi
docker exec -i "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${DISPOSABLE_DB}" -v ON_ERROR_STOP=1 < "${FIXTURE_SQL}"

slug_count="$(docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${DISPOSABLE_DB}" -tAc \
  "SELECT COUNT(*)::text FROM products WHERE slug IN ('RENTAL'::\"ProductSlug\", 'FLEET'::\"ProductSlug\", 'VYMOD'::\"ProductSlug\");")"
slug_count="$(echo "${slug_count}" | tr -d '[:space:]')"
if [[ "${slug_count}" != "3" ]]; then
  echo "Expected products RENTAL+FLEET+VYMOD (count=3), got ${slug_count}" >&2
  exit 1
fi
echo "PRODUCT_METADATA_FIXTURES=OK (3/3 slugs)"

assert_product_metadata_pg_ci_env() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Refusing: DATABASE_URL is required" >&2
    exit 1
  fi
  fail_closed_database_url "DATABASE_URL" "${DATABASE_URL}"
  if [[ "${PRODUCT_METADATA_PATCH_POSTGRES_INTEGRATION:-}" != "1" ]]; then
    echo "Refusing: PRODUCT_METADATA_PATCH_POSTGRES_INTEGRATION=1 is required (prevents silent describe.skip)" >&2
    exit 1
  fi
}

run_jest_postgres_suite() {
  local label="$1"
  local pattern="$2"
  local expected_tests="$3"

  local listed
  listed="$(npx jest --listTests --testPathPatterns="${pattern}" 2>/dev/null | wc -l | tr -d '[:space:]')"
  if [[ "${listed}" -lt 1 ]]; then
    echo "${label}: zero test files discovered (pattern=${pattern})" >&2
    exit 1
  fi

  local log
  log="$(mktemp /tmp/product-metadata-pg-ci.XXXXXX.log)"
  set +e
  npm test -- --testPathPatterns="${pattern}" --runInBand --verbose 2>&1 | tee "${log}"
  local test_exit=${PIPESTATUS[0]}
  set -e

  if grep -qE 'Tests:[[:space:]]+[0-9]+ skipped' "${log}"; then
    echo "${label}: refuse skipped tests in postgres gate" >&2
    grep -E 'Tests:|skipped' "${log}" >&2 || true
    exit 1
  fi
  if ! grep -qE "Tests:[[:space:]]+${expected_tests} passed, ${expected_tests} total" "${log}"; then
    echo "${label}: expected ${expected_tests} passed tests (discovery/execution mismatch or failure)" >&2
    grep -E 'Tests:|PASS |FAIL ' "${log}" >&2 || true
    exit 1
  fi
  if [[ "${test_exit}" -ne 0 ]]; then
    exit "${test_exit}"
  fi
  echo "${label}: PASS (${expected_tests}/${expected_tests})"
}

export PRODUCT_METADATA_PATCH_POSTGRES_INTEGRATION=1
assert_product_metadata_pg_ci_env

run_jest_postgres_suite \
  "Product metadata PATCH PostgreSQL (P1)" \
  "product-metadata.postgres.integration" \
  "4"

export PRODUCT_CATALOG_P2A_POSTGRES_INTEGRATION=1
run_jest_postgres_suite \
  "Product catalog admission PostgreSQL (P2A)" \
  "product-catalog-admission.postgres.integration" \
  "6"

echo "Product catalog metadata P1 + P2A admission disposable PostgreSQL certification: PASS"