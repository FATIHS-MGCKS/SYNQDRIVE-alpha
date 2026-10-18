#!/usr/bin/env bash
# EXP-021 S4 research worker — PostgreSQL integration (neutral recovery, idempotency, matrix).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

EXPECTED_V2_POSTGRES_TESTS=7
EXPECTED_MATRIX_POSTGRES_TESTS=10

fail_closed_url() {
  local name="$1" url="$2"
  local lower="${url,,}"
  case "$lower" in
    *127.0.0.1*|*localhost*) ;;
    *) echo "$name must target ephemeral local PostgreSQL (127.0.0.1 or localhost)" >&2; exit 1 ;;
  esac
  case "$lower" in
    *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*) echo "$name must not reference production hosts" >&2; exit 1 ;;
  esac
}

if [[ "${DI_V0_S4A_POSTGRES_REQUIRED:-}" == "1" ]]; then
  if [[ -z "${DI_V0_S4A_PG_ADMIN_URL:-}" ]]; then
    echo "DI_V0_S4A_POSTGRES_REQUIRED=1 but DI_V0_S4A_PG_ADMIN_URL is unset" >&2
    exit 1
  fi
  fail_closed_url "DI_V0_S4A_PG_ADMIN_URL" "$DI_V0_S4A_PG_ADMIN_URL"
fi

exports="$(bash scripts/test/di-v0-s4a-postgres-bootstrap.sh | grep '^export ')"
eval "$exports"
fail_closed_url "DATABASE_URL (bootstrap)" "$DATABASE_URL"
export DI_V0_S4A_POSTGRES_INTEGRATION=1

V2_LOG="$(mktemp /tmp/di-v0-s4-research-v2-postgres-ci.XXXXXX.log)"
MATRIX_LOG="$(mktemp /tmp/di-v0-s4-research-matrix-postgres-ci.XXXXXX.log)"
trap 'rm -f "$V2_LOG" "$MATRIX_LOG"' EXIT

set +e
npx jest --runInBand --forceExit --verbose \
  src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/__tests__/di-v0-s4-research-v2.postgres.integration.spec.ts \
  2>&1 | tee "$V2_LOG"
v2_status=${PIPESTATUS[0]}
set -e

if [[ "$v2_status" -ne 0 ]]; then
  echo "S4 research V2 Postgres jest suite failed (exit $v2_status)" >&2
  exit "$v2_status"
fi

if ! grep -qE "Tests:[[:space:]]+${EXPECTED_V2_POSTGRES_TESTS} passed" "$V2_LOG"; then
  echo "S4 research V2 Postgres CI expected exactly ${EXPECTED_V2_POSTGRES_TESTS} passing tests; output:" >&2
  grep -E '^Tests:' "$V2_LOG" >&2 || true
  exit 1
fi

set +e
npx jest --runInBand --forceExit --verbose \
  src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/__tests__/di-v0-s4-research-matrix.postgres.integration.spec.ts \
  2>&1 | tee "$MATRIX_LOG"
matrix_status=${PIPESTATUS[0]}
set -e

if [[ "$matrix_status" -ne 0 ]]; then
  echo "S4 research matrix Postgres jest suite failed (exit $matrix_status)" >&2
  exit "$matrix_status"
fi

if ! grep -qE "Tests:[[:space:]]+${EXPECTED_MATRIX_POSTGRES_TESTS} passed" "$MATRIX_LOG"; then
  echo "S4 research matrix Postgres CI expected exactly ${EXPECTED_MATRIX_POSTGRES_TESTS} passing tests; output:" >&2
  grep -E '^Tests:' "$MATRIX_LOG" >&2 || true
  exit 1
fi

echo "S4 research worker V2 Postgres CI OK (${EXPECTED_V2_POSTGRES_TESTS}/${EXPECTED_V2_POSTGRES_TESTS})"
echo "S4 research worker matrix Postgres CI OK (${EXPECTED_MATRIX_POSTGRES_TESTS}/${EXPECTED_MATRIX_POSTGRES_TESTS})"
