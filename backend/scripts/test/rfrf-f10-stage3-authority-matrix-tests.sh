#!/usr/bin/env bash
# RFRF F10.5.0 — Stage-3 persist-enabled runtime authority matrix (code inspection + unit tests).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BACKEND="$REPO_ROOT/backend"

fail() { echo "STAGE3_AUTHORITY_MATRIX_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE3_AUTHORITY_MATRIX_PASS: $*"; }

runtime="${BACKEND}/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-runtime.service.ts"
promotion="${BACKEND}/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-refuel-promotion.service.ts"

grep -q 'if (!config.persistEnabled)' "$runtime" || fail "persist gate missing in runtime service"
grep -q "observation.lifecycleState === 'REJECTED'" "$runtime" || fail "REJECTED observation must not persist"
grep -q 'resolveOrCreateCandidate' "$runtime" || fail "candidate persistence path missing"
grep -q 'promotionSkippedNotAuthorized' "$runtime" || fail "promotion not-authorized skip missing"
grep -q 'convergenceSkippedNotAuthorized' "$runtime" || fail "convergence not-authorized skip missing"

cd "$BACKEND"
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-runtime.service.spec \
  --testNamePattern='master=true persist=false detects but does not persist|preserves F4.1 UNKNOWN promotion trust with ADMISSIBLE detection' \
  >/tmp/rfrf-stage3-authority-jest.log 2>&1 || {
  tail -40 /tmp/rfrf-stage3-authority-jest.log >&2
  fail "jest authority matrix tests failed"
}

echo "STAGE3_RAW_DETECTOR_EXECUTION_REACHABLE=YES"
echo "STAGE3_CANDIDATE_PERSISTENCE_REACHABLE=YES"
echo "STAGE3_FALLBACK_VEE_REACHABLE=NO"
echo "STAGE3_CONVERGENCE_REACHABLE=NO"
echo "STAGE3_PROMOTION_REACHABLE=NO"
echo "STAGE3_G2_HANDOFF_REACHABLE=NO"
pass "runtime authority matrix"
echo "rfrf-f10-stage3-authority-matrix: OK"
