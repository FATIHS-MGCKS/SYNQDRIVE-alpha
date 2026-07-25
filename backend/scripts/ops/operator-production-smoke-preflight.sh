#!/usr/bin/env bash
# Operator production smoke — read-only preflight (safe to run without credentials)
set -euo pipefail

BASE="${OPERATOR_SMOKE_BASE_URL:-https://app.synqdrive.eu}"

echo "Operator smoke preflight @ ${BASE}"

check() {
  local name="$1"
  local url="$2"
  local expect="$3"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$code" == "$expect" ]]; then
    echo "PASS $name ($code)"
  else
    echo "FAIL $name (expected $expect, got $code)"
    exit 1
  fi
}

check "operator-shell" "${BASE}/operator" "200"
check "health" "${BASE}/api/v1/health" "200"
check "readiness" "${BASE}/api/v1/health/readiness" "200"
check "unauth-pickups" "${BASE}/api/v1/organizations/00000000-0000-4000-8000-000000000001/bookings/today/pickups" "401"

if [[ -n "${OPERATOR_SMOKE_ORG_ID:-}" ]]; then
  echo "OPERATOR_SMOKE_ORG_ID set — authenticated write smoke still requires Clerk JWT (see docs/runbooks/operator-production-smoke.md)"
else
  echo "SKIP authenticated write smoke — OPERATOR_SMOKE_ORG_ID not set (GAP-043-001)"
fi

echo "Preflight complete."
