#!/usr/bin/env bash
# EXP-021 S4A — ephemeral PostgreSQL verification: migration cases (M01–M08) and the
# multi-connection race/kill suite (R01–R25, K01–K18, KS1–KS3) on local disposable databases.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

EXPECTED_POSTGRES_TESTS=101

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

LOG="$(mktemp /tmp/di-v0-s4a-postgres-ci.XXXXXX.log)"
trap 'rm -f "$LOG"' EXIT

set +e
npx jest --runInBand --forceExit --verbose \
  src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-migration.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-races.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-s4b-precondition.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4-global-kill-transition.postgres.integration.spec.ts \
  2>&1 | tee "$LOG"
jest_status=${PIPESTATUS[0]}
set -e

if [[ "$jest_status" -ne 0 ]]; then
  echo "S4A Postgres jest suite failed (exit $jest_status)" >&2
  exit "$jest_status"
fi

if ! grep -qE "Tests:[[:space:]]+${EXPECTED_POSTGRES_TESTS} passed" "$LOG"; then
  echo "S4A Postgres CI expected exactly ${EXPECTED_POSTGRES_TESTS} passing tests; output:" >&2
  grep -E '^Tests:' "$LOG" >&2 || true
  exit 1
fi

echo "S4A Postgres CI suite OK (${EXPECTED_POSTGRES_TESTS}/${EXPECTED_POSTGRES_TESTS})"
