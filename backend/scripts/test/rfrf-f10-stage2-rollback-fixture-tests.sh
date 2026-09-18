#!/usr/bin/env bash
# RFRF F10.4.0 Stage-2 rollback fixture tests (DRY_RUN + test-mode mutating path).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "STAGE2_ROLLBACK_TEST_FAIL: $*" >&2; exit 1; }
pass() { echo "STAGE2_ROLLBACK_TEST_PASS: $*"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

export RFRF_ROLLBACK_TEST_MODE=1
export RFRF_FIXTURE_MODE=1
export RFRF_REQUIRED_GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
export SYNQDRIVE_CURRENT_LINK="$REPO_ROOT"
export BACKEND_ENV="${TMP_DIR}/backend.env"
export DRY_RUN=0
export RFRF_ROLLOUT_ACK=YES
CUTOVER="2026-09-18T10:25:41.000Z"

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

cat >"$BACKEND_ENV" <<EOF
METRICS_BEARER_TOKEN=fixture-token
RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=${CUTOVER}
RAW_FUEL_REFUEL_FALLBACK_ENABLED=true
EOF

current="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
[[ "$current" == "2" ]] || fail "fixture must be stage 2, got ${current}"

out="$(bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1)"
echo "$out" | grep -q 'RFRF_ROLLBACK=PASS' || fail "rollback should pass: ${out}"
echo "$out" | grep -q 'STAGE2_ROLLBACK_PRODUCTION_SAFE=YES' || fail "missing production safe marker"
rfrf_verify_stage_env_state 1 "$BACKEND_ENV" "$CUTOVER" || fail "post-rollback not stage 1"
master="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_MASTER")")"
[[ "$master" == "false" ]] || fail "master should be false after rollback"
pass "stage2 rollback fixture"
echo "STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"

dry="$(DRY_RUN=1 bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1)"
echo "$dry" | grep -q 'RFRF_ROLLBACK_DRY_RUN=PASS' || fail "rollback dry-run failed"
pass "rollback dry-run"
echo "rfrf-f10-stage2-rollback-fixture: OK"
