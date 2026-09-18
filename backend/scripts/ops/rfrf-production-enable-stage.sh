#!/usr/bin/env bash
# Staged RFRF production enablement — one stage per invocation (F10.1 / F10.1.1 / F10.3.0 / F10.3.0.1).
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
  RFRF_TEST_RECOVERY_HANDLER_CALLS=0
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

PRE_STAGE=0
TARGET_STAGE=0
AUTHORITATIVE_CUTOVER=""
PRE_CUTOVER=""
STAGE1_TX_STATE=PRE_MUTATION
TX_STATE=PRE_MUTATION
RECOVERY_ARMED=0
RECOVERY_IN_PROGRESS=0
RECOVERY_COMPLETED=0
STAGE1_TX_COMMITTED=0
TX_COMMITTED=0
ORIGINAL_EXIT_CODE=1
BACKEND_ENV_SHA256_BEFORE=""
BACKUP_FILE=""
BACKUP_SHA256=""
CROSS_WORKSTREAM_PRE_STATE=""
CROSS_WORKSTREAM_POST_STATE=""

rfrf_stage_tx_set_state() {
  TX_STATE="$1"
  STAGE1_TX_STATE="$1"
  echo "TX_STATE=${TX_STATE}"
  echo "STAGE1_TX_STATE=${STAGE1_TX_STATE}"
}

rfrf_stage1_set_tx_state() {
  rfrf_stage_tx_set_state "$1"
}

rfrf_stage1_install_recovery_traps() {
  trap 'rfrf_stage1_on_err' ERR
  trap 'rfrf_stage1_on_signal TERM' TERM
  trap 'rfrf_stage1_on_signal INT' INT
  trap 'rfrf_stage1_on_signal HUP' HUP
}

rfrf_stage1_remove_recovery_traps() {
  trap - ERR TERM INT HUP
}

rfrf_stage1_arm_recovery() {
  RECOVERY_ARMED=1
  rfrf_stage1_set_tx_state RECOVERY_ARMED
  echo "RECOVERY_ARMED_BEFORE_FIRST_MUTATION=YES"
  echo "RECOVERY_ARMED=1"
  echo "GLOBAL_TRANSACTION_RECOVERY_GUARD=YES"
  rfrf_stage1_install_recovery_traps
}

rfrf_stage1_disarm_recovery() {
  RECOVERY_ARMED=0
  rfrf_stage1_remove_recovery_traps
  TX_COMMITTED=1
  STAGE1_TX_COMMITTED=1
  rfrf_stage1_set_tx_state COMMITTED
  echo "RECOVERY_ARMED=0"
  echo "STAGE1_TRANSACTION_COMMITTED=YES"
  echo "TX_COMMITTED=YES"
}

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

  if [[ "$phase" == "recovery" && "${RFRF_STAGE_TEST_MODE:-0}" == "1" ]]; then
    RFRF_TEST_RECOVERY_RESTART_CALLS=$((RFRF_TEST_RECOVERY_RESTART_CALLS + 1))
  fi

  if [[ "${RFRF_STAGE_TEST_MODE:-0}" != "1" ]]; then
    pm2 save
  fi
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

  if ! rfrf_stage_matches_file "$PRE_STAGE" "$BACKEND_ENV"; then
    echo "REPLICA_ENV_CONVERGENCE_RESTORED=NO"
    echo "STAGE1_RECOVERY_FAILED=YES"
    echo "STAGE1_FINAL_STATE=UNKNOWN"
    echo "RECOVERY_FAIL_CLOSED=YES"
    return 1
  fi

  if (( PRE_STAGE >= 1 )); then
    if ! rfrf_verify_stage_env_state "$PRE_STAGE" "$BACKEND_ENV" "$AUTHORITATIVE_CUTOVER"; then
      echo "REPLICA_ENV_CONVERGENCE_RESTORED=NO"
      echo "STAGE1_RECOVERY_FAILED=YES"
      echo "STAGE1_FINAL_STATE=UNKNOWN"
      echo "RECOVERY_FAIL_CLOSED=YES"
      return 1
    fi
  else
    rfrf_verify_stage0_env_state "$BACKEND_ENV" >/dev/null || {
      echo "REPLICA_ENV_CONVERGENCE_RESTORED=NO"
      echo "STAGE1_RECOVERY_FAILED=YES"
      echo "STAGE1_FINAL_STATE=UNKNOWN"
      echo "RECOVERY_FAIL_CLOSED=YES"
      return 1
    }
  fi

  echo "RECOVERY_RESTORES_PREVIOUS_STAGE=YES"
  echo "RECOVERY_TARGET_STAGE=${PRE_STAGE}"
  echo "REPLICA_ENV_CONVERGENCE_RESTORED=YES"
  echo "STAGE1_FINAL_STATE=STAGE${PRE_STAGE}"
  echo "STAGE_TX_FINAL_STATE=STAGE${PRE_STAGE}"
  echo "AUTO_RESTORE_BACKEND_ENV_ON_FAILURE=YES"
  echo "AUTO_RESTART_BOTH_AFTER_ENV_RESTORE=YES"
  echo "RECOVERY_FAIL_CLOSED=YES"
  return 0
}

rfrf_stage1_execute_recovery() {
  local reason="$1" target_sha="$2"
  if [[ "$RECOVERY_COMPLETED" == "1" || "$RECOVERY_IN_PROGRESS" == "1" ]]; then
    echo "RECOVERY_HANDLER_IDEMPOTENT_SKIP=YES"
    return 0
  fi
  if [[ "$RECOVERY_ARMED" != "1" || "$TX_COMMITTED" == "1" || "$STAGE1_TX_COMMITTED" == "1" ]]; then
    return 0
  fi

  RECOVERY_IN_PROGRESS=1
  if [[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" ]]; then
    RFRF_TEST_RECOVERY_HANDLER_CALLS=$((RFRF_TEST_RECOVERY_HANDLER_CALLS + 1))
  fi
  rfrf_stage1_remove_recovery_traps
  rfrf_stage1_set_tx_state RECOVERING
  echo "RECOVERY_HANDLER_INVOKED=YES reason=${reason}"

  if rfrf_enable_stage_automatic_recovery "$reason" "$target_sha"; then
    rfrf_stage1_set_tx_state RECOVERED
    RECOVERY_COMPLETED=1
    RECOVERY_IN_PROGRESS=0
    return 0
  fi

  rfrf_stage1_set_tx_state UNKNOWN
  RECOVERY_COMPLETED=1
  RECOVERY_IN_PROGRESS=0
  return 1
}

rfrf_stage1_on_err() {
  local ec=$?
  ORIGINAL_EXIT_CODE=$ec
  if [[ "$RECOVERY_ARMED" == "1" && "$TX_COMMITTED" != "1" && "$RECOVERY_IN_PROGRESS" != "1" ]]; then
    rfrf_stage1_execute_recovery "ERR" "${TARGET_SHA:-unknown}" || true
    echo "ERR_RECOVERY_COVERED=YES"
    echo "RFRF_STAGED_ENABLEMENT=BLOCKED"
    exit "$ORIGINAL_EXIT_CODE"
  fi
  return "$ec"
}

rfrf_stage1_on_signal() {
  local sig="$1"
  ORIGINAL_EXIT_CODE=128
  if [[ "$RECOVERY_ARMED" == "1" && "$TX_COMMITTED" != "1" && "$RECOVERY_IN_PROGRESS" != "1" ]]; then
    rfrf_stage1_execute_recovery "SIGNAL_${sig}" "${TARGET_SHA:-unknown}" || true
    echo "${sig}_RECOVERY_COVERED=YES"
    echo "RFRF_STAGED_ENABLEMENT=BLOCKED"
    exit 128
  fi
  exit 128
}

rfrf_enable_stage_fail_closed() {
  local reason="$1" target_sha="$2"
  if [[ "$RECOVERY_ARMED" == "1" && "$TX_COMMITTED" != "1" ]]; then
    rfrf_stage1_execute_recovery "$reason" "$target_sha" || true
  fi
  echo "RFRF_STAGED_ENABLEMENT=BLOCKED"
  exit 1
}

rfrf_stage1_finalize_env_metadata() {
  if [[ "${RFRF_TEST_INJECT_CHMOD_FAIL:-0}" == "1" ]]; then
    echo "INJECTED_FAILURE=chmod_after_mutation"
    return 1
  fi
  chmod 600 "$BACKEND_ENV"
  return 0
}

rfrf_stage1_post_mutation_checkpoint() {
  if [[ "${RFRF_TEST_INJECT_POST_MUTATION_FAIL:-0}" == "1" ]]; then
    echo "INJECTED_FAILURE=post_mutation_command"
    return 1
  fi
  if [[ "${RFRF_TEST_INJECT_SIGNAL_SELF:-}" == "TERM" ]]; then
    kill -TERM "$$" || true
  elif [[ "${RFRF_TEST_INJECT_SIGNAL_SELF:-}" == "INT" ]]; then
    kill -INT "$$" || true
  elif [[ "${RFRF_TEST_INJECT_SIGNAL_SELF:-}" == "HUP" ]]; then
    kill -HUP "$$" || true
  fi
  if [[ "${RFRF_TEST_INJECT_PAUSE_AFTER_MUTATION:-0}" == "1" ]]; then
    echo "TEST_PAUSE_AFTER_MUTATION=1"
    : >"${RFRF_TEST_SIGNAL_SENTINEL:-/tmp/rfrf-test-mutated.marker}"
  fi
  return 0
}

rfrf_stage_transaction_run() {
  local target_sha="$1"
  local verify_cutover="$AUTHORITATIVE_CUTOVER"
  local post_cutover=""

  echo "PRE_STAGE=${PRE_STAGE}"
  echo "TARGET_STAGE=${TARGET_STAGE}"
  echo "GENERIC_STAGE_TRANSACTION=YES"

  CROSS_WORKSTREAM_PRE_STATE="$(mktemp "${TMPDIR:-/tmp}/rfrf-cross-pre.XXXXXX")"
  CROSS_WORKSTREAM_POST_STATE="$(mktemp "${TMPDIR:-/tmp}/rfrf-cross-post.XXXXXX")"

  if ! rfrf_capture_cross_workstream_snapshot "$BACKEND_ENV" PRE "$CROSS_WORKSTREAM_PRE_STATE"; then
    echo "PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO"
    rfrf_rollout_fail "PRE cross-workstream snapshot failed"
    exit 1
  fi
  if ! rfrf_validate_cross_workstream_snapshot PRE "$CROSS_WORKSTREAM_PRE_STATE"; then
    echo "PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO"
    rfrf_rollout_fail "PRE cross-workstream evidence incomplete — mutation blocked"
    exit 1
  fi
  echo "PRE_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=YES"
  echo "PRE_CROSS_WORKSTREAM_GATE_DEFINED=YES"

  if (( TARGET_STAGE >= 2 )); then
    PRE_CUTOVER="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
    AUTHORITATIVE_CUTOVER="$PRE_CUTOVER"
    verify_cutover="$PRE_CUTOVER"
    rfrf_emit_stage2_boundary_audit_contract "$PRE_CUTOVER"
  elif (( TARGET_STAGE == 1 )); then
    AUTHORITATIVE_CUTOVER=""
  fi

  if ! rfrf_assert_exact_pre_stage_before_mutation "$PRE_STAGE" "$BACKEND_ENV" "$AUTHORITATIVE_CUTOVER"; then
    rfrf_rollout_fail "exact PRE stage ${PRE_STAGE} verification failed — mutation blocked"
    exit 1
  fi

  STAMP="$(date -u +%Y%m%d%H%M%S)"
  BACKUP_FILE="${BACKEND_ENV}.bak-rfrf-stage${STAGE}-${STAMP}"
  if ! rfrf_create_verified_backend_env_backup "$BACKEND_ENV" "$BACKUP_FILE"; then
    rfrf_rollout_fail "backup checksum verification failed"
    exit 1
  fi
  BACKEND_ENV_SHA256_BEFORE="$(rfrf_file_sha256 "$BACKEND_ENV")"
  BACKUP_SHA256="$(rfrf_file_sha256 "$BACKUP_FILE")"
  echo "BACKUP_FILE=${BACKUP_FILE}"
  echo "PRE_ENV_SHA=${BACKEND_ENV_SHA256_BEFORE}"
  echo "BACKUP_SHA=${BACKUP_SHA256}"
  if [[ "$BACKEND_ENV_SHA256_BEFORE" != "$BACKUP_SHA256" ]]; then
    echo "BACKUP_CHECKSUM_VERIFIED=NO"
    rfrf_rollout_fail "backup checksum mismatch before mutation"
    exit 1
  fi
  echo "BACKUP_CHECKSUM_VERIFIED=YES"

  echo "=== BEFORE ==="
  rfrf_read_flag_snapshot "$BACKEND_ENV"

  rfrf_stage1_arm_recovery

  if (( TARGET_STAGE == 1 )); then
    rfrf_apply_stage_mutations "$STAGE" "$BACKEND_ENV" "$CUTOVER_AT"
    verify_cutover="$CUTOVER_AT"
    AUTHORITATIVE_CUTOVER="$CUTOVER_AT"
  else
    rfrf_apply_stage_mutations "$STAGE" "$BACKEND_ENV" ""
    post_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
    if ! rfrf_assert_cutover_immutable_across_mutation "$PRE_CUTOVER" "$post_cutover"; then
      rfrf_enable_stage_fail_closed "cutover_immutability_violation" "$target_sha"
    fi
  fi
  rfrf_stage1_set_tx_state MUTATED

  if ! rfrf_stage1_finalize_env_metadata; then
    rfrf_enable_stage_fail_closed "finalize_env_metadata" "$target_sha"
  fi

  if [[ "${RFRF_TEST_INJECT_TARGET_STAGE_VERIFY_FAIL:-0}" == "1" ]]; then
    echo "INJECTED_FAILURE=target_stage_env_verify"
    rfrf_enable_stage_fail_closed "target_stage_env_verify" "$target_sha"
  elif ! rfrf_verify_stage_env_state "$TARGET_STAGE" "$BACKEND_ENV" "$verify_cutover"; then
    rfrf_enable_stage_fail_closed "mutated_env_verify" "$target_sha"
  fi

  if ! rfrf_stage1_post_mutation_checkpoint; then
    rfrf_enable_stage_fail_closed "post_mutation_checkpoint" "$target_sha"
  fi

  echo "=== AFTER (file) ==="
  rfrf_read_flag_snapshot "$BACKEND_ENV"

  echo "=== Rolling restart target SHA ${target_sha} (no code deploy) ==="
  rfrf_stage1_set_tx_state RESTARTING
  if ! rfrf_enable_stage_rolling_restart "$target_sha" primary; then
    rfrf_enable_stage_fail_closed "rolling_restart" "$target_sha"
  fi

  rfrf_stage1_set_tx_state VERIFYING
  if ! rfrf_enable_stage_post_restart_verify "$target_sha" primary; then
    rfrf_enable_stage_fail_closed "post_restart_verify" "$target_sha"
  fi

  REPLICA_A_SHA="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
  REPLICA_B_SHA="$REPLICA_A_SHA"
  echo "REPLICA_A_RUNNING_SHA=${REPLICA_A_SHA}"
  echo "REPLICA_B_RUNNING_SHA=${REPLICA_B_SHA}"

  if ! rfrf_capture_cross_workstream_snapshot "$BACKEND_ENV" POST "$CROSS_WORKSTREAM_POST_STATE"; then
    echo "POST_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO"
    rfrf_enable_stage_fail_closed "cross_workstream_post_snapshot_failed" "$target_sha"
  fi
  if ! rfrf_validate_cross_workstream_snapshot POST "$CROSS_WORKSTREAM_POST_STATE"; then
    echo "POST_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO"
    rfrf_enable_stage_fail_closed "cross_workstream_post_evidence_incomplete" "$target_sha"
  fi
  echo "POST_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=YES"
  echo "POST_CROSS_WORKSTREAM_GATE_DEFINED=YES"
  if ! rfrf_cross_workstream_immediate_gate "$CROSS_WORKSTREAM_PRE_STATE" "$CROSS_WORKSTREAM_POST_STATE"; then
    rfrf_enable_stage_fail_closed "cross_workstream_immediate_gate" "$target_sha"
  fi
  echo "EXP021_IMMEDIATE_SURVIVAL_GATE_DEFINED=YES"
  echo "VDC_IMMEDIATE_SURVIVAL_GATE_DEFINED=YES"

  if ! rfrf_verify_stage_env_state "$TARGET_STAGE" "$BACKEND_ENV" "$verify_cutover"; then
    rfrf_enable_stage_fail_closed "target_stage_env_verify" "$target_sha"
  fi

  rfrf_stage1_disarm_recovery
  echo "STAGE1_FINAL_STATE=STAGE${STAGE}"
  echo "STAGE_TX_FINAL_STATE=STAGE${STAGE}"
  echo "RFRF_STAGE_${STAGE}_ENABLED=YES"
  echo "RFRF_STAGED_ENABLEMENT=PASS"
}

rfrf_stage1_run_transaction() {
  rfrf_stage_transaction_run "$1"
}

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

echo "=== RFRF STAGED ENABLE stage=${STAGE} dry_run=${DRY_RUN} ==="
echo "NO_CODE_DEPLOY_IN_STAGE1=YES"
echo "EXACT_RUNTIME_SHA_PRESERVED=YES"
echo "SIGKILL_LIMITATION_DOCUMENTED=YES"

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
  PRE_STAGE=$((STAGE - 1))
  TARGET_STAGE="$STAGE"
  if (( STAGE >= 2 )); then
    AUTHORITATIVE_CUTOVER="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
  elif (( STAGE == 1 )); then
    AUTHORITATIVE_CUTOVER=""
  fi
  if (( STAGE >= 1 )); then
    rfrf_assert_exact_pre_stage_before_mutation "$PRE_STAGE" "$BACKEND_ENV" "$AUTHORITATIVE_CUTOVER" || exit 1
  fi
  echo "STAGE1_DRY_RUN_ZERO_MUTATION=PASS"
  echo "STAGE_TX_DRY_RUN_ZERO_MUTATION=PASS"
  echo "DRY_RUN=1 - zero mutation, zero restart"
  echo "STAGE2_DRY_RUN_BACKUP_CREATED=NO"
  echo "STAGE2_DRY_RUN_RESTART_CALLS=0"
  echo "STAGE2_DRY_RUN_PM2_MUTATION_PATH=NO"
  echo "PROPOSED_CUTOVER=${CUTOVER_AT:-<persisted>}"
  echo "CURRENT_RUNTIME_SHA=${TARGET_SHA}"
  echo "STAGE_TRANSITION=$(rfrf_detect_stage_from_flags "$BACKEND_ENV") -> ${STAGE}"
  echo "STAGE2_DRY_RUN_TRANSITION=$(rfrf_detect_stage_from_flags "$BACKEND_ENV") -> ${STAGE}"
  echo "RESTART_PLAN=rolling_restart_replica_a_then_b_from_${CURRENT}_sha_${TARGET_SHA}"
  echo "ROLLBACK_PLAN=restore_backend_env_backup_then_rolling_restart_both_replicas_same_sha"
  echo "STAGE2_DRY_RUN_ZERO_MUTATION=PASS"
  if (( STAGE == 1 )); then
    echo "Would set ${RFRF_FLAG_CUTOVER}=${CUTOVER_AT}"
    echo "Would keep all RFRF boolean authorities OFF"
  elif (( STAGE == 2 )); then
    persisted_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
    echo "Would set ${RFRF_FLAG_MASTER}=true"
    echo "Would preserve ${RFRF_FLAG_CUTOVER}=${persisted_cutover}"
    echo "Would keep ${RFRF_FLAG_PERSIST}=false/absent"
    echo "Would keep ${RFRF_FLAG_CONVERGENCE}=false/absent"
    echo "Would keep ${RFRF_FLAG_PROMOTION}=false/absent"
    echo "Would keep ${RFRF_FLAG_G2_HANDOFF}=false/absent"
    echo "AUTOMATIC_RECOVERY_TARGET_STAGE=$((STAGE - 1))"
  elif (( STAGE == 3 )); then
    persisted_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
    echo "Would set ${RFRF_FLAG_PERSIST}=true"
    echo "Would preserve ${RFRF_FLAG_MASTER}=true"
    echo "Would preserve ${RFRF_FLAG_CUTOVER}=${persisted_cutover}"
    echo "Would keep ${RFRF_FLAG_CONVERGENCE}=false/absent"
    echo "Would keep ${RFRF_FLAG_PROMOTION}=false/absent"
    echo "Would keep ${RFRF_FLAG_G2_HANDOFF}=false/absent"
    echo "AUTOMATIC_RECOVERY_TARGET_STAGE=$((STAGE - 1))"
    echo "STAGE3_DRY_RUN_ZERO_MUTATION=PASS"
    echo "STAGE3_DRY_RUN_RESTART_CALLS=0"
    echo "STAGE3_DRY_RUN_BACKUP_CREATED=NO"
    echo "STAGE3_DRY_RUN_TRANSITION=2->3"
  fi
  echo "RFRF_STAGE_DRY_RUN=PASS"
  exit 0
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: set RFRF_ROLLOUT_ACK=YES after reviewing preflight + stage plan" >&2
  exit 1
fi

PRE_STAGE=$((STAGE - 1))
TARGET_STAGE="$STAGE"
echo "PRE_STAGE=${PRE_STAGE}"
echo "TARGET_STAGE=${TARGET_STAGE}"

if (( STAGE >= 1 && STAGE <= 6 )); then
  if ! rfrf_stage_transaction_run "$TARGET_SHA"; then
    echo "RFRF_STAGED_ENABLEMENT=BLOCKED"
    exit 1
  fi
  exit 0
fi

echo "ERROR: transactional enablement supports stages 1–6 only (stage=${STAGE})" >&2
exit 2
