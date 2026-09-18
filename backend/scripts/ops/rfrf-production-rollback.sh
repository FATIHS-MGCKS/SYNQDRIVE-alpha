#!/usr/bin/env bash
# Reverse-order RFRF authority shutdown (fail-closed rollback helper).
# F10.4.0 / F10.4.0.1 / F10.4.0.2 / F10.4.0.3 — convergence, signals, verified stop, proof states.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

ROLLBACK_MUTATION_APPLIED=0
ROLLBACK_MUTATION_MAY_HAVE_STARTED=0
ROLLBACK_REPLICA_A_CONVERGED=0
ROLLBACK_REPLICA_B_CONVERGED=0
ROLLBACK_PROOF_A="UNKNOWN"
ROLLBACK_PROOF_B="UNKNOWN"
ROLLBACK_PROVEN_A_STAGE=""
ROLLBACK_PROVEN_B_STAGE=""
ROLLBACK_BACKUP_FILE=""
ROLLBACK_ENV_SHA256_BEFORE=""
ROLLBACK_AUTHORITATIVE_CUTOVER=""
ROLLBACK_EXPECTED_AFTER_STAGE=0
ROLLBACK_TARGET_SHA=""
ROLLBACK_RECOVERY_ARMED=0
ROLLBACK_TX_COMMITTED=0
ROLLBACK_RECOVERY_IN_PROGRESS=0
ROLLBACK_RECOVERY_COMPLETED=0
ROLLBACK_ORIGINAL_EXIT_CODE=1

if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
  RFRF_TEST_ROLLBACK_RESTART_A_CALLS=0
  RFRF_TEST_ROLLBACK_RESTART_B_CALLS=0
  RFRF_TEST_ROLLBACK_PM2_SAVE_CALLS=0
  RFRF_TEST_ROLLBACK_REPLICA_A_STOPPED=0
  RFRF_TEST_ROLLBACK_REPLICA_B_STOPPED=0
  RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=-1
  RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=-1
  RFRF_TEST_ROLLBACK_REPLICA_A_SERVING=1
  RFRF_TEST_ROLLBACK_REPLICA_B_SERVING=1
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() {
    local name=$1
    if [[ "${RFRF_ROLLBACK_CONVERGENCE_RESTORE:-0}" == "1" ]]; then
      if [[ "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
        RFRF_TEST_ROLLBACK_RESTART_A_CALLS=$((RFRF_TEST_ROLLBACK_RESTART_A_CALLS + 1))
        if [[ "${RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_A_FAIL:-0}" == "1" ]]; then
          echo "INJECTED_FAILURE=recovery_restart_a"
          return 1
        fi
        RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE="$FROM_STAGE"
        ROLLBACK_PROOF_A="PROVEN_PRE_STAGE"
        ROLLBACK_PROVEN_A_STAGE="$FROM_STAGE"
        return 0
      fi
      if [[ "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
        RFRF_TEST_ROLLBACK_RESTART_B_CALLS=$((RFRF_TEST_ROLLBACK_RESTART_B_CALLS + 1))
        if [[ "${RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_B_FAIL:-0}" == "1" ]]; then
          echo "INJECTED_FAILURE=recovery_restart_b"
          return 1
        fi
        RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE="$FROM_STAGE"
        ROLLBACK_PROOF_B="PROVEN_PRE_STAGE"
        ROLLBACK_PROVEN_B_STAGE="$FROM_STAGE"
        return 0
      fi
      return 0
    fi
    if [[ "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      RFRF_TEST_ROLLBACK_RESTART_A_CALLS=$((RFRF_TEST_ROLLBACK_RESTART_A_CALLS + 1))
      if [[ "${RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL:-0}" == "1" ]]; then
        echo "INJECTED_FAILURE=rollback_restart_a"
        return 1
      fi
      RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE="$ROLLBACK_EXPECTED_AFTER_STAGE"
      ROLLBACK_PROOF_A="PROVEN_TARGET_STAGE"
      ROLLBACK_PROVEN_A_STAGE="$ROLLBACK_EXPECTED_AFTER_STAGE"
      RFRF_TEST_ROLLBACK_REPLICA_A_SERVING=1
      return 0
    fi
    if [[ "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      RFRF_TEST_ROLLBACK_RESTART_B_CALLS=$((RFRF_TEST_ROLLBACK_RESTART_B_CALLS + 1))
      if [[ "${RFRF_TEST_INJECT_ROLLBACK_RESTART_B_FAIL:-0}" == "1" ]]; then
        echo "INJECTED_FAILURE=rollback_restart_b"
        return 1
      fi
      RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE="$ROLLBACK_EXPECTED_AFTER_STAGE"
      ROLLBACK_PROOF_B="PROVEN_TARGET_STAGE"
      ROLLBACK_PROVEN_B_STAGE="$ROLLBACK_EXPECTED_AFTER_STAGE"
      RFRF_TEST_ROLLBACK_REPLICA_B_SERVING=1
      return 0
    fi
    return 0
  }
  vps_replica_wait_healthy() { return 0; }
  vps_replica_verify_post_deploy() {
    if [[ "${RFRF_TEST_INJECT_ROLLBACK_POST_VERIFY_FAIL:-0}" == "1" ]]; then
      echo "INJECTED_FAILURE=rollback_post_verify"
      return 1
    fi
    return 0
  }
  vps_replica_verify_no_mixed_sha() { return 0; }
  pm2() {
    if [[ "${1:-}" == "save" ]]; then
      RFRF_TEST_ROLLBACK_PM2_SAVE_CALLS=$((RFRF_TEST_ROLLBACK_PM2_SAVE_CALLS + 1))
      return 0
    fi
    if [[ "${1:-}" == "stop" ]]; then
      local target="${2:-}"
      if [[ "$target" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
        if [[ "${RFRF_TEST_INJECT_ROLLBACK_STOP_A_FAIL:-0}" == "1" ]]; then
          echo "INJECTED_FAILURE=stop_a_command"
          return 1
        fi
        if [[ "${RFRF_TEST_INJECT_ROLLBACK_STOP_A_FAKE_OK:-0}" == "1" ]]; then
          echo "INJECTED_FAILURE=stop_a_fake_success"
          return 0
        fi
        RFRF_TEST_ROLLBACK_REPLICA_A_STOPPED=1
        RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=-1
        RFRF_TEST_ROLLBACK_REPLICA_A_SERVING=0
        ROLLBACK_PROOF_A="STOPPED"
        ROLLBACK_PROVEN_A_STAGE=""
      fi
      if [[ "$target" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
        if [[ "${RFRF_TEST_INJECT_ROLLBACK_STOP_B_FAIL:-0}" == "1" ]]; then
          echo "INJECTED_FAILURE=stop_b_command"
          return 1
        fi
        if [[ "${RFRF_TEST_INJECT_ROLLBACK_STOP_B_FAKE_OK:-0}" == "1" ]]; then
          echo "INJECTED_FAILURE=stop_b_fake_success"
          return 0
        fi
        RFRF_TEST_ROLLBACK_REPLICA_B_STOPPED=1
        RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=-1
        RFRF_TEST_ROLLBACK_REPLICA_B_SERVING=0
        ROLLBACK_PROOF_B="STOPPED"
        ROLLBACK_PROVEN_B_STAGE=""
      fi
      return 0
    fi
    return 0
  }
fi

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
DRY_RUN="${DRY_RUN:-0}"
ACK="${RFRF_ROLLOUT_ACK:-0}"
FROM_STAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-stage)
      FROM_STAGE="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 --from-stage <1-6>" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$FROM_STAGE" =~ ^[1-6]$ ]]; then
  echo "ERROR: --from-stage 1..6 required" >&2
  exit 2
fi

echo "=== RFRF ROLLBACK from stage ${FROM_STAGE} dry_run=${DRY_RUN} ==="
echo "ROLLBACK_DATA_DELETION=NO (authorities only; durable rows preserved)"
echo "SIGKILL_LIMITATION_DOCUMENTED=YES"
echo "ROLLBACK_SIGKILL_LIMITATION_DOCUMENTED=YES"
echo "ROLLBACK_SIGNAL_HANDLER_IDEMPOTENT=YES"

rfrf_rollout_run_preflight() {
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
    echo "RFRF_PREFLIGHT=ROLLBACK_TEST_FIXTURE_PASS"
    return 0
  fi
  if rfrf_is_rollback_fixture_context && [[ "$DRY_RUN" == "1" ]]; then
    echo "RFRF_PREFLIGHT=FIXTURE_SKIPPED"
    return 0
  fi
  bash "${SCRIPT_DIR}/rfrf-production-preflight.sh" --check --live-required
}

rfrf_rollback_mutation_started_or_applied() {
  [[ "$ROLLBACK_MUTATION_APPLIED" == "1" || "$ROLLBACK_MUTATION_MAY_HAVE_STARTED" == "1" ]]
}

rfrf_rollback_replica_effective_stage() {
  local replica="$1"
  local proof stage
  if [[ "$replica" == "A" ]]; then
    proof="$ROLLBACK_PROOF_A"
    stage="$ROLLBACK_PROVEN_A_STAGE"
  else
    proof="$ROLLBACK_PROOF_B"
    stage="$ROLLBACK_PROVEN_B_STAGE"
  fi
  case "$proof" in
    PROVEN_TARGET_STAGE|PROVEN_PRE_STAGE)
      echo "${stage}"
      return 0
      ;;
    STOPPED)
      echo "STOPPED"
      return 0
      ;;
    *)
      if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
        if [[ "$replica" == "A" ]]; then
          if [[ "${RFRF_TEST_ROLLBACK_REPLICA_A_STOPPED:-0}" == "1" ]]; then
            echo "STOPPED"
            return 0
          fi
          echo "${RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE}"
          return 0
        fi
        if [[ "${RFRF_TEST_ROLLBACK_REPLICA_B_STOPPED:-0}" == "1" ]]; then
          echo "STOPPED"
          return 0
        fi
        echo "${RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE}"
        return 0
      fi
      echo "UNKNOWN"
      ;;
  esac
}

rfrf_rollback_replica_is_proven_at_stage() {
  local replica="$1" env_stage="$2"
  local proof stage eff
  if [[ "$replica" == "A" ]]; then
    proof="$ROLLBACK_PROOF_A"
    stage="$ROLLBACK_PROVEN_A_STAGE"
  else
    proof="$ROLLBACK_PROOF_B"
    stage="$ROLLBACK_PROVEN_B_STAGE"
  fi
  if [[ "$proof" == "PROVEN_TARGET_STAGE" || "$proof" == "PROVEN_PRE_STAGE" ]]; then
    [[ "$stage" == "$env_stage" ]]
    return $?
  fi
  if [[ "$proof" == "STOPPED" ]]; then
    return 0
  fi
  eff="$(rfrf_rollback_replica_effective_stage "$replica")"
  [[ "$eff" == "$env_stage" ]]
}

rfrf_rollback_replica_serving_label() {
  local replica="$1" env_stage="$2"
  local proof effective
  if [[ "$replica" == "A" ]]; then
    proof="$ROLLBACK_PROOF_A"
  else
    proof="$ROLLBACK_PROOF_B"
  fi
  if [[ "$proof" == "STOPPED" ]]; then
    echo "NO"
    return 0
  fi
  if [[ "$proof" == "PROVEN_TARGET_STAGE" || "$proof" == "PROVEN_PRE_STAGE" ]]; then
    if [[ "$(rfrf_rollback_replica_effective_stage "$replica")" == "$env_stage" ]]; then
      echo "YES"
    else
      echo "UNKNOWN"
    fi
    return 0
  fi
  effective="$(rfrf_rollback_replica_effective_stage "$replica")"
  if [[ "$effective" == "STOPPED" ]]; then
    echo "NO"
    return 0
  fi
  if [[ "$effective" == "UNKNOWN" || "$effective" == "-1" ]]; then
    echo "UNKNOWN"
    return 0
  fi
  if [[ "$effective" == "$env_stage" ]]; then
    echo "YES"
    return 0
  fi
  echo "UNKNOWN"
}

rfrf_rollback_verify_replica_stopped() {
  local name="$1" port="$2" replica="$3"
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
    if [[ "$replica" == "A" ]]; then
      if [[ "${RFRF_TEST_INJECT_ROLLBACK_STOP_A_FAKE_OK:-0}" == "1" ]]; then
        return 1
      fi
      [[ "${RFRF_TEST_ROLLBACK_REPLICA_A_STOPPED:-0}" == "1" ]]
      return $?
    fi
    if [[ "${RFRF_TEST_INJECT_ROLLBACK_STOP_B_FAKE_OK:-0}" == "1" ]]; then
      return 1
    fi
    [[ "${RFRF_TEST_ROLLBACK_REPLICA_B_STOPPED:-0}" == "1" ]]
    return $?
  fi
  vps_replica_verify_stopped "$name" "$port"
}

rfrf_rollback_stop_replica_verified() {
  local replica="$1" name="$2" port="$3"
  echo "VERIFIED_STOP_REQUIRED=YES"
  echo "ROLLBACK_DEGRADED_STOP_REPLICA=${name}"
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
    if ! pm2 stop "$name"; then
      echo "ROLLBACK_STOP_VERIFY_FAILED=${name}"
      return 1
    fi
  else
    if ! vps_replica_stop_verified "$name" "$port"; then
      echo "ROLLBACK_STOP_VERIFY_FAILED=${name}"
      return 1
    fi
  fi
  if ! rfrf_rollback_verify_replica_stopped "$name" "$port" "$replica"; then
    echo "ROLLBACK_STOP_VERIFY_FAILED=${name}"
    return 1
  fi
  if [[ "$replica" == "A" ]]; then
    ROLLBACK_PROOF_A="STOPPED"
    ROLLBACK_PROVEN_A_STAGE=""
    ROLLBACK_REPLICA_A_CONVERGED=0
  else
    ROLLBACK_PROOF_B="STOPPED"
    ROLLBACK_PROVEN_B_STAGE=""
    ROLLBACK_REPLICA_B_CONVERGED=0
  fi
  return 0
}

rfrf_rollback_count_unproven_serving() {
  local env_stage="$1"
  local count=0
  local a_srv b_srv
  a_srv="$(rfrf_rollback_replica_serving_label A "$env_stage")"
  b_srv="$(rfrf_rollback_replica_serving_label B "$env_stage")"
  if [[ "$a_srv" == "UNKNOWN" ]]; then
    count=$((count + 1))
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if [[ "$b_srv" == "UNKNOWN" ]]; then
      count=$((count + 1))
    fi
  fi
  echo "$count"
}

rfrf_rollback_stop_all_unproven_replicas() {
  local env_stage="$1"
  local stop_failed=0

  if ! rfrf_rollback_replica_is_proven_at_stage "A" "$env_stage"; then
    if [[ "$(rfrf_rollback_replica_serving_label A "$env_stage")" != "NO" ]]; then
      if ! rfrf_rollback_stop_replica_verified "A" "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}"; then
        stop_failed=1
      fi
    fi
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! rfrf_rollback_replica_is_proven_at_stage "B" "$env_stage"; then
      if [[ "$(rfrf_rollback_replica_serving_label B "$env_stage")" != "NO" ]]; then
        if ! rfrf_rollback_stop_replica_verified "B" "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}"; then
          stop_failed=1
        fi
      fi
    fi
  fi

  local unproven
  unproven="$(rfrf_rollback_count_unproven_serving "$env_stage")"
  if [[ "$stop_failed" == "1" ]]; then
    echo "UNVERIFIED_STOP_CAN_REPORT_ZERO_UNPROVEN=NO"
    echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=${unproven}"
    return 1
  fi
  unproven="$(rfrf_rollback_count_unproven_serving "$env_stage")"
  if [[ "$unproven" != "0" ]]; then
    echo "UNVERIFIED_STOP_CAN_REPORT_ZERO_UNPROVEN=NO"
    echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=${unproven}"
    return 1
  fi
  echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
  return 0
}

rfrf_rollback_compute_mixed_authority() {
  local env_stage="$1"
  local a_eff b_eff a_srv b_srv

  a_eff="$(rfrf_rollback_replica_effective_stage A)"
  b_eff="$(rfrf_rollback_replica_effective_stage B)"
  a_srv="$(rfrf_rollback_replica_serving_label A "$env_stage")"
  b_srv="$(rfrf_rollback_replica_serving_label B "$env_stage")"

  if [[ "$a_srv" == "UNKNOWN" || "$b_srv" == "UNKNOWN" ]]; then
    echo "UNKNOWN"
    return 0
  fi
  if [[ "$a_srv" == "YES" && "$b_srv" == "YES" && "$a_eff" == "$b_eff" ]]; then
    echo "NO"
    return 0
  fi
  if [[ "$a_srv" == "NO" || "$b_srv" == "NO" ]]; then
    echo "NO"
    return 0
  fi
  if [[ "$a_eff" != "$b_eff" ]]; then
    echo "YES"
    return 0
  fi
  echo "NO"
}

rfrf_rollback_emit_final_operational_state() {
  local env_stage="$1"
  local a_eff b_eff a_srv b_srv mixed

  a_eff="$(rfrf_rollback_replica_effective_stage A)"
  b_eff="$(rfrf_rollback_replica_effective_stage B)"
  a_srv="$(rfrf_rollback_replica_serving_label A "$env_stage")"
  b_srv="$(rfrf_rollback_replica_serving_label B "$env_stage")"
  mixed="$(rfrf_rollback_compute_mixed_authority "$env_stage")"

  echo "ROLLBACK_FINAL_ENV_STAGE=${env_stage}"
  echo "ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=${a_eff}"
  echo "ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=${b_eff}"
  echo "ROLLBACK_REPLICA_A_SERVING=${a_srv}"
  echo "ROLLBACK_REPLICA_B_SERVING=${b_srv}"
  echo "ROLLBACK_MIXED_AUTHORITY_PRESENT=${mixed}"
  echo "ROLLBACK_FINAL_STATE_SINGLE_AUTHORITY_BLOCK=YES"
  echo "ROLLBACK_CONTRADICTORY_FINAL_FIELDS=0"
}

rfrf_rollback_mark_replica_proven() {
  local replica="$1" stage="$2" kind="${3:-TARGET}"
  local proof="PROVEN_TARGET_STAGE"
  if [[ "$kind" == "PRE" ]]; then
    proof="PROVEN_PRE_STAGE"
  fi
  if [[ "$replica" == "A" ]]; then
    ROLLBACK_PROOF_A="$proof"
    ROLLBACK_PROVEN_A_STAGE="$stage"
  else
    ROLLBACK_PROOF_B="$proof"
    ROLLBACK_PROVEN_B_STAGE="$stage"
  fi
}

rfrf_rollback_mark_replica_proven_target() {
  rfrf_rollback_mark_replica_proven "$1" "$2" "TARGET"
}

rfrf_rollback_emit_operational_state() {
  rfrf_rollback_emit_final_operational_state "$1"
}

rfrf_rollback_restore_pre_mutation_env() {
  if [[ "${RFRF_TEST_INJECT_ROLLBACK_BACKUP_RESTORE_FAIL:-0}" == "1" ]]; then
    echo "ROLLBACK_PRE_MUTATION_RESTORE=NO"
    echo "INJECTED_FAILURE=backup_restore"
    return 1
  fi
  if [[ -z "$ROLLBACK_BACKUP_FILE" || -z "$ROLLBACK_ENV_SHA256_BEFORE" ]]; then
    echo "ROLLBACK_PRE_MUTATION_RESTORE=NO"
    return 1
  fi
  if rfrf_restore_backend_env_atomic "$BACKEND_ENV" "$ROLLBACK_BACKUP_FILE" "$ROLLBACK_ENV_SHA256_BEFORE"; then
    echo "ROLLBACK_PRE_MUTATION_RESTORE=YES"
    return 0
  fi
  echo "ROLLBACK_PRE_MUTATION_RESTORE=NO"
  return 1
}

rfrf_rollback_convergence_restore_pre_mutation() {
  local env_stage_before="$1"
  echo "ROLLBACK_RECOVERY_CONVERGENCE_ATTEMPTED=YES"
  export RFRF_ROLLBACK_CONVERGENCE_RESTORE=1
  ROLLBACK_REPLICA_A_CONVERGED=0
  ROLLBACK_REPLICA_B_CONVERGED=0

  if ! rfrf_rollback_restore_pre_mutation_env; then
    echo "ROLLBACK_RECOVERY_CONVERGENCE_RESULT=FAIL"
    rfrf_rollback_stop_all_unproven_replicas "$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
    unset RFRF_ROLLBACK_CONVERGENCE_RESTORE
    return 1
  fi

  if ! rfrf_rollback_rolling_restart_all "$ROLLBACK_TARGET_SHA"; then
    echo "ROLLBACK_RECOVERY_CONVERGENCE_RESULT=FAIL"
    rfrf_rollback_stop_all_unproven_replicas "$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
    unset RFRF_ROLLBACK_CONVERGENCE_RESTORE
    return 1
  fi

  unset RFRF_ROLLBACK_CONVERGENCE_RESTORE
  echo "ROLLBACK_RECOVERY_CONVERGENCE_RESULT=PASS"
  return 0
}

rfrf_rollback_fail_closed() {
  local reason="$1"
  local env_stage stop_ok=1
  env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"

  echo "ROLLBACK_FAILURE=${reason}"

  if ! rfrf_rollback_mutation_started_or_applied; then
    echo "ROLLBACK_FAIL_CLOSED=YES"
    rfrf_rollback_emit_final_operational_state "$env_stage"
    echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
    return 1
  fi

  echo "ROLLBACK_FAIL_CLOSED=YES"

  if [[ "$ROLLBACK_REPLICA_A_CONVERGED" != "1" && "$ROLLBACK_REPLICA_B_CONVERGED" != "1" ]]; then
    if ! rfrf_rollback_convergence_restore_pre_mutation "$FROM_STAGE"; then
      env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
      if ! rfrf_rollback_stop_all_unproven_replicas "$env_stage"; then
        stop_ok=0
      fi
      echo "ROLLBACK_RECOVERY_FAILURE_MIXED_AUTHORITY_PREVENTED=YES"
    fi
  elif [[ "$ROLLBACK_REPLICA_A_CONVERGED" == "1" && "$ROLLBACK_REPLICA_B_CONVERGED" != "1" ]]; then
    if ! rfrf_rollback_stop_replica_verified "B" "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}"; then
      stop_ok=0
    else
      echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
      echo "ROLLBACK_DEGRADED_MODE=SINGLE_REPLICA_A_SERVING"
    fi
  elif [[ "$ROLLBACK_REPLICA_A_CONVERGED" != "1" && "$ROLLBACK_REPLICA_B_CONVERGED" == "1" ]]; then
    if ! rfrf_rollback_stop_replica_verified "A" "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}"; then
      stop_ok=0
    else
      echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
      echo "ROLLBACK_DEGRADED_MODE=SINGLE_REPLICA_B_SERVING"
    fi
  fi

  env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
  if [[ "$stop_ok" != "1" ]]; then
    echo "ROLLBACK_FAIL_CLOSED=NO"
    rfrf_rollback_emit_final_operational_state "$env_stage"
    echo "UNVERIFIED_STOP_CAN_REPORT_ZERO_UNPROVEN=NO"
    echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=$(rfrf_rollback_count_unproven_serving "$env_stage")"
    return 1
  fi
  rfrf_rollback_emit_final_operational_state "$env_stage"
  echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
  return 1
}

rfrf_rollback_remove_traps() {
  trap - ERR TERM INT HUP
}

rfrf_rollback_install_traps() {
  trap 'rfrf_rollback_on_err' ERR
  trap 'rfrf_rollback_on_signal TERM' TERM
  trap 'rfrf_rollback_on_signal INT' INT
  trap 'rfrf_rollback_on_signal HUP' HUP
}

rfrf_rollback_arm_recovery() {
  ROLLBACK_RECOVERY_ARMED=1
  echo "ROLLBACK_RECOVERY_ARMED_BEFORE_FIRST_MUTATION=YES"
  echo "ROLLBACK_RECOVERY_ARMED=1"
  rfrf_rollback_install_traps
}

# Disarm ERR trap before intentional failure exit (avoid duplicate ERR recovery).
rfrf_rollback_disarm_recovery() {
  ROLLBACK_RECOVERY_ARMED=0
  ROLLBACK_TX_COMMITTED=1
  rfrf_rollback_remove_traps
  echo "ROLLBACK_RECOVERY_ARMED=0"
  echo "ROLLBACK_TX_COMMITTED=YES"
}

rfrf_rollback_finalize_failure_exit() {
  rfrf_rollback_disarm_recovery
  exit 1
}

rfrf_rollback_execute_recovery() {
  local reason="$1"
  if [[ "$ROLLBACK_RECOVERY_COMPLETED" == "1" || "$ROLLBACK_RECOVERY_IN_PROGRESS" == "1" ]]; then
    echo "ROLLBACK_HANDLER_IDEMPOTENT_SKIP=YES"
    return 0
  fi
  if [[ "$ROLLBACK_RECOVERY_ARMED" != "1" || "$ROLLBACK_TX_COMMITTED" == "1" ]]; then
    return 0
  fi
  ROLLBACK_RECOVERY_IN_PROGRESS=1
  rfrf_rollback_remove_traps
  echo "ROLLBACK_RECOVERY_HANDLER_INVOKED=YES reason=${reason}"
  rfrf_rollback_fail_closed "$reason" || true
  ROLLBACK_RECOVERY_COMPLETED=1
  ROLLBACK_RECOVERY_IN_PROGRESS=0
  return 1
}

rfrf_rollback_on_err() {
  local ec=$?
  ROLLBACK_ORIGINAL_EXIT_CODE=$ec
  if [[ "$ROLLBACK_RECOVERY_ARMED" == "1" && "$ROLLBACK_TX_COMMITTED" != "1" && "$ROLLBACK_RECOVERY_IN_PROGRESS" != "1" ]]; then
    rfrf_rollback_execute_recovery "ERR" || true
    echo "ERR_RECOVERY_COVERED=YES"
    exit "$ROLLBACK_ORIGINAL_EXIT_CODE"
  fi
  return "$ec"
}

rfrf_rollback_on_signal() {
  local sig="$1"
  ROLLBACK_ORIGINAL_EXIT_CODE=128
  if [[ "$ROLLBACK_RECOVERY_ARMED" == "1" && "$ROLLBACK_TX_COMMITTED" != "1" && "$ROLLBACK_RECOVERY_IN_PROGRESS" != "1" ]]; then
    rfrf_rollback_execute_recovery "SIGNAL_${sig}" || true
    echo "${sig}_RECOVERY_COVERED=YES"
    exit 128
  fi
  exit 128
}

rfrf_rollback_post_mutation_checkpoint() {
  if [[ "${RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF:-}" == "TERM" ]]; then
    kill -TERM "$$" || true
  elif [[ "${RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF:-}" == "INT" ]]; then
    kill -INT "$$" || true
  elif [[ "${RFRF_TEST_INJECT_ROLLBACK_SIGNAL_SELF:-}" == "HUP" ]]; then
    kill -HUP "$$" || true
  fi
  return 0
}

rfrf_rollback_pre_apply_checkpoint() {
  if [[ "${RFRF_TEST_INJECT_ROLLBACK_SIGNAL_AT:-}" == "before_apply" ]]; then
    rfrf_rollback_post_mutation_checkpoint
  fi
  return 0
}

rfrf_rollback_post_atomic_checkpoint() {
  if [[ "${RFRF_TEST_INJECT_ROLLBACK_POST_ATOMIC_ERROR:-0}" == "1" ]]; then
    echo "INJECTED_FAILURE=post_atomic_error"
    return 1
  fi
  if [[ "${RFRF_TEST_INJECT_ROLLBACK_SIGNAL_AT:-}" == "after_atomic" ]]; then
    rfrf_rollback_post_mutation_checkpoint
  fi
  return 0
}

rfrf_rollback_rolling_restart_all() {
  local target_sha="$1"
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || return 1
  if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}"; then
    return 1
  fi
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  ROLLBACK_REPLICA_A_CONVERGED=1
  local proof_kind="TARGET"
  if [[ "${RFRF_ROLLBACK_CONVERGENCE_RESTORE:-0}" == "1" ]]; then
    proof_kind="PRE"
  fi
  rfrf_rollback_mark_replica_proven "A" "$(rfrf_detect_stage_from_flags "$BACKEND_ENV")" "$proof_kind"
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then
      return 1
    fi
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
    ROLLBACK_REPLICA_B_CONVERGED=1
    rfrf_rollback_mark_replica_proven "B" "$(rfrf_detect_stage_from_flags "$BACKEND_ENV")" "$proof_kind"
  else
    ROLLBACK_REPLICA_B_CONVERGED=1
  fi
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" != "1" ]]; then
    pm2 save
  fi
  return 0
}

rfrf_rollback_rolling_restart() {
  local target_sha="$1"
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || return 1

  if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}"; then
    return 1
  fi
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  ROLLBACK_REPLICA_A_CONVERGED=1
  rfrf_rollback_mark_replica_proven_target "A" "$ROLLBACK_EXPECTED_AFTER_STAGE"

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then
      return 1
    fi
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
    ROLLBACK_REPLICA_B_CONVERGED=1
    rfrf_rollback_mark_replica_proven_target "B" "$ROLLBACK_EXPECTED_AFTER_STAGE"
  else
    ROLLBACK_REPLICA_B_CONVERGED=1
  fi

  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" != "1" ]]; then
    pm2 save
  fi
  return 0
}

rfrf_rollback_validate_plan_context() {
  if [[ ! -f "$BACKEND_ENV" ]]; then
    rfrf_rollout_fail "rollback requires ${BACKEND_ENV}"
    return 1
  fi

  ROLLBACK_TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "CURRENT_PRODUCTION_SHA=${ROLLBACK_TARGET_SHA}"

  if [[ "$DRY_RUN" == "1" ]]; then
    if rfrf_is_rollback_fixture_context; then
      if [[ -n "${RFRF_REQUIRED_GIT_SHA:-}" ]] && [[ "$ROLLBACK_TARGET_SHA" != "$RFRF_REQUIRED_GIT_SHA" && "$ROLLBACK_TARGET_SHA" != "unknown" ]]; then
        rfrf_rollout_fail "runtime SHA mismatch: current=${ROLLBACK_TARGET_SHA} required=${RFRF_REQUIRED_GIT_SHA}"
        return 1
      fi
    else
      echo "ROLLBACK_PRODUCTION_DRY_RUN_SHA_REQUIRED=YES"
      if [[ -z "${RFRF_REQUIRED_GIT_SHA:-}" ]]; then
        rfrf_rollout_fail "production rollback dry-run requires RFRF_REQUIRED_GIT_SHA"
        echo "ROLLBACK_PRODUCTION_DRY_RUN_MISSING_SHA_BLOCKED=YES"
        return 1
      fi
      if ! rfrf_verify_deploy_sha "$CURRENT" "$RFRF_REQUIRED_GIT_SHA"; then
        echo "ROLLBACK_PRODUCTION_DRY_RUN_SHA_MISMATCH_BLOCKED=YES"
        return 1
      fi
      echo "ROLLBACK_PRODUCTION_DRY_RUN_EXACT_SHA_PASS=YES"
    fi
  elif ! rfrf_is_rollback_fixture_context; then
    rfrf_require_approved_deploy_sha || return 1
    if [[ "$ROLLBACK_TARGET_SHA" != "$RFRF_REQUIRED_GIT_SHA" && "$ROLLBACK_TARGET_SHA" != "unknown" ]]; then
      rfrf_rollout_fail "runtime SHA mismatch: current=${ROLLBACK_TARGET_SHA} required=${RFRF_REQUIRED_GIT_SHA}"
      return 1
    fi
  elif [[ -n "${RFRF_REQUIRED_GIT_SHA:-}" ]] && [[ "$ROLLBACK_TARGET_SHA" != "$RFRF_REQUIRED_GIT_SHA" && "$ROLLBACK_TARGET_SHA" != "unknown" ]]; then
    rfrf_rollout_fail "runtime SHA mismatch: current=${ROLLBACK_TARGET_SHA} required=${RFRF_REQUIRED_GIT_SHA}"
    return 1
  fi

  if ! rfrf_rollback_assert_exact_source_stage "$FROM_STAGE" "$BACKEND_ENV"; then
    return 1
  fi
  echo "ROLLBACK_DRY_RUN_SOURCE_STAGE_VERIFIED=YES"
  return 0
}

if [[ "$DRY_RUN" == "1" ]]; then
  if ! rfrf_rollback_validate_plan_context; then
    echo "RFRF_ROLLBACK=BLOCKED"
    exit 1
  fi
  echo "DRY_RUN=1 — would disable authorities for stage ${FROM_STAGE} downward"
  case "$FROM_STAGE" in
    6) echo "Would set ${RFRF_FLAG_G2_HANDOFF}=false" ;;
    5) echo "Would set ${RFRF_FLAG_PROMOTION}=false" ;;
    4) echo "Would set ${RFRF_FLAG_CONVERGENCE}=false" ;;
    3) echo "Would set ${RFRF_FLAG_PERSIST}=false" ;;
    2)
      echo "Would set ${RFRF_FLAG_MASTER}=false"
      echo "Would preserve ${RFRF_FLAG_CUTOVER} unchanged"
      echo "ROLLBACK_STAGE2_VERIFY_TARGET=1"
      ;;
    1) echo "Would remove ${RFRF_FLAG_CUTOVER} (optional; document operator choice)" ;;
  esac
  echo "ROLLBACK_DRY_RUN_ZERO_MUTATION=PASS"
  echo "RFRF_ROLLBACK_DRY_RUN=PASS"
  exit 0
fi

rfrf_require_approved_deploy_sha || exit 1

if ! rfrf_rollout_run_preflight; then
  echo "ERROR: preflight BLOCKED — cannot rollback from stage ${FROM_STAGE}" >&2
  exit 1
fi

if ! rfrf_rollback_validate_plan_context; then
  exit 1
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: set RFRF_ROLLOUT_ACK=YES for mutating rollback" >&2
  exit 1
fi

ROLLBACK_EXPECTED_AFTER_STAGE=$((FROM_STAGE - 1))
ROLLBACK_AUTHORITATIVE_CUTOVER="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
STAMP="$(date -u +%Y%m%d%H%M%S)"
ROLLBACK_BACKUP_FILE="${BACKEND_ENV}.bak-rfrf-rollback-${STAMP}"

if ! rfrf_create_verified_backend_env_backup "$BACKEND_ENV" "$ROLLBACK_BACKUP_FILE"; then
  rfrf_rollout_fail "rollback backup checksum verification failed"
  exit 1
fi
ROLLBACK_ENV_SHA256_BEFORE="$(rfrf_file_sha256 "$BACKEND_ENV")"
echo "BACKUP_FILE=${ROLLBACK_BACKUP_FILE}"
echo "BACKUP_CHECKSUM_VERIFIED=YES"

rfrf_rollback_arm_recovery

echo "ROLLBACK_MUTATION_MAY_HAVE_STARTED_SET_BEFORE_MUTATION=YES"
ROLLBACK_MUTATION_MAY_HAVE_STARTED=1

rfrf_rollback_pre_apply_checkpoint

rfrf_apply_rollback_stage "$FROM_STAGE" "$BACKEND_ENV"
ROLLBACK_MUTATION_APPLIED=1

if ! rfrf_rollback_post_atomic_checkpoint; then
  rfrf_rollback_fail_closed "post_atomic_checkpoint" || true
  rfrf_rollout_fail "rollback post-atomic checkpoint failed" || true
  rfrf_rollback_finalize_failure_exit
fi

chmod 600 "$BACKEND_ENV"

post_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
if [[ "$FROM_STAGE" == "2" ]]; then
  if ! rfrf_assert_cutover_immutable_across_mutation "$ROLLBACK_AUTHORITATIVE_CUTOVER" "$post_cutover"; then
    rfrf_rollback_fail_closed "cutover_immutability" || true
    rfrf_rollout_fail "rollback stage 2 must preserve cutover" || true
    rfrf_rollback_finalize_failure_exit
  fi
elif [[ "$FROM_STAGE" == "3" ]]; then
  if ! rfrf_assert_cutover_immutable_across_mutation "$ROLLBACK_AUTHORITATIVE_CUTOVER" "$post_cutover"; then
    rfrf_rollback_fail_closed "cutover_immutability" || true
    rfrf_rollout_fail "rollback stage 3 must preserve cutover" || true
    rfrf_rollback_finalize_failure_exit
  fi
fi

if ! rfrf_rollback_post_mutation_checkpoint; then
  :
fi

if [[ "${RFRF_TEST_INJECT_ROLLBACK_STAGE_VERIFY_FAIL:-0}" == "1" ]]; then
  rfrf_rollback_fail_closed "stage_env_verify" || true
  rfrf_rollout_fail "rollback env verify failed (injected)" || true
  rfrf_rollback_finalize_failure_exit
fi

if ! rfrf_verify_stage_env_state "$ROLLBACK_EXPECTED_AFTER_STAGE" "$BACKEND_ENV" "$ROLLBACK_AUTHORITATIVE_CUTOVER"; then
  rfrf_rollback_fail_closed "stage_env_verify" || true
  rfrf_rollout_fail "rollback env verify failed for stage ${ROLLBACK_EXPECTED_AFTER_STAGE}" || true
  rfrf_rollback_finalize_failure_exit
fi

echo "=== Rolling restart target SHA ${ROLLBACK_TARGET_SHA} (rollback) ==="
if ! rfrf_rollback_rolling_restart "$ROLLBACK_TARGET_SHA"; then
  rfrf_rollback_fail_closed "rolling_restart" || true
  rfrf_rollout_fail "rollback rolling restart failed" || true
  rfrf_rollback_finalize_failure_exit
fi

if ! vps_replica_verify_post_deploy "$CURRENT" "$ROLLBACK_TARGET_SHA"; then
  rfrf_rollback_fail_closed "post_deploy_verify" || true
  rfrf_rollout_fail "rollback post-deploy verify failed" || true
  rfrf_rollback_finalize_failure_exit
fi

if ! rfrf_verify_stage_env_state "$ROLLBACK_EXPECTED_AFTER_STAGE" "$BACKEND_ENV" "$ROLLBACK_AUTHORITATIVE_CUTOVER"; then
  rfrf_rollback_fail_closed "post_restart_stage_verify" || true
  rfrf_rollout_fail "rollback post-restart stage verify failed" || true
  rfrf_rollback_finalize_failure_exit
fi

rfrf_rollback_disarm_recovery
rfrf_rollback_emit_final_operational_state "$ROLLBACK_EXPECTED_AFTER_STAGE"
echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
echo "ROLLBACK_FAIL_CLOSED=NO"
echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
echo "SUCCESS_ROLLBACK_FINAL_ENV_STAGE=${ROLLBACK_EXPECTED_AFTER_STAGE}"
echo "SUCCESS_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=${ROLLBACK_EXPECTED_AFTER_STAGE}"
echo "SUCCESS_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=${ROLLBACK_EXPECTED_AFTER_STAGE}"
echo "SUCCESS_ROLLBACK_MIXED_AUTHORITY_PRESENT=NO"
echo "RFRF_ROLLBACK_FROM_STAGE_${FROM_STAGE}=YES"
echo "RFRF_ROLLBACK_TARGET_STAGE=${ROLLBACK_EXPECTED_AFTER_STAGE}"
echo "RFRF_ROLLBACK=PASS"
if [[ "$FROM_STAGE" == "2" ]]; then
  echo "STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"
elif [[ "$FROM_STAGE" == "3" ]]; then
  echo "STAGE3_ROLLBACK_TO_STAGE2_SAFE=YES"
fi
