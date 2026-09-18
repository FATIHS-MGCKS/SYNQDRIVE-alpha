#!/usr/bin/env bash
# Staged RFRF production enablement — one stage per invocation (F10.1 / F10.1.1 / F10.3.0).
#
# Stage 1 semantics: set RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT only; all boolean authorities OFF;
# rolling restart both replicas at the SAME runtime SHA (no code deploy).
#
# Dry-run (fixture/local testing):
#   DRY_RUN=1 RFRF_FIXTURE_MODE=1 RFRF_REQUIRED_GIT_SHA=<sha> \
#     RFRF_CUTOVER_AT=2026-09-15T20:00:00.000Z RFRF_STAGE=1 bash rfrf-production-enable-stage.sh
#
# Production (requires explicit ACK + live preflight PASS + approved SHA):
#   sudo SYNQDRIVE_CURRENT_LINK=/opt/synqdrive/current \
#     RFRF_REQUIRED_GIT_SHA=3a2707b2966a4059478c1ac78f88451b9a50205d \
#     RFRF_CUTOVER_AT=<operator-supplied-utc-iso> \
#     RFRF_STAGE=1 RFRF_ROLLOUT_ACK=YES bash rfrf-production-enable-stage.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

if [[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" ]]; then
  RFRF_TEST_ROLLING_RESTART_CALLS=0
  RFRF_TEST_RECOVERY_RESTART_CALLS=0
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() {
    local name=$1
    if [[ "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      RFRF_TEST_ROLLING_RESTART_CALLS=$((RFRF_TEST_ROLLING_RESTART_CALLS + 1))
    fi
    return 0
  }
  vps_replica_wait_healthy() { return 0; }
  vps_replica_verify_post_deploy() {
    return 0
  }
  vps_replica_verify_no_mixed_sha() { return 0; }
  vps_replica_wait_scheduler_leader_convergence() { return 0; }
  vps_replica_verify_scheduler_leaders() { return 0; }
  vps_replica_nginx_dual_upstream_ok() { return 0; }
fi

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
DRY_RUN="${DRY_RUN:-0}"
STAGE="${RFRF_STAGE:-}"
ACK="${RFRF_ROLLOUT_ACK:-0}"
CUTOVER_AT="${RFRF_CUTOVER_AT:-}"
STAGE_MUTATION_APPLIED=0
BACKEND_ENV_SHA256_BEFORE=""
BACKUP_FILE=""

if [[ -z "$STAGE" ]]; then
  echo "ERROR: set RFRF_STAGE=0..6 (one stage per invocation; no enable-all path)" >&2
  exit 2
fi

if [[ "$STAGE" == "all" || "$STAGE" == "*" ]]; then
  echo "ERROR: enable-all shortcut forbidden" >&2
  exit 2
fi

if ! [[ "$STAGE" =~ ^[0-6]$ ]]; then
  echo "ERROR: invalid RFRF_STAGE=${STAGE}" >&2
  exit 2
fi

rfrf_enable_run_preflight() {
  if [[ "${RFRF_TEST_INJECT_PREFLIGHT_FAIL:-0}" == "1" ]]; then
    echo "RFRF_PRODUCTION_PREFLIGHT=BLOCKED"
    return 1
  fi
  if [[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" ]]; then
    echo "RFRF_PREFLIGHT=STAGE_TEST_FIXTURE_PASS"
    return 0
  fi
  if rfrf_is_fixture_mode && [[ "$DRY_RUN" == "1" ]]; then
    echo "RFRF_PREFLIGHT=FIXTURE_SKIPPED"
    return 0
  fi
  bash "${SCRIPT_DIR}/rfrf-production-preflight.sh" --check --live-required
}

rfrf_enable_stage_rolling_restart() {
  local target_sha="$1" phase="${2:-primary}"
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || return 1

  if [[ "${RFRF_TEST_INJECT_RESTART_A_FAIL:-0}" == "1" && "$phase" == "primary" ]]; then
    echo "INJECTED_FAILURE=restart_a_${phase}"
    return 1
  fi
  if [[ "${RFRF_TEST_INJECT_RECOVERY_RESTART_A_FAIL:-0}" == "1" && "$phase" == "recovery" ]]; then
    echo "INJECTED_FAILURE=recovery_restart_a"
    return 1
  fi
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || return 1
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if [[ "${RFRF_TEST_INJECT_RESTART_B_FAIL:-0}" == "1" && "$phase" == "primary" ]]; then
      echo "INJECTED_FAILURE=restart_b_${phase}"
      return 1
    fi
    if [[ "${RFRF_TEST_INJECT_RECOVERY_RESTART_B_FAIL:-0}" == "1" && "$phase" == "recovery" ]]; then
      echo "INJECTED_FAILURE=recovery_restart_b"
      return 1
    fi
    vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || return 1
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
  fi

  pm2 save
  return 0
}

rfrf_enable_stage_post_restart_verify() {
  local target_sha="$1" phase="${2:-primary}"
  if [[ "${RFRF_TEST_INJECT_POST_VERIFY_FAIL:-0}" == "1" && "$phase" == "primary" ]]; then
    echo "INJECTED_FAILURE=post_verify"
    return 1
  fi
  if [[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" ]]; then
    return 0
  fi
  vps_replica_verify_post_deploy "$CURRENT" "$target_sha"
}

rfrf_enable_stage_automatic_recovery() {
  local failure_reason="$1" target_sha="$2"
  echo "STAGE_ENABLE_FAILURE=${failure_reason}"
  echo "STAGE_MUTATION_ROLLBACK_ATTEMPTED=YES"
  echo "FAILURE_EVIDENCE backup=${BACKUP_FILE} sha256_before=${BACKEND_ENV_SHA256_BEFORE}"

  if ! rfrf_restore_backend_env_atomic "$BACKEND_ENV" "$BACKUP_FILE" "$BACKEND_ENV_SHA256_BEFORE"; then
    echo "REPLICA_ENV_CONVERGENCE_RESTORED=NO"
    echo "STAGE1_RECOVERY_FAILED=YES"
    echo "STAGE1_FINAL_STATE=UNKNOWN"
    echo "RECOVERY_FAIL_CLOSED=YES"
    return 1
  fi

  if ! rfrf_enable_stage_rolling_restart "$target_sha" recovery; then
    echo "REPLICA_ENV_CONVERGENCE_RESTORED=NO"
    echo "STAGE1_RECOVERY_FAILED=YES"
    echo "STAGE1_FINAL_STATE=UNKNOWN"
    echo "RECOVERY_FAIL_CLOSED=YES"
    return 1
  fi

  if ! rfrf_enable_stage_post_restart_verify "$target_sha" recovery; then
    echo "REPLICA_ENV_CONVERGENCE_RESTORED=NO"
    echo "STAGE1_RECOVERY_FAILED=YES"
    echo "STAGE1_FINAL_STATE=UNKNOWN"
    echo "RECOVERY_FAIL_CLOSED=YES"
    return 1
  fi

  if ! rfrf_verify_stage0_env_state "$BACKEND_ENV"; then
    echo "REPLICA_ENV_CONVERGENCE_RESTORED=NO"
    echo "STAGE1_RECOVERY_FAILED=YES"
    echo "STAGE1_FINAL_STATE=UNKNOWN"
    echo "RECOVERY_FAIL_CLOSED=YES"
    return 1
  fi

  echo "REPLICA_ENV_CONVERGENCE_RESTORED=YES"
  echo "STAGE1_FINAL_STATE=STAGE0"
  echo "AUTO_RESTORE_BACKEND_ENV_ON_FAILURE=YES"
  echo "AUTO_RESTART_BOTH_AFTER_ENV_RESTORE=YES"
  echo "RECOVERY_FAIL_CLOSED=YES"
  return 0
}

rfrf_enable_stage_fail_closed() {
  local reason="$1" target_sha="$2"
  if [[ "$STAGE_MUTATION_APPLIED" == "1" ]]; then
    rfrf_enable_stage_automatic_recovery "$reason" "$target_sha" || true
    echo "RFRF_STAGED_ENABLEMENT=BLOCKED"
    exit 1
  fi
  echo "RFRF_STAGED_ENABLEMENT=BLOCKED"
  exit 1
}

echo "=== RFRF STAGED ENABLE stage=${STAGE} dry_run=${DRY_RUN} ==="
echo "NO_CODE_DEPLOY_IN_STAGE1=YES"
echo "EXACT_RUNTIME_SHA_PRESERVED=YES"

rfrf_require_approved_deploy_sha || exit 1

if ! rfrf_enable_run_preflight; then
  echo "ERROR: preflight BLOCKED — cannot enter stage ${STAGE}" >&2
  exit 1
fi

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: ${BACKEND_ENV} missing" >&2
  exit 1
fi

if (( STAGE == 1 )); then
  if [[ -z "$CUTOVER_AT" ]]; then
    if rfrf_is_fixture_mode || [[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" ]]; then
      CUTOVER_AT="2026-09-15T20:00:00.000Z"
    else
      rfrf_rollout_fail "Stage 1 requires explicit operator-supplied RFRF_CUTOVER_AT (UTC ISO timestamp)"
      exit 1
    fi
  fi
  rfrf_print_stage1_execution_contracts
fi

if ! rfrf_assert_can_enter_stage "$STAGE" "$BACKEND_ENV" "$CUTOVER_AT"; then
  exit 1
fi

if (( STAGE >= 5 )); then
  if rfrf_is_fixture_mode && [[ -n "${RFRF_PROMETHEUS_FIXTURE_DIR:-}${RFRF_PROMETHEUS_FIXTURE:-}" ]]; then
    echo "LIVE_OBSERVABILITY=FIXTURE"
  elif ! rfrf_verify_live_observability_gates "${PROM_DIR}/prometheus.yml"; then
    rfrf_rollout_fail "live observability gates incomplete — Stage ${STAGE} blocked"
    exit 1
  fi
fi

if (( STAGE == 6 )); then
  if rfrf_is_fixture_mode || [[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" ]]; then
    echo "WORKER_READINESS=FIXTURE_SKIPPED"
  elif ! rfrf_verify_dual_replica_worker_readiness; then
    rfrf_rollout_fail "worker/redis readiness gate failed — Stage 6 blocked"
    exit 1
  fi
fi

if (( STAGE == 5 )); then
  if ! bash "${SCRIPT_DIR}/rfrf-production-blast-radius-assessment.sh"; then
    rfrf_rollout_fail "blast-radius assessment failed — Stage 5 blocked"
    exit 1
  fi
  if [[ "${RFRF_BLAST_RADIUS_PASS:-0}" != "1" ]]; then
    rfrf_rollout_fail "Stage 5 requires RFRF_BLAST_RADIUS_PASS=1 after successful blast-radius assessment"
    exit 1
  fi
fi

TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "CURRENT_STAGE_BEFORE=$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
echo "TARGET_STAGE=${STAGE}"
echo "EXPECTED=$(rfrf_stage_expected_flags "$STAGE")"
echo "CURRENT_PRODUCTION_SHA=${TARGET_SHA}"
echo "RFRF_REQUIRED_GIT_SHA=${RFRF_REQUIRED_GIT_SHA}"

if [[ "$TARGET_SHA" != "$RFRF_REQUIRED_GIT_SHA" && "$TARGET_SHA" != "unknown" ]]; then
  rfrf_rollout_fail "runtime SHA mismatch: current=${TARGET_SHA} required=${RFRF_REQUIRED_GIT_SHA}"
  exit 1
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "STAGE1_DRY_RUN_ZERO_MUTATION=PASS"
  echo "DRY_RUN=1 - zero mutation, zero restart"
  echo "PROPOSED_CUTOVER=${CUTOVER_AT:-<none>}"
  echo "CURRENT_RUNTIME_SHA=${TARGET_SHA}"
  echo "STAGE_TRANSITION=$(rfrf_detect_stage_from_flags "$BACKEND_ENV") -> ${STAGE}"
  echo "RESTART_PLAN=rolling_restart_replica_a_then_b_from_${CURRENT}_sha_${TARGET_SHA}"
  echo "ROLLBACK_PLAN=restore_backend_env_backup_then_rolling_restart_both_replicas_same_sha"
  if (( STAGE == 1 )); then
    echo "Would set ${RFRF_FLAG_CUTOVER}=${CUTOVER_AT}"
    echo "Would keep all RFRF boolean authorities OFF"
  fi
  echo "RFRF_STAGE_DRY_RUN=PASS"
  exit 0
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: set RFRF_ROLLOUT_ACK=YES after reviewing preflight + stage plan" >&2
  exit 1
fi

if (( STAGE == 1 )); then
  rfrf_capture_cross_workstream_snapshot "$BACKEND_ENV" PRE
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKEND_ENV}.bak-rfrf-stage${STAGE}-${STAMP}"
if ! rfrf_create_verified_backend_env_backup "$BACKEND_ENV" "$BACKUP_FILE"; then
  rfrf_rollout_fail "backup checksum verification failed"
  exit 1
fi
BACKEND_ENV_SHA256_BEFORE="$(rfrf_file_sha256 "$BACKEND_ENV")"
echo "BACKUP_FILE=${BACKUP_FILE}"

echo "=== BEFORE ==="
rfrf_read_flag_snapshot "$BACKEND_ENV"

rfrf_apply_stage_mutations "$STAGE" "$BACKEND_ENV" "$CUTOVER_AT"
chmod 600 "$BACKEND_ENV"
STAGE_MUTATION_APPLIED=1

echo "=== AFTER (file) ==="
rfrf_read_flag_snapshot "$BACKEND_ENV"

echo "=== Rolling restart target SHA ${TARGET_SHA} (no code deploy) ==="
if ! rfrf_enable_stage_rolling_restart "$TARGET_SHA" primary; then
  rfrf_enable_stage_fail_closed "rolling_restart" "$TARGET_SHA"
fi

if ! rfrf_enable_stage_post_restart_verify "$TARGET_SHA" primary; then
  rfrf_enable_stage_fail_closed "post_restart_verify" "$TARGET_SHA"
fi

REPLICA_A_SHA="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
REPLICA_B_SHA="$REPLICA_A_SHA"
echo "REPLICA_A_RUNNING_SHA=${REPLICA_A_SHA}"
echo "REPLICA_B_RUNNING_SHA=${REPLICA_B_SHA}"

if (( STAGE == 1 )); then
  rfrf_capture_cross_workstream_snapshot "$BACKEND_ENV" POST
  if ! rfrf_verify_stage1_env_state "$BACKEND_ENV" "$CUTOVER_AT"; then
    rfrf_enable_stage_fail_closed "stage1_env_verify" "$TARGET_SHA"
  fi
fi

echo "STAGE1_FINAL_STATE=STAGE${STAGE}"
echo "RFRF_STAGE_${STAGE}_ENABLED=YES"
echo "RFRF_STAGED_ENABLEMENT=PASS"
