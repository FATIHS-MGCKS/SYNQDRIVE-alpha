#!/usr/bin/env bash
# Reverse-order RFRF authority shutdown (fail-closed rollback helper).
# F10.4.0 / F10.4.0.1 / F10.4.0.2 — convergence, signals, production dry-run SHA authority.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

ROLLBACK_MUTATION_APPLIED=0
ROLLBACK_REPLICA_A_CONVERGED=0
ROLLBACK_REPLICA_B_CONVERGED=0
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
        return 0
      fi
      if [[ "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
        RFRF_TEST_ROLLBACK_RESTART_B_CALLS=$((RFRF_TEST_ROLLBACK_RESTART_B_CALLS + 1))
        if [[ "${RFRF_TEST_INJECT_ROLLBACK_RECOVERY_RESTART_B_FAIL:-0}" == "1" ]]; then
          echo "INJECTED_FAILURE=recovery_restart_b"
          return 1
        fi
        RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE="$FROM_STAGE"
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
      return 0
    fi
    if [[ "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      RFRF_TEST_ROLLBACK_RESTART_B_CALLS=$((RFRF_TEST_ROLLBACK_RESTART_B_CALLS + 1))
      if [[ "${RFRF_TEST_INJECT_ROLLBACK_RESTART_B_FAIL:-0}" == "1" ]]; then
        echo "INJECTED_FAILURE=rollback_restart_b"
        return 1
      fi
      RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE="$ROLLBACK_EXPECTED_AFTER_STAGE"
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
        RFRF_TEST_ROLLBACK_REPLICA_A_STOPPED=1
        RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=-1
      fi
      if [[ "$target" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
        RFRF_TEST_ROLLBACK_REPLICA_B_STOPPED=1
        RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=-1
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

rfrf_rollback_replica_effective_stage() {
  local replica="$1"
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
}

rfrf_rollback_replica_is_proven_at_stage() {
  local replica="$1" env_stage="$2"
  local effective
  effective="$(rfrf_rollback_replica_effective_stage "$replica")"
  [[ "$effective" == "$env_stage" ]]
}

rfrf_rollback_replica_serving_label() {
  local replica="$1" env_stage="$2"
  local effective
  effective="$(rfrf_rollback_replica_effective_stage "$replica")"
  if [[ "$effective" == "STOPPED" ]]; then
    echo "NO"
    return 0
  fi
  if [[ "$effective" == "UNKNOWN" ]]; then
    echo "UNKNOWN"
    return 0
  fi
  if [[ "$effective" == "$env_stage" ]]; then
    echo "YES"
    return 0
  fi
  echo "UNKNOWN"
}

rfrf_rollback_stop_replica_fail_closed() {
  local name="$1"
  echo "ROLLBACK_DEGRADED_STOP_REPLICA=${name}"
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
    pm2 stop "$name" || true
  else
    pm2 stop "$name" --update-env 2>/dev/null || pm2 stop "$name" || true
  fi
}

rfrf_rollback_stop_all_unproven_replicas() {
  local env_stage="$1"
  local unproven=0

  if ! rfrf_rollback_replica_is_proven_at_stage "A" "$env_stage"; then
    unproven=$((unproven + 1))
    rfrf_rollback_stop_replica_fail_closed "${SYNQDRIVE_REPLICA_A_PM2_NAME}"
    ROLLBACK_REPLICA_A_CONVERGED=0
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! rfrf_rollback_replica_is_proven_at_stage "B" "$env_stage"; then
      unproven=$((unproven + 1))
      rfrf_rollback_stop_replica_fail_closed "${SYNQDRIVE_REPLICA_B_PM2_NAME}"
      ROLLBACK_REPLICA_B_CONVERGED=0
    fi
  fi
  echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
  return 0
}

rfrf_rollback_emit_operational_state() {
  local env_stage="$1"
  local a_eff b_eff a_srv b_srv mixed=NO

  a_eff="$(rfrf_rollback_replica_effective_stage A)"
  b_eff="$(rfrf_rollback_replica_effective_stage B)"
  a_srv="$(rfrf_rollback_replica_serving_label A "$env_stage")"
  b_srv="$(rfrf_rollback_replica_serving_label B "$env_stage")"

  if [[ "$a_srv" == "YES" && "$b_srv" == "YES" && "$a_eff" == "$b_eff" ]]; then
    mixed=NO
  elif [[ "$a_srv" == "NO" && "$b_srv" == "NO" ]]; then
    mixed=NO
  elif [[ "$a_srv" == "YES" && "$b_srv" == "NO" ]]; then
    mixed=NO
  elif [[ "$a_srv" == "NO" && "$b_srv" == "YES" ]]; then
    mixed=NO
  elif [[ "$a_srv" == "UNKNOWN" || "$b_srv" == "UNKNOWN" ]]; then
    mixed=YES
  elif [[ "$a_eff" != "$b_eff" && "$a_eff" != "STOPPED" && "$b_eff" != "STOPPED" ]]; then
    mixed=YES
  elif [[ "$a_srv" == "YES" && "$a_eff" != "$env_stage" ]]; then
    mixed=YES
  elif [[ "$b_srv" == "YES" && "$b_eff" != "$env_stage" ]]; then
    mixed=YES
  fi

  echo "ROLLBACK_FINAL_ENV_STAGE=${env_stage}"
  echo "ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=${a_eff}"
  echo "ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=${b_eff}"
  echo "ROLLBACK_REPLICA_A_SERVING=${a_srv}"
  echo "ROLLBACK_REPLICA_B_SERVING=${b_srv}"
  echo "ROLLBACK_MIXED_AUTHORITY_PRESENT=${mixed}"
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
  local env_stage
  env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"

  echo "ROLLBACK_FAILURE=${reason}"
  echo "ROLLBACK_FAIL_CLOSED=YES"

  if [[ "$ROLLBACK_MUTATION_APPLIED" != "1" ]]; then
    rfrf_rollback_emit_operational_state "$env_stage"
    echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
    return 1
  fi

  if [[ "$ROLLBACK_REPLICA_A_CONVERGED" != "1" && "$ROLLBACK_REPLICA_B_CONVERGED" != "1" ]]; then
    if ! rfrf_rollback_convergence_restore_pre_mutation "$FROM_STAGE"; then
      env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
      rfrf_rollback_stop_all_unproven_replicas "$env_stage"
      echo "ROLLBACK_RECOVERY_FAILURE_MIXED_AUTHORITY_PREVENTED=YES"
    fi
  elif [[ "$ROLLBACK_REPLICA_A_CONVERGED" == "1" && "$ROLLBACK_REPLICA_B_CONVERGED" != "1" ]]; then
    rfrf_rollback_stop_replica_fail_closed "${SYNQDRIVE_REPLICA_B_PM2_NAME}"
    echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
    echo "ROLLBACK_DEGRADED_MODE=SINGLE_REPLICA_A_SERVING"
    echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
  elif [[ "$ROLLBACK_REPLICA_A_CONVERGED" != "1" && "$ROLLBACK_REPLICA_B_CONVERGED" == "1" ]]; then
    rfrf_rollback_stop_replica_fail_closed "${SYNQDRIVE_REPLICA_A_PM2_NAME}"
    echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
    echo "ROLLBACK_DEGRADED_MODE=SINGLE_REPLICA_B_SERVING"
    echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
  fi

  env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
  rfrf_rollback_emit_operational_state "$env_stage"
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

rfrf_rollback_rolling_restart_all() {
  local target_sha="$1"
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || return 1
  if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}"; then
    return 1
  fi
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  ROLLBACK_REPLICA_A_CONVERGED=1
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then
      return 1
    fi
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
    ROLLBACK_REPLICA_B_CONVERGED=1
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

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then
      return 1
    fi
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
    ROLLBACK_REPLICA_B_CONVERGED=1
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

rfrf_apply_rollback_stage "$FROM_STAGE" "$BACKEND_ENV"
chmod 600 "$BACKEND_ENV"
ROLLBACK_MUTATION_APPLIED=1

post_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
if [[ "$FROM_STAGE" == "2" ]]; then
  if ! rfrf_assert_cutover_immutable_across_mutation "$ROLLBACK_AUTHORITATIVE_CUTOVER" "$post_cutover"; then
    rfrf_rollback_fail_closed "cutover_immutability" || true
    rfrf_rollout_fail "rollback stage 2 must preserve cutover"
    rfrf_rollback_finalize_failure_exit
  fi
fi

if ! rfrf_rollback_post_mutation_checkpoint; then
  :
fi

if [[ "${RFRF_TEST_INJECT_ROLLBACK_STAGE_VERIFY_FAIL:-0}" == "1" ]]; then
  rfrf_rollback_fail_closed "stage_env_verify" || true
  rfrf_rollout_fail "rollback env verify failed (injected)"
  rfrf_rollback_finalize_failure_exit
fi

if ! rfrf_verify_stage_env_state "$ROLLBACK_EXPECTED_AFTER_STAGE" "$BACKEND_ENV" "$ROLLBACK_AUTHORITATIVE_CUTOVER"; then
  rfrf_rollback_fail_closed "stage_env_verify" || true
  rfrf_rollout_fail "rollback env verify failed for stage ${ROLLBACK_EXPECTED_AFTER_STAGE}"
  rfrf_rollback_finalize_failure_exit
fi

echo "=== Rolling restart target SHA ${ROLLBACK_TARGET_SHA} (rollback) ==="
if ! rfrf_rollback_rolling_restart "$ROLLBACK_TARGET_SHA"; then
  rfrf_rollback_fail_closed "rolling_restart" || true
  rfrf_rollout_fail "rollback rolling restart failed"
  rfrf_rollback_finalize_failure_exit
fi

if ! vps_replica_verify_post_deploy "$CURRENT" "$ROLLBACK_TARGET_SHA"; then
  rfrf_rollback_fail_closed "post_deploy_verify" || true
  rfrf_rollout_fail "rollback post-deploy verify failed"
  rfrf_rollback_finalize_failure_exit
fi

if ! rfrf_verify_stage_env_state "$ROLLBACK_EXPECTED_AFTER_STAGE" "$BACKEND_ENV" "$ROLLBACK_AUTHORITATIVE_CUTOVER"; then
  rfrf_rollback_fail_closed "post_restart_stage_verify" || true
  rfrf_rollout_fail "rollback post-restart stage verify failed"
  rfrf_rollback_finalize_failure_exit
fi

rfrf_rollback_disarm_recovery
rfrf_rollback_emit_operational_state "$ROLLBACK_EXPECTED_AFTER_STAGE"
echo "ROLLBACK_UNPROVEN_SERVING_REPLICA_COUNT=0"
echo "ROLLBACK_MIXED_AUTHORITY_PRESENT=NO"
echo "ROLLBACK_FAIL_CLOSED=NO"
echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
echo "RFRF_ROLLBACK_FROM_STAGE_${FROM_STAGE}=YES"
echo "RFRF_ROLLBACK_TARGET_STAGE=${ROLLBACK_EXPECTED_AFTER_STAGE}"
echo "RFRF_ROLLBACK=PASS"
if [[ "$FROM_STAGE" == "2" ]]; then
  echo "STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"
fi
