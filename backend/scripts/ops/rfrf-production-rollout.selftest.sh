#!/usr/bin/env bash
# Deterministic selftest for RFRF F10.1 / F10.1.1 operational rollout tooling.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

TMP_ENV="$(mktemp)"
cleanup() { rm -f "$TMP_ENV"; }
trap cleanup EXIT

write_env() {
  cat >"$TMP_ENV" <<EOF
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
EOF
}

# Default OFF flags
write_env
snap="$(rfrf_read_flag_snapshot "$TMP_ENV")"
echo "$snap" | grep -q 'RFRF_FLAG_MASTER=false' || fail "master default"
echo "$snap" | grep -q 'RFRF_FLAG_PERSIST=false' || fail "persist default"
echo "$snap" | grep -q 'RFRF_FLAG_CUTOVER_SET=no' || fail "cutover unset default"

# Stage detection stage 0
[[ "$(rfrf_detect_stage_from_flags "$TMP_ENV")" == "0" ]] || fail "stage 0 detect"

# Stage 0 -> 1 with explicit proposed cutover
if rfrf_assert_can_enter_stage 1 "$TMP_ENV" "2026-09-15T20:00:00.000Z"; then
  :
else
  fail "stage 0->1 with explicit cutover"
fi

# Stage 0 -> 1 missing cutover blocked
if rfrf_assert_can_enter_stage 1 "$TMP_ENV" "" 2>/dev/null; then
  fail "stage 1 missing cutover should block"
fi

# Stage 0 -> 1 malformed cutover blocked
if rfrf_assert_can_enter_stage 1 "$TMP_ENV" "not-a-date" 2>/dev/null; then
  fail "stage 1 malformed cutover should block"
fi

# Stage 1 apply + detect
rfrf_apply_stage_mutations 1 "$TMP_ENV" "2026-09-15T20:00:00.000Z"
[[ "$(rfrf_detect_stage_from_flags "$TMP_ENV")" == "1" ]] || fail "stage 1 detect"

# Stage 1 -> 2
rfrf_assert_can_enter_stage 2 "$TMP_ENV" || fail "stage 1->2 enter"
rfrf_apply_stage_mutations 2 "$TMP_ENV"
rfrf_stage_matches_file 2 "$TMP_ENV" || fail "stage 2 match"

# Stage 0 -> 2 skip blocked (no cutover persisted yet)
write_env
if rfrf_assert_can_enter_stage 2 "$TMP_ENV" 2>/dev/null; then
  fail "stage skip must block"
fi

# Stage 5 blocked without convergence
write_env
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CUTOVER" "2026-09-15T20:00:00.000Z"
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_MASTER" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_PERSIST" true
if rfrf_assert_can_enter_stage 5 "$TMP_ENV" 2>/dev/null; then
  fail "stage 5 without convergence must block"
fi

# Stage 5 after convergence
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CONVERGENCE" true
rfrf_assert_can_enter_stage 5 "$TMP_ENV" || fail "stage 5 with convergence"

# Stage 6 blocked without promotion
if rfrf_assert_can_enter_stage 6 "$TMP_ENV" 2>/dev/null; then
  fail "stage 6 without promotion must block"
fi

# Stage 6 blocked when recovery disabled
write_env
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CUTOVER" "2026-09-15T20:00:00.000Z"
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_MASTER" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_PERSIST" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CONVERGENCE" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_PROMOTION" true
rfrf_remove_env_key "$TMP_ENV" "$RFRF_G2_FLAG_RECOVERY"
rfrf_upsert_env "$TMP_ENV" PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED false
if rfrf_assert_can_enter_stage 6 "$TMP_ENV" 2>/dev/null; then
  fail "stage 6 recovery disabled must block"
fi

# Stage 6 blocked when G2 cutover absent
write_env
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CUTOVER" "2026-09-15T20:00:00.000Z"
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_MASTER" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_PERSIST" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CONVERGENCE" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_PROMOTION" true
rfrf_remove_env_key "$TMP_ENV" "$RFRF_G2_FLAG_CUTOVER"
if rfrf_assert_can_enter_stage 6 "$TMP_ENV" 2>/dev/null; then
  fail "stage 6 g2 cutover absent must block"
fi

# Deploy SHA required outside fixture mode
unset RFRF_REQUIRED_GIT_SHA
unset DRY_RUN
unset RFRF_FIXTURE_MODE
if rfrf_require_approved_deploy_sha 2>/dev/null; then
  fail "missing deploy sha should block production mode"
fi
export RFRF_FIXTURE_MODE=1
export RFRF_REQUIRED_GIT_SHA=fixturesha000000000000000000000000000000000000
rfrf_require_approved_deploy_sha || fail "fixture sha should pass"

# Forbidden test env
write_env
rfrf_upsert_env "$TMP_ENV" RAW_FUEL_REFUEL_F9_INTEGRATION 1
if ! rfrf_forbidden_test_env_present "$TMP_ENV" >/dev/null; then
  fail "forbidden test env should be detected"
fi

# Rollback order does not delete keys except optional cutover
write_env
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_MASTER" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_PERSIST" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CONVERGENCE" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_PROMOTION" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_G2_HANDOFF" true
rfrf_upsert_env "$TMP_ENV" "$RFRF_FLAG_CUTOVER" "2026-09-15T20:00:00.000Z"
rfrf_apply_rollback_stage 6 "$TMP_ENV"
grep -q '^RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED=false' "$TMP_ENV" || fail "rollback stage 6"
grep -q '^RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED=true' "$TMP_ENV" || fail "promotion preserved after g2 rollback"

# Repo alerts subset
repo_alerts="$(rfrf_repo_alerts_file "$(cd "${SCRIPT_DIR}/../../.." && pwd)")"
rfrf_verify_repo_alerts_subset "$repo_alerts" || fail "repo alerts subset"

# Enable-all path forbidden in enable script
grep -q 'enable-all shortcut forbidden' "${SCRIPT_DIR}/rfrf-production-enable-stage.sh" || fail "missing enable-all guard"

# Observability topology from repo prometheus.vps.yml
prom_cfg="$(cd "${SCRIPT_DIR}/../../.." && pwd)/backend/monitoring/prometheus/prometheus.vps.yml"
rfrf_observability_topology_check "$prom_cfg" || fail "repo prom cfg must scrape both replicas"

echo "rfrf-production-rollout.selftest: OK"
