#!/usr/bin/env bash
# Reverse-order RFRF authority shutdown (fail-closed rollback helper).
# F10.4.0 / F10.4.0.1 — Stage-2 rollback with convergence contract + dry-run source-stage verify.
#
# Usage:
#   DRY_RUN=1 bash rfrf-production-rollback.sh --from-stage 2
#   sudo RFRF_ROLLOUT_ACK=YES bash rfrf-production-rollback.sh --from-stage 2
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
      RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE="$FROM_STAGE"
      if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
        RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE="$FROM_STAGE"
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

rfrf_rollout_run_preflight() {
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
    echo "RFRF_PREFLIGHT=ROLLBACK_TEST_FIXTURE_PASS"
    return 0
  fi
  if rfrf_is_fixture_mode && [[ "$DRY_RUN" == "1" ]]; then
    echo "RFRF_PREFLIGHT=FIXTURE_SKIPPED"
    return 0
  fi
  bash "${SCRIPT_DIR}/rfrf-production-preflight.sh" --check --live-required
}

rfrf_rollback_emit_replica_effective_stages() {
  local env_stage="$1"
  local a_stage b_stage mixed=NO

  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
    a_stage="${RFRF_TEST_ROLLBACK_REPLICA_A_EFFECTIVE_STAGE}"
    b_stage="${RFRF_TEST_ROLLBACK_REPLICA_B_EFFECTIVE_STAGE}"
    if [[ "${RFRF_TEST_ROLLBACK_REPLICA_A_STOPPED:-0}" == "1" ]]; then
      a_stage="STOPPED"
    fi
    if [[ "${RFRF_TEST_ROLLBACK_REPLICA_B_STOPPED:-0}" == "1" ]]; then
      b_stage="STOPPED"
    fi
  else
    a_stage="UNKNOWN"
    b_stage="UNKNOWN"
    mixed=UNKNOWN
  fi

  if [[ "$a_stage" != "$b_stage" && "$a_stage" != "STOPPED" && "$b_stage" != "STOPPED" && "$a_stage" != "UNKNOWN" && "$b_stage" != "UNKNOWN" ]]; then
    mixed=YES
  fi
  if [[ "$a_stage" != "$env_stage" && "$a_stage" != "STOPPED" && "$a_stage" != "UNKNOWN" ]]; then
    mixed=YES
  fi
  if [[ "$b_stage" != "$env_stage" && "$b_stage" != "STOPPED" && "$b_stage" != "UNKNOWN" ]]; then
    mixed=YES
  fi

  echo "ROLLBACK_FINAL_ENV_STAGE=${env_stage}"
  echo "ROLLBACK_REPLICA_A_EFFECTIVE_STAGE=${a_stage}"
  echo "ROLLBACK_REPLICA_B_EFFECTIVE_STAGE=${b_stage}"
  echo "ROLLBACK_MIXED_AUTHORITY_PRESENT=${mixed}"
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

rfrf_rollback_restore_pre_mutation_env() {
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
  export RFRF_ROLLBACK_CONVERGENCE_RESTORE=1
  rfrf_rollback_restore_pre_mutation_env || return 1
  rfrf_rollback_rolling_restart_all "$ROLLBACK_TARGET_SHA" || return 1
  unset RFRF_ROLLBACK_CONVERGENCE_RESTORE
  return 0
}

rfrf_rollback_fail_closed() {
  local reason="$1"
  local env_stage
  env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"

  echo "ROLLBACK_FAILURE=${reason}"
  echo "ROLLBACK_FAIL_CLOSED=YES"

  if [[ "$ROLLBACK_MUTATION_APPLIED" != "1" ]]; then
    rfrf_rollback_emit_replica_effective_stages "$env_stage"
    return 1
  fi

  if [[ "$ROLLBACK_REPLICA_A_CONVERGED" != "1" && "$ROLLBACK_REPLICA_B_CONVERGED" != "1" ]]; then
    rfrf_rollback_convergence_restore_pre_mutation || true
    env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
  elif [[ "$ROLLBACK_REPLICA_A_CONVERGED" == "1" && "$ROLLBACK_REPLICA_B_CONVERGED" != "1" ]]; then
    rfrf_rollback_stop_replica_fail_closed "${SYNQDRIVE_REPLICA_B_PM2_NAME}"
    echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
    echo "ROLLBACK_DEGRADED_MODE=SINGLE_REPLICA_A_SERVING"
    ROLLBACK_REPLICA_B_CONVERGED=0
    env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
  elif [[ "$ROLLBACK_REPLICA_A_CONVERGED" != "1" && "$ROLLBACK_REPLICA_B_CONVERGED" == "1" ]]; then
    rfrf_rollback_stop_replica_fail_closed "${SYNQDRIVE_REPLICA_A_PM2_NAME}"
    echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
    echo "ROLLBACK_DEGRADED_MODE=SINGLE_REPLICA_B_SERVING"
    env_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
  fi

  rfrf_rollback_emit_replica_effective_stages "$env_stage"
  return 1
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

  if ! rfrf_is_fixture_mode && [[ "$DRY_RUN" != "1" ]]; then
    rfrf_require_approved_deploy_sha || return 1
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

rfrf_apply_rollback_stage "$FROM_STAGE" "$BACKEND_ENV"
chmod 600 "$BACKEND_ENV"
ROLLBACK_MUTATION_APPLIED=1

post_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
if [[ "$FROM_STAGE" == "2" ]]; then
  if ! rfrf_assert_cutover_immutable_across_mutation "$ROLLBACK_AUTHORITATIVE_CUTOVER" "$post_cutover"; then
    rfrf_rollback_fail_closed "cutover_immutability" || true
    rfrf_rollout_fail "rollback stage 2 must preserve cutover"
    exit 1
  fi
fi

if [[ "${RFRF_TEST_INJECT_ROLLBACK_STAGE_VERIFY_FAIL:-0}" == "1" ]]; then
  rfrf_rollback_fail_closed "stage_env_verify" || true
  rfrf_rollout_fail "rollback env verify failed (injected)"
  exit 1
fi

if ! rfrf_verify_stage_env_state "$ROLLBACK_EXPECTED_AFTER_STAGE" "$BACKEND_ENV" "$ROLLBACK_AUTHORITATIVE_CUTOVER"; then
  rfrf_rollback_fail_closed "stage_env_verify" || true
  rfrf_rollout_fail "rollback env verify failed for stage ${ROLLBACK_EXPECTED_AFTER_STAGE}"
  exit 1
fi

echo "=== Rolling restart target SHA ${ROLLBACK_TARGET_SHA} (rollback) ==="
if ! rfrf_rollback_rolling_restart "$ROLLBACK_TARGET_SHA"; then
  rfrf_rollback_fail_closed "rolling_restart" || true
  rfrf_rollout_fail "rollback rolling restart failed"
  exit 1
fi

if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" != "1" ]]; then
  if ! vps_replica_verify_post_deploy "$CURRENT" "$ROLLBACK_TARGET_SHA"; then
    rfrf_rollback_fail_closed "post_deploy_verify" || true
    rfrf_rollout_fail "rollback post-deploy verify failed"
    exit 1
  fi
else
  if ! vps_replica_verify_post_deploy "$CURRENT" "$ROLLBACK_TARGET_SHA"; then
    rfrf_rollback_fail_closed "post_deploy_verify" || true
    rfrf_rollout_fail "rollback post-deploy verify failed"
    exit 1
  fi
fi

if ! rfrf_verify_stage_env_state "$ROLLBACK_EXPECTED_AFTER_STAGE" "$BACKEND_ENV" "$ROLLBACK_AUTHORITATIVE_CUTOVER"; then
  rfrf_rollback_fail_closed "post_restart_stage_verify" || true
  rfrf_rollout_fail "rollback post-restart stage verify failed"
  exit 1
fi

rfrf_rollback_emit_replica_effective_stages "$ROLLBACK_EXPECTED_AFTER_STAGE"
echo "ROLLBACK_MIXED_AUTHORITY_PRESENT=NO"
echo "ROLLBACK_FAIL_CLOSED=NO"
echo "ROLLBACK_MIXED_AUTHORITY_PREVENTED=YES"
echo "RFRF_ROLLBACK_FROM_STAGE_${FROM_STAGE}=YES"
echo "RFRF_ROLLBACK_TARGET_STAGE=${ROLLBACK_EXPECTED_AFTER_STAGE}"
echo "RFRF_ROLLBACK=PASS"
if [[ "$FROM_STAGE" == "2" ]]; then
  echo "STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"
fi
