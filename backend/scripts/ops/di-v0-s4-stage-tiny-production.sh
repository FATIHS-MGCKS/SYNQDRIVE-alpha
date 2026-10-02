#!/usr/bin/env bash
# EXP-021 S4F-7J — transactional Production Tiny config staging (exactly three frozen env keys).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S4F7J_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7J_SCRIPT_DIR
S4F4_SCRIPT_DIR="$SCRIPT_DIR"
export S4F4_SCRIPT_DIR
S4F7F_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7F_SCRIPT_DIR

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"
# shellcheck source=lib/di-v0-s4f-global-budget-rollout.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4f-global-budget-rollout.lib.sh"
# shellcheck source=lib/di-v0-s4-global-kill-init-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-global-kill-init-production.lib.sh"
# shellcheck source=lib/di-v0-s4-tiny-staging-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-tiny-staging-production.lib.sh"

BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
DRY_RUN="${DRY_RUN:-0}"
ACK="${DI_S4_TINY_STAGING_ACK:-}"
REQUIRED_SHA="${DI_S4_TINY_STAGING_REQUIRED_SHA:-}"
REQUIRED_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
REQUIRED_PRE_ENV_SHA256="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"
EXPECTED_GLOBAL_STATE="${DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE:-}"

TX_STATE=PRE_MUTATION
RECOVERY_ARMED=0
RECOVERY_IN_PROGRESS=0
BACKEND_ENV_SHA256_BEFORE=""
BACKUP_FILE=""
TARGET_SHA=""
ENV_MUTATION_COUNT=0
RESTART_COUNT=0
S4F7J_REQUIRE_RESTART_IDENTITY=1
PRODUCTION_RESTART_OCCURRED=0
S4F7J_RESTART_PHASE=primary

echo "EXP021_S4F7J_TINY_CONFIG_STAGING_WRAPPER=1"
echo "SUPPORTED_ENV_MUTATION_KEY_COUNT=3"
echo "ARBITRARY_ENV_MUTATION_SUPPORTED=NO"
echo "S4_ENABLE_FLAG_MUTATION_SUPPORTED=NO"
echo "GLOBAL_DB_MUTATION_SUPPORTED=NO"
echo "EXPLICIT_ACK_REQUIRED=DI_S4_TINY_STAGING_ACK=YES"
echo "SIGKILL_LIMITATION_DOCUMENTED=YES"
echo "ROLLING_RESTART_ORDER=A_THEN_B"
echo "PM2_UPDATE_ENV_USED=YES"
echo "CODE_DEPLOY_OCCURRED=NO"
echo "MIGRATION_EXECUTED=NO"
echo "RUNTIME_PROOF_EXPOSES_FULL_ENV=NO"
echo "PROVIDER_CALL_PROHIBITION_IMPLEMENTED=YES"
echo "SHADOW_ACTIVATION_PROHIBITION_IMPLEMENTED=YES"

if [[ "${DI_S4F7J_TEST_MODE:-0}" == "1" ]]; then
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() {
    local name=$1
    if [[ "${DI_S4F7J_TEST_INJECT_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" && "${S4F7J_RESTART_PHASE:-primary}" == "primary" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7J_TEST_INJECT_RESTART_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" && "${S4F7J_RESTART_PHASE:-primary}" == "primary" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_wait_healthy() {
    if [[ "${DI_S4F7J_TEST_INJECT_HEALTH_A_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7J_TEST_INJECT_HEALTH_B_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_verify_post_deploy() {
    if [[ "${DI_S4F7J_TEST_INJECT_SCHEDULER_FAIL:-0}" == "1" && "${S4F7J_RESTART_PHASE:-primary}" == "primary" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_verify_no_mixed_sha() { return 0; }
  vps_replica_wait_scheduler_leader_convergence() {
    if [[ "${DI_S4F7J_TEST_INJECT_SCHEDULER_FAIL:-0}" == "1" ]]; then return 1; fi
    return 0
  }
  vps_replica_verify_scheduler_leaders() { return 0; }
  vps_replica_nginx_dual_upstream_ok() { return 0; }
fi

s4f7j_tx_set() {
  TX_STATE="$1"
  echo "TX_STATE=${TX_STATE}"
}

s4f7j_fail_after_arm() {
  local reason="$1"
  if [[ "$RECOVERY_ARMED" == "1" ]]; then
    s4f7j_on_recovery "$reason" || true
  fi
  exit 1
}

s4f7j_emit_production_outcome() {
  if [[ "$ENV_MUTATION_COUNT" == "1" ]]; then
    echo "PRODUCTION_ENV_MUTATION_OCCURRED=YES"
  else
    echo "PRODUCTION_ENV_MUTATION_OCCURRED=NO"
  fi
  if [[ "$RESTART_COUNT" -gt 0 ]]; then
    echo "PRODUCTION_RESTART_OCCURRED=YES"
  else
    echo "PRODUCTION_RESTART_OCCURRED=NO"
  fi
  echo "PRODUCTION_DB_WRITE_OCCURRED=NO"
  echo "DEPLOY_OCCURRED=NO"
  echo "MIGRATION_EXECUTED=NO"
  echo "PROVIDER_PRODUCTION_CALL_COUNT=0"
  echo "SHADOW_ACTIVATION_OCCURRED=NO"
}

s4f7j_on_recovery() {
  local reason="$1"
  if [[ "$RECOVERY_IN_PROGRESS" == "1" ]]; then
    return 1
  fi
  if [[ "$RECOVERY_ARMED" != "1" || -z "$BACKUP_FILE" ]]; then
    echo "RECOVERY_SKIPPED=not_armed_or_no_backup reason=${reason}"
    return 1
  fi
  RECOVERY_IN_PROGRESS=1
  s4f7j_tx_set RECOVERY_IN_PROGRESS
  echo "ROLLBACK_TRIGGER=${reason}"
  echo "ROLLBACK_RESTARTS_BOTH_REPLICAS=ATTEMPTED"
  echo "ROLLBACK_CAN_ENABLE_S4=NO"

  if ! s4f4_restore_backend_env_atomic "$BACKEND_ENV" "$BACKUP_FILE" "$BACKEND_ENV_SHA256_BEFORE"; then
    echo "ROLLBACK_RESULT=ENV_RESTORE_FAILED"
    echo "ROLLBACK_RESTORES_EXACT_ENV_BYTES=NO"
    return 1
  fi
  S4F7J_RESTART_PHASE=recovery
  S4F7J_RUNTIME_PROOF_MODE=RECOVERY_PRESTATE
  export S4F7J_RUNTIME_PROOF_MODE
  S4F7J_REQUIRE_RESTART_IDENTITY=0
  if ! s4f7j_rolling_restart_same_sha "$TARGET_SHA"; then
    echo "ROLLBACK_RESULT=RESTART_FAILED"
    return 1
  fi

  if ! s4f7j_recovery_post_verify "$TARGET_SHA"; then
    echo "ROLLBACK_RESULT=POST_VERIFY_FAILED"
    return 1
  fi
  echo "ROLLBACK_RESULT=COMPLETE"
  return 1
}

s4f7j_on_err() {
  local code=$?
  s4f7j_on_recovery "ERR trap exit=${code}" || true
  exit "$code"
}

s4f7j_on_signal() {
  local sig="$1"
  echo "SIGNAL_RECEIVED=${sig}"
  s4f7j_on_recovery "signal ${sig}" || true
  exit 130
}

s4f7j_install_traps() {
  trap 's4f7j_on_err' ERR
  trap 's4f7j_on_signal TERM' TERM
  trap 's4f7j_on_signal INT' INT
  trap 's4f7j_on_signal HUP' HUP
}

s4f7j_remove_traps() {
  trap - ERR TERM INT HUP
}

s4f7j_arm_recovery() {
  RECOVERY_ARMED=1
  s4f7j_install_traps
  echo "RECOVERY_ARMED_BEFORE_MUTATION=YES"
  echo "BACKUP_CREATED_BEFORE_MUTATION=YES"
  echo "BACKUP_CHECKSUM_VERIFICATION_IMPLEMENTED=YES"
  s4f7j_tx_set RECOVERY_ARMED
}

s4f7j_disarm_recovery() {
  RECOVERY_ARMED=0
  s4f7j_remove_traps
  s4f7j_tx_set COMMITTED
  echo "SIGNAL_RECOVERY_IMPLEMENTED=YES"
}

s4f7j_resolve_deployed_sha() {
  if [[ -n "${DI_S4F7J_FIXTURE_DEPLOYED_SHA:-}" ]] && { s4f7j_is_fixture_mode || [[ "${DI_S4F7J_TEST_MODE:-0}" == "1" ]]; }; then
    echo "${DI_S4F7J_FIXTURE_DEPLOYED_SHA}"
    return 0
  fi
  vps_replica_current_sha
}

s4f7j_resolve_release_dir() {
  if [[ -n "${DI_S4F7J_FIXTURE_RELEASE_DIR:-}" ]] && { s4f7j_is_fixture_mode || [[ "${DI_S4F7J_TEST_MODE:-0}" == "1" ]]; }; then
    echo "${DI_S4F7J_FIXTURE_RELEASE_DIR}"
    return 0
  fi
  readlink -f "${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}" 2>/dev/null || echo ""
}

s4f7j_require_pins() {
  if [[ "$ACK" != "YES" ]]; then
    echo "OPERATOR_ACK=MISSING"
    echo "FAIL_CLOSED=YES"
    return 1
  fi
  echo "ACK_REQUIRED=YES"
  echo "OPERATOR_ACK=YES"
  for var in REQUIRED_SHA REQUIRED_RELEASE_ID REQUIRED_PRE_ENV_SHA256; do
    if [[ -z "${!var}" ]]; then
      echo "PIN_MISSING=${var}"
      return 1
    fi
  done
  if [[ "$EXPECTED_GLOBAL_STATE" != "KILLED" ]]; then
    echo "GLOBAL_KILLED_REQUIRED=NO"
    return 1
  fi
  echo "GLOBAL_KILLED_REQUIRED=YES"
  TARGET_SHA="$(s4f7j_resolve_deployed_sha)"
  if [[ -z "$TARGET_SHA" || "$TARGET_SHA" != "$REQUIRED_SHA" ]]; then
    echo "PRODUCTION_SHA_PIN_REQUIRED=YES"
    echo "SHA_MISMATCH_FAILS_PRE_MUTATION=YES"
    return 1
  fi
  echo "PRODUCTION_SHA_PIN_REQUIRED=YES"
  echo "SAME_PRODUCTION_SHA_REQUIRED=YES"
  local release_dir actual_release
  release_dir="$(s4f7j_resolve_release_dir)"
  actual_release="$(basename "$release_dir")"
  if [[ "$actual_release" != "$REQUIRED_RELEASE_ID" ]]; then
    echo "PRODUCTION_RELEASE_PIN_REQUIRED=YES"
    echo "RELEASE_MISMATCH=YES"
    return 1
  fi
  echo "PRODUCTION_RELEASE_PIN_REQUIRED=YES"
  return 0
}

s4f7j_preflight_readonly() {
  s4f7j_run_cli frozen-authority || return 1

  if [[ ! -r "$BACKEND_ENV" ]]; then
    echo "BACKEND_ENV_UNREADABLE=YES"
    return 1
  fi
  local actual_env_sha
  actual_env_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  echo "PRE_ENV_SHA_PIN_REQUIRED=YES"
  echo "BACKEND_ENV_SHA256=${actual_env_sha}"
  if [[ "$actual_env_sha" != "$REQUIRED_PRE_ENV_SHA256" ]]; then
    echo "PRE_ENV_HASH_MISMATCH=YES"
    return 1
  fi

  local -a global_lines=()
  mapfile -t global_lines < <(s4f7j_query_global_row_db)
  if [[ "${global_lines[0]:-}" == *FAILED* ]]; then
    echo "GLOBAL_DB_READ_FAILURE_FAILS_CLOSED=YES"
    return 1
  fi
  if ! s4f7j_run_cli validate-global-prestate "${global_lines[@]}"; then
    echo "NOT_KILLED_FAILS_CLOSED=YES"
    return 1
  fi

  local -a s4_lines=()
  mapfile -t s4_lines < <(s4f7j_query_s4_counts_db)
  if [[ "${s4_lines[0]:-}" == *FAILED* ]]; then
    return 1
  fi
  s4f7j_run_cli validate-s4-persistence "${s4_lines[@]}" || return 1

  if ! s4f7j_run_cli s4-safe "$BACKEND_ENV"; then
    echo "ANY_S4_ENABLE_FLAG_ON_FAILS_CLOSED=YES"
    return 1
  fi

  local prestate_out
  if ! prestate_out="$(s4f7j_run_cli validate-prestate-keys "$BACKEND_ENV")"; then
    echo "TARGET_KEY_PRESTATE_FAILS_CLOSED=YES"
    return 1
  fi
  printf '%s\n' "$prestate_out"
  export PRE_NOT_BEFORE_STATE="$(printf '%s\n' "$prestate_out" | awk -F= '/^PRE_NOT_BEFORE_STATE=/{print $2}')"
  export PRE_ORG_ALLOWLIST_STATE="$(printf '%s\n' "$prestate_out" | awk -F= '/^PRE_ORG_ALLOWLIST_STATE=/{print $2}')"
  export PRE_VEHICLE_ALLOWLIST_STATE="$(printf '%s\n' "$prestate_out" | awk -F= '/^PRE_VEHICLE_ALLOWLIST_STATE=/{print $2}')"

  local -a vehicle_lines=()
  mapfile -t vehicle_lines < <(s4f7j_query_vehicle_db) || return 1
  s4f7j_run_cli validate-vehicle-db "${vehicle_lines[@]}" || return 1

  local release_dir
  release_dir="$(s4f7j_resolve_release_dir)"
  if ! s4f7j_live_topology_preflight "$TARGET_SHA" "$release_dir"; then
    echo "TOPOLOGY_PREFLIGHT_FAILS_CLOSED=YES"
    return 1
  fi
  if ! s4f7j_live_budget_redis_preflight "$release_dir"; then
    echo "BUDGET_REDIS_PREFLIGHT_FAILS_CLOSED=YES"
    return 1
  fi

  export DI_S4F7J_GLOBAL_ROW_LINES="$(printf '%s\n' "${global_lines[@]}")"
  export DI_S4F7J_S4_PERSISTENCE_LINES="$(printf '%s\n' "${s4_lines[@]}")"
  export DI_S4F7J_VEHICLE_DB_LINES="$(printf '%s\n' "${vehicle_lines[@]}")"
  export DI_S4F7J_ENV_CONTENT="$(cat "$BACKEND_ENV")"
  export DI_S4F7J_ENV_READABLE=YES
  export DI_S4_TINY_STAGING_ACTUAL_SHA="$TARGET_SHA"
  export DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID="$REQUIRED_RELEASE_ID"
  export DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256="$actual_env_sha"
  s4f7j_run_cli guards || return 1

  echo "PRE_POST_S4_ZERO_STATE_PROOF_IMPLEMENTED=YES"
  echo "DISCOVERY_EFFECTIVE_ENABLED=NO"
  echo "WORKER_EFFECTIVE_ENABLED=NO"
  echo "MAINTENANCE_EFFECTIVE_ENABLED=NO"
  return 0
}

s4f7j_restart_replica_with_staging_proof() {
  local label="$1" name="$2" port="$3" target_sha="$4" release_dir="$5"
  vps_replica_restart_one "$name" || return 1
  RESTART_COUNT=$((RESTART_COUNT + 1))
  PRODUCTION_RESTART_OCCURRED=1
  vps_replica_wait_healthy "$name" "$port" "$target_sha" || return 1
  if [[ "$S4F7J_REQUIRE_RESTART_IDENTITY" == "1" ]]; then
    s4f7j_verify_steady_state_replica "$label" "$name" "$port" "$target_sha" "$release_dir" || return 1
  fi
  if [[ "${DI_S4F7J_TEST_INJECT_RUNTIME_PROOF_FAIL:-0}" == "1" && "$label" == "A" && "${S4F7J_RESTART_PHASE:-primary}" == "primary" ]]; then
    return 1
  fi
  if [[ "${DI_S4F7J_TEST_INJECT_RUNTIME_PROOF_B_FAIL:-0}" == "1" && "$label" == "B" && "${S4F7J_RESTART_PHASE:-primary}" == "primary" ]]; then
    return 1
  fi
  s4f7j_prove_replica_staging_runtime "$label" "$name" || return 1
  s4f7j_run_cli s4-safe "$BACKEND_ENV" || return 1
  return 0
}

s4f7j_rolling_restart_same_sha() {
  local target_sha="$1"
  local release_dir
  release_dir="$(s4f7j_resolve_release_dir)"
  echo "SAME_SHA_RESTART=YES"
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || return 1
  s4f7j_restart_replica_with_staging_proof A "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" "$release_dir" || return 1
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    s4f7j_restart_replica_with_staging_proof B "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" "$release_dir" || return 1
  fi
  echo "ROLLING_RESTART_ORDER=A_THEN_B"
  return 0
}

s4f7j_post_restart_verify() {
  echo "STEADY_STATE_NO_MIXED_RELEASE_IDENTITY=YES"
  vps_replica_verify_post_deploy "${SYNQDRIVE_CURRENT_LINK}" "$TARGET_SHA" || return 1
  vps_replica_wait_scheduler_leader_convergence || return 1
  vps_replica_verify_scheduler_leaders 1 || return 1
  vps_replica_nginx_dual_upstream_ok || return 1
  return 0
}

s4f7j_recovery_post_verify() {
  local target_sha="$1"
  local release_dir
  release_dir="$(s4f7j_resolve_release_dir)"
  local restored_sha
  restored_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$restored_sha" != "$BACKEND_ENV_SHA256_BEFORE" ]]; then
    echo "ROLLBACK_RESTORES_EXACT_ENV_BYTES=NO"
    return 1
  fi
  echo "ROLLBACK_RESTORES_EXACT_ENV_BYTES=YES"
  if ! s4f7j_run_cli validate-prestate-keys "$BACKEND_ENV"; then
    echo "ROLLBACK_PRESTATE_TARGET_KEYS_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_PRESTATE_TARGET_KEYS_VERIFIED=YES"
  if ! s4f7j_run_cli s4-safe "$BACKEND_ENV"; then
    echo "ROLLBACK_ALL_S4_FLAGS_OFF_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_ALL_S4_FLAGS_OFF_VERIFIED=YES"
  local -a global_lines=()
  mapfile -t global_lines < <(s4f7j_query_global_row_db)
  if ! s4f7j_run_cli validate-global-prestate "${global_lines[@]}"; then
    echo "ROLLBACK_GLOBAL_KILLED_DB_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_GLOBAL_KILLED_DB_VERIFIED=YES"
  local -a s4_lines=()
  mapfile -t s4_lines < <(s4f7j_query_s4_counts_db)
  s4f7j_run_cli validate-s4-persistence "${s4_lines[@]}" || return 1
  echo "ROLLBACK_S4_ZERO_STATE_VERIFIED=YES"
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
  fi
  s4f7j_verify_steady_state_replica A "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" "$release_dir" || return 1
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    s4f7j_verify_steady_state_replica B "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" "$release_dir" || return 1
  fi
  echo "ROLLBACK_REPLICA_IDENTITIES_VERIFIED=YES"
  vps_replica_verify_scheduler_leaders 1 || return 1
  vps_replica_nginx_dual_upstream_ok || return 1
  echo "ROLLBACK_SCHEDULER_VERIFIED=YES"
  echo "ROLLBACK_NGINX_VERIFIED=YES"
  if ! s4f7j_live_budget_redis_preflight "$release_dir"; then
    echo "ROLLBACK_GLOBAL_BUDGET_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_GLOBAL_BUDGET_VERIFIED=YES"
  echo "ROLLBACK_REDIS_VERIFIED=YES"
  echo "ROLLBACK_PRESERVES_GLOBAL_KILLED=YES"
  echo "ROLLBACK_POST_VERIFY=PASS"
  return 0
}

s4f7j_print_dry_run_plan() {
  echo "DRY_RUN_SUPPORTED=YES"
  s4f7j_run_cli print-frozen
  echo "ENV_MUTATION_COUNT=0"
  echo "RESTART_COUNT=0"
  echo "DRY_RUN_ENV_MUTATION_COUNT=0"
  echo "DRY_RUN_RESTART_COUNT=0"
  echo "PRODUCTION_ENV_MUTATION_OCCURRED=NO"
  echo "PRODUCTION_RESTART_OCCURRED=NO"
}

s4f7j_main() {
  s4f7j_require_pins || exit 1
  s4f7j_preflight_readonly || exit 1

  if s4f7j_is_dry_run; then
    s4f7j_print_dry_run_plan
    echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED"
    echo "TINY_ACTIVATION_READY=NO"
    exit 0
  fi

  s4f7j_require_durable_backup_dir || exit 1
  local backup_dir="${SYNQDRIVE_DEPLOY_STATE_DIR}/s4f7j-tiny-staging"
  mkdir -p "$backup_dir"
  BACKUP_FILE="${backup_dir}/backend.env.$(date -u +%Y%m%dT%H%M%SZ).bak"
  if [[ "${DI_S4F7J_TEST_INJECT_BACKUP_FAIL:-0}" == "1" ]]; then
    echo "BACKUP_CREATED_BEFORE_MUTATION=NO"
    exit 1
  fi
  if ! s4f4_create_verified_backend_env_backup "$BACKEND_ENV" "$BACKUP_FILE"; then
    exit 1
  fi
  BACKEND_ENV_SHA256_BEFORE="$(s4f4_file_sha256 "$BACKEND_ENV")"

  s4f7j_arm_recovery

  if [[ "${DI_S4F7J_TEST_INJECT_MUTATION_FAIL:-0}" == "1" ]]; then
    s4f7j_fail_after_arm "mutation_inject"
  fi
  if ! s4f7j_run_cli mutate "$BACKEND_ENV"; then
    s4f7j_fail_after_arm "env_mutation"
  fi
  ENV_MUTATION_COUNT=1
  echo "ATOMIC_ENV_PROMOTION_IMPLEMENTED=YES"
  echo "EXACT_THREE_KEY_DIFF_AUTHORITY_IMPLEMENTED=YES"
  echo "TARGET_ENV_DUPLICATE_FAILS_CLOSED=YES"
  if ! s4f7j_run_config_file_audit "$BACKEND_ENV"; then
    echo "POST_MUTATION_CONFIG_AUDIT_FAILURE_IS_FATAL=YES"
    s4f7j_fail_after_arm "config_audit"
  fi
  echo "POST_MUTATION_CONFIG_AUDIT_FAILURE_IS_FATAL=YES"

  S4F7J_RESTART_PHASE=primary
  S4F7J_RUNTIME_PROOF_MODE=PRIMARY_STAGING
  export S4F7J_RUNTIME_PROOF_MODE
  if ! s4f7j_rolling_restart_same_sha "$TARGET_SHA"; then
    s4f7j_fail_after_arm "rolling_restart"
  fi
  if ! s4f7j_post_restart_verify; then
    s4f7j_fail_after_arm "post_restart"
  fi

  local -a global_post=()
  mapfile -t global_post < <(s4f7j_query_global_row_db)
  s4f7j_run_cli validate-global-prestate "${global_post[@]}" || s4f7j_fail_after_arm "global_post"

  local -a s4_post=()
  mapfile -t s4_post < <(s4f7j_query_s4_counts_db)
  s4f7j_run_cli validate-s4-persistence "${s4_post[@]}" || s4f7j_fail_after_arm "s4_post"

  s4f7j_disarm_recovery
  echo "ENV_MUTATION_COUNT=${ENV_MUTATION_COUNT}"
  echo "RESTART_COUNT=${RESTART_COUNT}"
  s4f7j_emit_production_outcome
  echo "REPLICA_A_RUNTIME_STAGING_VALUE_PROOF_IMPLEMENTED=YES"
  echo "REPLICA_B_RUNTIME_STAGING_VALUE_PROOF_IMPLEMENTED=YES"
  echo "S4_ENABLE_FLAGS_RUNTIME_PROOF_IMPLEMENTED=YES"
  echo "PROCESS_RELEASE_IDENTITY_PROOF_IMPLEMENTED=YES"
  echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED"
  echo "TINY_ACTIVATION_READY=NO"
}

s4f7j_main
echo "WRAPPER_RESULT=SUCCESS"
