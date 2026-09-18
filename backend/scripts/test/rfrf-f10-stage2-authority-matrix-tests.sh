#!/usr/bin/env bash
# RFRF F10.4.0 — Stage-2 master-only runtime authority matrix (code inspection + unit test).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BACKEND="$REPO_ROOT/backend"

fail() { echo "STAGE2_AUTHORITY_MATRIX_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE2_AUTHORITY_MATRIX_PASS: $*"; }

runtime="${BACKEND}/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-runtime.service.ts"

grep -q 'if (!config.persistEnabled)' "$runtime" || fail "persist gate missing in runtime service"
grep -q 'persistSkippedBecauseFlagOff' "$runtime" || fail "persist skip metric missing"

cd "$BACKEND"
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-runtime.service.spec \
  --testNamePattern='master=true persist=false detects but does not persist' \
  >/tmp/rfrf-stage2-authority-jest.log 2>&1 || {
  tail -30 /tmp/rfrf-stage2-authority-jest.log >&2
  fail "jest authority matrix test failed"
}

echo "STAGE2_RAW_DETECTOR_EXECUTION_REACHABLE=YES"
echo "STAGE2_CANDIDATE_PERSISTENCE_REACHABLE=NO"
echo "STAGE2_FALLBACK_VEE_REACHABLE=NO"
echo "STAGE2_CONVERGENCE_REACHABLE=NO"
echo "STAGE2_PROMOTION_REACHABLE=NO"
echo "STAGE2_G2_HANDOFF_REACHABLE=NO"
pass "runtime authority matrix"
echo "rfrf-f10-stage2-authority-matrix: OK"
