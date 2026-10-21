#!/usr/bin/env bash
# EXP-021 P2 — trip speed quality projection PostgreSQL hardening (PG1–PG14).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

EXPECTED_POSTGRES_TESTS=15
EXPECTED_PREVIEW_POSTGRES_TESTS=7

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

LOG="$(mktemp /tmp/di-v0-p2-tsq-postgres-ci.XXXXXX.log)"
trap 'rm -f "$LOG"' EXIT

set +e
npx jest --runInBand --forceExit --verbose \
  src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/__tests__/di-v0-trip-speed-quality-hardening.postgres.integration.spec.ts \
  2>&1 | tee "$LOG"
jest_status=${PIPESTATUS[0]}
set -e

if [[ "$jest_status" -ne 0 ]]; then
  echo "P2 trip speed quality Postgres jest suite failed (exit $jest_status)" >&2
  exit "$jest_status"
fi

if ! grep -qE "Tests:[[:space:]]+${EXPECTED_POSTGRES_TESTS} passed" "$LOG"; then
  echo "P2 Postgres CI expected exactly ${EXPECTED_POSTGRES_TESTS} passing tests; output:" >&2
  grep -E '^Tests:' "$LOG" >&2 || true
  exit 1
fi

PREVIEW_LOG="$(mktemp /tmp/di-v0-p2-tsq-preview-postgres-ci.XXXXXX.log)"
trap 'rm -f "$LOG" "$PREVIEW_LOG"' EXIT

set +e
npx jest --runInBand --forceExit --verbose \
  src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/__tests__/di-v0-trip-speed-quality-preview.postgres.integration.spec.ts \
  2>&1 | tee "$PREVIEW_LOG"
preview_status=${PIPESTATUS[0]}
set -e

if [[ "$preview_status" -ne 0 ]]; then
  echo "P2.1 preview Postgres jest suite failed (exit $preview_status)" >&2
  exit "$preview_status"
fi

if ! grep -qE "Tests:[[:space:]]+${EXPECTED_PREVIEW_POSTGRES_TESTS} passed" "$PREVIEW_LOG"; then
  echo "P2.1 preview Postgres CI expected exactly ${EXPECTED_PREVIEW_POSTGRES_TESTS} passing tests; output:" >&2
  grep -E '^Tests:' "$PREVIEW_LOG" >&2 || true
  exit 1
fi

EXPECTED_AUTO_V2_TESTS=15
AUTO_LOG="$(mktemp /tmp/di-v0-p2-auto-v2-postgres-ci.XXXXXX.log)"
trap 'rm -f "$LOG" "$PREVIEW_LOG" "$AUTO_LOG"' EXIT

set +e
npx jest --runInBand --forceExit --verbose \
  src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/__tests__/di-v0-p2-auto-projection-v2.postgres.integration.spec.ts \
  2>&1 | tee "$AUTO_LOG"
auto_status=${PIPESTATUS[0]}
set -e

if [[ "$auto_status" -ne 0 ]]; then
  echo "P2 auto projection V2 Postgres jest suite failed (exit $auto_status)" >&2
  exit "$auto_status"
fi

if ! grep -qE "Tests:[[:space:]]+${EXPECTED_AUTO_V2_TESTS} passed" "$AUTO_LOG"; then
  echo "P2 auto V2 Postgres CI expected exactly ${EXPECTED_AUTO_V2_TESTS} passing tests; output:" >&2
  grep -E '^Tests:' "$AUTO_LOG" >&2 || true
  exit 1
fi

echo "P2 trip speed quality Postgres CI OK (${EXPECTED_POSTGRES_TESTS}/${EXPECTED_POSTGRES_TESTS})"
echo "P2.1 preview Postgres CI OK (${EXPECTED_PREVIEW_POSTGRES_TESTS}/${EXPECTED_PREVIEW_POSTGRES_TESTS})"
echo "P2 auto projection V2 Postgres CI OK (${EXPECTED_AUTO_V2_TESTS}/${EXPECTED_AUTO_V2_TESTS})"
