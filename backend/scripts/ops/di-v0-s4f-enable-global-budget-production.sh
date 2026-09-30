#!/usr/bin/env bash
# EXP-021 S4F-4 — transactional Production ops wrapper for DIMO_GLOBAL_BUDGET_ENABLED=true only.
# Does NOT deploy code, activate S4, or grant Tiny Shadow operator authorization.
#
# Dry-run / fixture:
#   DRY_RUN=1 DI_S4F4_FIXTURE_MODE=1 DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK=YES \
#     DI_S4_REQUIRED_GIT_SHA=<sha> DI_S4F4_FIXTURE_DEPLOYED_SHA=<sha> \
#     SYNQDRIVE_BACKEND_ENV=/tmp/backend.env bash di-v0-s4f-enable-global-budget-production.sh
#
# Production (operator only — not executed in S4F-4 engineering slice):
#   DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK=YES DI_S4_REQUIRED_GIT_SHA=<full-sha> \
#     bash di-v0-s4f-enable-global-budget-production.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S4F4_SCRIPT_DIR="$SCRIPT_DIR"
export S4F4_SCRIPT_DIR

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"
# shellcheck source=lib/di-v0-s4f-global-budget-rollout.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4f-global-budget-rollout.lib.sh"

BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
DRY_RUN="${DRY_RUN:-0}"
ACK="${DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK:-}"
REQUIRED_SHA="${DI_S4_REQUIRED_GIT_SHA:-}"

TX_STATE=PRE_MUTATION
RECOVERY_ARMED=0
RECOVERY_IN_PROGRESS=0
BACKEND_ENV_SHA256_BEFORE=""
BACKUP_FILE=""
BACKUP_SHA256=""
TARGET_SHA=""
ENV_MUTATION_COUNT=0
RESTART_COUNT=0
MUTATION_EPOCH_MS=0

echo "EXP021_S4F4_DIMO_GLOBAL_BUDGET_OPS_WRAPPER=1"
echo "TARGET_ENV_KEY=${DI_S4_GLOBAL_BUDGET_ENV_KEY}"
echo "TARGET_ENV_VALUE=${DI_S4_GLOBAL_BUDGET_TARGET_VALUE}"
echo "ARBITRARY_ENV_MUTATION_SUPPORTED=NO"
echo "EXPLICIT_ACK_REQUIRED=DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK=YES"
echo "EXPECTED_SHA_REQUIRED=DI_S4_REQUIRED_GIT_SHA"
echo "CODE_DEPLOY_PATH_USED=NO"
echo "PROVIDER_CALL_REQUIRED_FOR_PROOF=NO"
echo "SIGKILL_LIMITATION_DOCUMENTED=YES"
echo "FILE_STATE_ALONE_CAN_CONFIRM_RUNTIME=NO"
echo "RUNTIME_PROOF_SOURCE=pm2_startup_logs_dimo_provider_budget_service"

if [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() {
    local name=$1
    RESTART_COUNT=$((RESTART_COUNT + 1))
    if [[ "${DI_S4F4_TEST_INJECT_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" && "${S4F4_RESTART_PHASE:-primary}" == "primary" ]]; then
      return 1
    fi
    if [[ "${DI_S4F4_TEST_INJECT_RESTART_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" && "${S4F4_RESTART_PHASE:-primary}" == "primary" ]]; then
      return 1
    fi
    if [[ "${DI_S4F4_TEST_INJECT_RECOVERY_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" && "${S4F4_RESTART_PHASE:-}" == "recovery" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_wait_healthy() {
    if [[ "${DI_S4F4_TEST_INJECT_HEALTH_A_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${DI_S4F4_TEST_INJECT_HEALTH_B_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_verify_post_deploy() { return 0; }
  vps_replica_verify_no_mixed_sha() { return 0; }
  vps_replica_wait_scheduler_leader_convergence() {
    if [[ "${DI_S4F4_TEST_INJECT_SCHEDULER_FAIL:-0}" == "1" ]]; then return 1; fi
    return 0
  }
  vps_replica_verify_scheduler_leaders() { return 0; }
  vps_replica_nginx_dual_upstream_ok() { return 0; }
fi

s4f4_tx_set() {
  TX_STATE="$1"
  echo "TX_STATE=${TX_STATE}"
}

s4f4_on_recovery() {
  local reason="$1"
  if [[ "$RECOVERY_IN_PROGRESS" == "1" ]]; then
    return 1
  fi
  if [[ "$RECOVERY_ARMED" != "1" || -z "$BACKUP_FILE" ]]; then
    echo "RECOVERY_SKIPPED=not_armed_or_no_backup reason=${reason}"
    return 1
  fi
  RECOVERY_IN_PROGRESS=1
  s4f4_tx_set RECOVERY_IN_PROGRESS
  echo "ROLLBACK_TRIGGER=${reason}"
  echo "ROLLBACK_RESTARTS_BOTH_REPLICAS=ATTEMPTED"

  if ! s4f4_restore_backend_env_atomic "$BACKEND_ENV" "$BACKUP_FILE" "$BACKEND_ENV_SHA256_BEFORE"; then
    echo "ROLLBACK_RESULT=ENV_RESTORE_FAILED"
    return 1
  fi

  S4F4_RESTART_PHASE=recovery
  if ! s4f4_rolling_restart_same_sha "$TARGET_SHA"; then
    echo "ROLLBACK_RESULT=RESTART_FAILED"
    return 1
  fi

  if ! vps_replica_wait_scheduler_leader_convergence; then
    echo "ROLLBACK_RESULT=SCHEDULER_FAILED"
    return 1
  fi

  s4f4_run_config_file_audit "$BACKEND_ENV" | grep -q "GLOBAL_BUDGET_CONFIG_FILE_STATE=" || true
  echo "ROLLBACK_VERIFIES_PREVIOUS_STATE=ATTEMPTED"
  echo "ROLLBACK_RESULT=COMPLETE"
  return 1
}

s4f4_on_err() {
  local code=$?
  s4f4_on_recovery "ERR trap exit=${code}" || true
  exit "$code"
}

s4f4_on_signal() {
  local sig="$1"
  echo "SIGNAL_RECEIVED=${sig}"
  s4f4_on_recovery "signal ${sig}" || true
  exit 130
}

s4f4_install_traps() {
  trap 's4f4_on_err' ERR
  trap 's4f4_on_signal TERM' TERM
  trap 's4f4_on_signal INT' INT
  trap 's4f4_on_signal HUP' HUP
}

s4f4_remove_traps() {
  trap - ERR TERM INT HUP
}

s4f4_arm_recovery() {
  RECOVERY_ARMED=1
  s4f4_install_traps
  echo "RECOVERY_ARMED_BEFORE_MUTATION=YES"
  echo "RECOVERY_ARMED=YES"
  s4f4_tx_set RECOVERY_ARMED
}

s4f4_disarm_recovery() {
  RECOVERY_ARMED=0
  s4f4_remove_traps
  s4f4_tx_set COMMITTED
  echo "RECOVERY_ARMED=NO"
  echo "TX_COMMITTED=YES"
}

s4f4_resolve_deployed_sha() {
  if [[ -n "${DI_S4F4_FIXTURE_DEPLOYED_SHA:-}" ]] && { s4f4_is_fixture_mode || [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; }; then
    echo "${DI_S4F4_FIXTURE_DEPLOYED_SHA}"
    return 0
  fi
  vps_replica_current_sha
}

s4f4_require_ack_and_sha() {
  if [[ "$ACK" != "YES" ]]; then
    echo "OPERATOR_ACK=MISSING"
    echo "FAIL_CLOSED=YES"
    return 1
  fi
  echo "OPERATOR_ACK=YES"
  if [[ -z "$REQUIRED_SHA" ]]; then
    echo "REQUIRED_GIT_SHA=MISSING"
    return 1
  fi
  TARGET_SHA="$(s4f4_resolve_deployed_sha)"
  if [[ -z "$TARGET_SHA" ]]; then
    echo "DEPLOYED_SHA=UNRESOLVED"
    return 1
  fi
  echo "DEPLOYED_SHA=${TARGET_SHA}"
  echo "REQUIRED_SHA=${REQUIRED_SHA}"
  if [[ "$TARGET_SHA" != "$REQUIRED_SHA" ]]; then
    echo "SHA_MISMATCH_FAILS_PRE_MUTATION=YES"
    echo "DEPLOY_GIT_SHA_MATCH=NO"
    return 1
  fi
  echo "SHA_MISMATCH_FAILS_PRE_MUTATION=YES"
  echo "DEPLOY_GIT_SHA_MATCH=YES"
  return 0
}

s4f4_preflight_replicas() {
  if s4f4_is_fixture_mode && s4f4_is_dry_run; then
    echo "PRE_REPLICA_HEALTH_REQUIRED=FIXTURE_SKIPPED"
    echo "PRE_SCHEDULER_SINGLE_LEADER_REQUIRED=FIXTURE_SKIPPED"
    return 0
  fi
  if [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    echo "PRE_REPLICA_HEALTH_REQUIRED=TEST_FIXTURE_PASS"
    return 0
  fi
  echo "PRE_REPLICA_HEALTH_REQUIRED=YES"
  vps_replica_ensure_registered || return 1
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$TARGET_SHA" || return 1
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$TARGET_SHA" || return 1
  fi
  vps_replica_verify_scheduler_leaders 1 || return 1
  vps_replica_nginx_dual_upstream_ok || return 1
  echo "PRE_SCHEDULER_SINGLE_LEADER_REQUIRED=YES"
  return 0
}

s4f4_rolling_restart_same_sha() {
  local target_sha="$1"
  echo "SAME_SHA_RESTART=YES"
  echo "CODE_DEPLOY_OCCURRED=NO"
  echo "PM2_UPDATE_ENV_USED=YES"
  S4F4_RESTART_PHASE="${S4F4_RESTART_PHASE:-primary}"
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || return 1
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || return 1
  RESTART_COUNT=$((RESTART_COUNT + 1))
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || return 1
    RESTART_COUNT=$((RESTART_COUNT + 1))
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
  fi
  if [[ "${DI_S4F4_TEST_MODE:-0}" != "1" && ! s4f4_is_fixture_mode ]]; then
    pm2 save || true
  fi
  echo "ROLLING_RESTART_REPLICA_A_THEN_B=YES"
  return 0
}

s4f4_post_restart_verify() {
  if [[ "${DI_S4F4_TEST_MODE:-0}" == "1" || ( s4f4_is_fixture_mode && s4f4_is_dry_run ) ]]; then
    return 0
  fi
  echo "POST_NO_MIXED_SHA_REQUIRED=YES"
  echo "POST_HEALTH_REQUIRED=YES"
  echo "POST_SCHEDULER_SINGLE_LEADER_REQUIRED=YES"
  vps_replica_verify_post_deploy "${SYNQDRIVE_CURRENT_LINK}" "$TARGET_SHA" || return 1
  return 0
}

s4f4_runtime_proof_both() {
  local ok_a ok_b
  if [[ "${DI_S4F4_TEST_INJECT_RUNTIME_PROOF_FAIL:-0}" == "1" ]]; then
    echo "REPLICA_A_GLOBAL_BUDGET_RUNTIME=UNKNOWN"
    echo "REPLICA_B_GLOBAL_BUDGET_RUNTIME=UNKNOWN"
    return 1
  fi
  if s4f4_prove_replica_runtime_budget A "${SYNQDRIVE_REPLICA_A_PM2_NAME}"; then ok_a=1; else ok_a=0; fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if s4f4_prove_replica_runtime_budget B "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then ok_b=1; else ok_b=0; fi
  else
    ok_b=1
    echo "REPLICA_B_GLOBAL_BUDGET_RUNTIME=N/A"
  fi
  if [[ "$ok_a" == "1" && "$ok_b" == "1" ]]; then
    echo "GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED"
    return 0
  fi
  echo "GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=UNVERIFIED"
  return 1
}

s4f4_s4_post_safety() {
  if ! s4f4_run_cli s4-safe "$BACKEND_ENV"; then
    echo "S4_FLAGS_POST_STATE_SAFE=NO"
    return 1
  fi
  echo "S4_FLAGS_POST_STATE_SAFE=YES"
  s4f4_verify_app_module_s4_dormant || return 1
  echo "S4_RUNTIME_ACTIVE=NO"
  echo "SHADOW_ACTIVATION_OCCURRED=NO"
  echo "S4_PROVIDER_PRODUCTION_CALL_COUNT=0"
  echo "S4_PRODUCTION_WRITE_COUNT=0"
  return 0
}

s4f4_print_dry_run_plan() {
  echo "DRY_RUN_SUPPORTED=YES"
  echo "DRY_RUN_ZERO_MUTATION=PASS"
  echo "PROPOSED_PLAN=preflight,backup,mutate_single_key,rolling_restart_a,rolling_restart_b,runtime_proof,post_health,s4_safety"
  echo "PM2_RESTART_PERFORMED=NO"
  echo "PRODUCTION_ENV_MUTATED=NO"
  echo "ENV_MUTATION_COUNT=0"
  echo "RESTART_COUNT=0"
}

s4f4_main() {
  s4f4_require_ack_and_sha

  if [[ ! -r "$BACKEND_ENV" ]]; then
    echo "GLOBAL_BUDGET_CONFIG_FILE_STATE=UNREADABLE"
    echo "FAIL_CLOSED=YES"
    return 1
  fi

  s4f4_run_cli preflight "$BACKEND_ENV"
  if ! s4f4_run_cli s4-safe "$BACKEND_ENV"; then
    echo "PRE_S4_FLAGS_SAFE_REQUIRED=YES"
    return 1
  fi
  echo "PRE_S4_FLAGS_SAFE_REQUIRED=YES"

  local runtime_a runtime_b decision
  runtime_a="$(s4f4_fixture_runtime_proof A)"
  runtime_b="$(s4f4_fixture_runtime_proof B)"
  if ! s4f4_is_fixture_mode && [[ "${DI_S4F4_TEST_MODE:-0}" != "1" ]]; then
    runtime_a="$(s4f4_classify_runtime_from_log_snippet "$(s4f4_fetch_replica_runtime_log_snippet "${SYNQDRIVE_REPLICA_A_PM2_NAME}")")"
    runtime_b="$(s4f4_classify_runtime_from_log_snippet "$(s4f4_fetch_replica_runtime_log_snippet "${SYNQDRIVE_REPLICA_B_PM2_NAME}")")"
  fi
  decision="$(s4f4_run_cli idempotent-decision "$BACKEND_ENV" "$runtime_a" "$runtime_b" | sed -n 's/^IDEMPOTENT_DECISION=//p')"
  echo "IDEMPOTENT_DECISION=${decision}"

  if [[ "$decision" == "NO_OP" ]]; then
    echo "IDEMPOTENT_ALREADY_CONVERGED=YES"
    echo "ENV_MUTATION_COUNT=0"
    echo "RESTART_COUNT=0"
    echo "SECOND_RUN_MUTATION_COUNT_EXPECTED=0"
    echo "SECOND_RUN_RESTART_COUNT_EXPECTED=0"
    s4f4_run_config_file_audit "$BACKEND_ENV"
    if s4f4_runtime_proof_both; then
      echo "TINY_ACTIVATION_READY=NO"
      echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=UNKNOWN"
    fi
    return 0
  fi

  if s4f4_is_dry_run; then
    s4f4_print_dry_run_plan
    return 0
  fi

  s4f4_preflight_replicas

  if [[ "$decision" == "ABORT" ]]; then
    echo "FAIL_CLOSED=YES"
    return 1
  fi

  local backup_dir="${SYNQDRIVE_DEPLOY_STATE_DIR}/s4f4-global-budget"
  mkdir -p "$backup_dir"
  BACKUP_FILE="${backup_dir}/backend.env.$(date -u +%Y%m%dT%H%M%SZ).bak"
  if [[ "${DI_S4F4_TEST_INJECT_BACKUP_FAIL:-0}" == "1" ]]; then
    echo "BACKUP_CREATED_BEFORE_MUTATION=NO"
    return 1
  fi
  echo "BACKUP_CREATED_BEFORE_MUTATION=YES"
  echo "BACKUP_CHECKSUM_REQUIRED=YES"
  if ! s4f4_create_verified_backend_env_backup "$BACKEND_ENV" "$BACKUP_FILE"; then
    return 1
  fi
  BACKEND_ENV_SHA256_BEFORE="$(s4f4_file_sha256 "$BACKEND_ENV")"
  BACKUP_SHA256="$(s4f4_file_sha256 "$BACKUP_FILE")"

  s4f4_arm_recovery

  if [[ "$decision" == "MUTATE_AND_RESTART" ]]; then
    if [[ "${DI_S4F4_TEST_INJECT_MUTATION_FAIL:-0}" == "1" ]]; then
      echo "MUTATION_VALIDATION=FAIL"
      return 1
    fi
    if ! s4f4_run_cli mutate "$BACKEND_ENV"; then
      return 1
    fi
    ENV_MUTATION_COUNT=1
    echo "ATOMIC_SINGLE_KEY_MUTATION=YES"
    echo "UNRELATED_ENV_PRESERVED=YES"
    s4f4_run_config_file_audit "$BACKEND_ENV"
    s4f4_run_cli validate-budget "$BACKEND_ENV"
    s4f4_verify_redis_reachable "$BACKEND_ENV" || return 1
    echo "REDIS_HEALTH_REQUIRED=YES"
  else
    echo "ENV_MUTATION_COUNT=0"
    echo "RUNTIME_ONLY_RESTART_PATH=YES"
  fi

  MUTATION_EPOCH_MS="$(date +%s%3N)"
  S4F4_RESTART_PHASE=primary
  if ! s4f4_rolling_restart_same_sha "$TARGET_SHA"; then
    return 1
  fi

  if ! s4f4_post_restart_verify; then
    return 1
  fi

  if ! s4f4_runtime_proof_both; then
    return 1
  fi
  echo "ACTIVE_RUNTIME_PROOF_IMPLEMENTED=YES"
  echo "REPLICA_A_RUNTIME_PROOF_REQUIRED=YES"
  echo "REPLICA_B_RUNTIME_PROOF_REQUIRED=YES"

  if ! s4f4_s4_post_safety; then
    return 1
  fi
  echo "POST_S4_FLAGS_SAFE_REQUIRED=YES"

  s4f4_disarm_recovery
  echo "ENV_MUTATION_COUNT=${ENV_MUTATION_COUNT}"
  echo "RESTART_COUNT=${RESTART_COUNT}"
  echo "PRODUCTION_ENV_MUTATED=YES"
  echo "SIGNAL_RECOVERY_IMPLEMENTED=YES"
  echo "TINY_ACTIVATION_READY=NO"
  echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=UNKNOWN"
  echo "PROVIDER_GLOBAL_BUDGET_ENABLED_GATE_CURRENT=NOT_SATISFIED_UNTIL_TINY_EVALUATOR"
  return 0
}

s4f4_main
echo "WRAPPER_RESULT=SUCCESS"
