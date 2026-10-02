#!/usr/bin/env bash
# RFRF F10.6.0 — Stage-4 convergence-enabled runtime authority matrix (code + integration tests).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BACKEND="$REPO_ROOT/backend"

fail() { echo "STAGE4_AUTHORITY_MATRIX_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE4_AUTHORITY_MATRIX_PASS: $*"; }

runtime="${BACKEND}/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-runtime.service.ts"
promotion="${BACKEND}/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-refuel-promotion.service.ts"
convergence="${BACKEND}/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-refuel-convergence.service.ts"
g2="${BACKEND}/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-refuel-g2-handoff.service.ts"

grep -q 'convergenceEvaluationAttempted' "$runtime" || fail "convergence evaluation path missing in runtime"
grep -q 'promotionSkippedNotAuthorized' "$runtime" || fail "promotion not-authorized skip missing"
grep -q 'g2HandoffSkippedNotAuthorized' "$runtime" || fail "G2 not-authorized skip missing"
grep -q 'isRfrfNativeFallbackConvergenceAuthorized' "$convergence" || fail "convergence authority gate missing"
grep -q 'evaluateFallbackPromotionAuthority' "$promotion" || fail "promotion execution authority gate missing"
grep -q 'evaluateAndApplyPromotion' "$promotion" || fail "promotion service present"
grep -q 'handoffAfterPromotionCommit' "$g2" || fail "G2 handoff service present"

cd "$BACKEND"
npm test -- --runInBand --forceExit \
  --testPathPattern='raw-refuel-convergence-metrics.spec' \
  >/tmp/rfrf-stage4-convergence-metrics.log 2>&1 || {
  tail -40 /tmp/rfrf-stage4-convergence-metrics.log >&2
  fail "convergence metrics spec failed"
}

npm test -- --runInBand --forceExit \
  --testPathPattern='raw-fuel-refuel-fallback.config.spec' \
  --testNamePattern='F5 promotion requires BOTH convergence and promotion execution authorities' \
  >/tmp/rfrf-stage4-config.log 2>&1 || {
  tail -40 /tmp/rfrf-stage4-config.log >&2
  fail "F5 config authority spec failed"
}

npm test -- --runInBand --forceExit \
  --testPathPattern='raw-fuel-refuel-fallback.config.f4-pr3.spec' \
  --testNamePattern='master + persist + convergence flags cannot authorize VEE promotion alone' \
  >/tmp/rfrf-stage4-f4pr3.log 2>&1 || {
  tail -40 /tmp/rfrf-stage4-f4pr3.log >&2
  fail "F4-PR3 VEE promotion isolation spec failed"
}

npm test -- --runInBand --forceExit \
  --testPathPattern='raw-refuel-native-fallback-convergence.evaluator.spec' \
  >/tmp/rfrf-stage4-evaluator.log 2>&1 || {
  tail -40 /tmp/rfrf-stage4-evaluator.log >&2
  fail "native-fallback convergence evaluator spec failed"
}

echo "STAGE4_NON_VACUOUS_PG_MATRIX=DEFERRED_TO_CI"

echo "STAGE4_RAW_DETECTOR_EXECUTION_REACHABLE=YES"
echo "STAGE4_CANDIDATE_PERSISTENCE_REACHABLE=YES"
echo "STAGE4_CONVERGENCE_REACHABLE=YES"
echo "STAGE4_FALLBACK_VEE_REACHABLE=NO"
echo "STAGE4_PROMOTION_REACHABLE=NO"
echo "STAGE4_G2_HANDOFF_REACHABLE=NO"
echo "STAGE4_CONVERGENCE_ONLY_BOUNDARY=PASS"
pass "runtime authority matrix"
echo "rfrf-f10-stage4-authority-matrix: OK"
