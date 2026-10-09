#!/usr/bin/env bash
# EXP-021 S4F-7AO — five-flag env transaction (GLOBAL KILLED enforced; no DB kill mutation).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7AO_TX_COMMITTED=0
S4F7AO_ROLLBACK_ATTEMPTED=0
S4F7AO_ROLLBACK_COMPLETED=0
S4F7AO_BACKUP_FILE=""
S4F7AO_ENV_MUTATED=0
S4F7AO_REPLICA_A_RUNTIME_DIRTY=0
S4F7AO_REPLICA_B_RUNTIME_DIRTY=0
S4F7AO_REPLICA_A_FIVE_FLAG_PROVEN=0
S4F7AO_RECOVER_A=0
S4F7AO_RECOVER_B=0

s4f7ao_mark_replica_a_runtime_dirty() {
  S4F7AO_REPLICA_A_RUNTIME_DIRTY=1
  echo "REPLICA_A_RUNTIME_DIRTY=YES"
}

s4f7ao_mark_replica_b_runtime_dirty() {
  S4F7AO_REPLICA_B_RUNTIME_DIRTY=1
  echo "REPLICA_B_RUNTIME_DIRTY=YES"
}

s4f7ao_compute_rollback_replica_scope() {
  S4F7AO_RECOVER_A=0
  S4F7AO_RECOVER_B=0
  if [[ "$S4F7AO_REPLICA_A_FIVE_FLAG_PROVEN" == "1" ]]; then
    S4F7AO_RECOVER_A=1
    S4F7AO_RECOVER_B=1
  elif [[ "$S4F7AO_REPLICA_A_RUNTIME_DIRTY" == "1" ]]; then
    S4F7AO_RECOVER_A=1
  fi
  if [[ "$S4F7AO_REPLICA_B_RUNTIME_DIRTY" == "1" ]]; then
    S4F7AO_RECOVER_B=1
    S4F7AO_RECOVER_A=1
  fi
  echo "ROLLBACK_RECOVER_A=$( [[ "$S4F7AO_RECOVER_A" == "1" ]] && echo YES || echo NO )"
  echo "ROLLBACK_RECOVER_B=$( [[ "$S4F7AO_RECOVER_B" == "1" ]] && echo YES || echo NO )"
}

s4f7ao_uses_test_stubs() {
  [[ "${DI_S4F7AO_TEST_MODE:-0}" == "1" || "${DI_S4F7J_TEST_MODE:-0}" == "1" || "${DI_S4F7AO_ENGINEERING_TEST_HARNESS:-}" == "YES" ]]
}

s4f7ao_install_test_stubs() {
  if ! s4f7ao_may_install_test_stubs; then
    return 0
  fi
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() {
    local name=$1
    if [[ "${S4F7J_RESTART_PHASE:-primary}" == "primary" && "${DI_S4F7AO_TEST_INJECT_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${S4F7J_RESTART_PHASE:-primary}" == "primary" && "${DI_S4F7AO_TEST_INJECT_RESTART_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7AO_TEST_INJECT_RECOVERY_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" && "${S4F7J_RESTART_PHASE:-}" == "recovery" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7AO_TEST_INJECT_RECOVERY_RESTART_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" && "${S4F7J_RESTART_PHASE:-}" == "recovery" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_wait_healthy() {
    local name=$1
    if [[ "${S4F7J_RESTART_PHASE:-primary}" == "primary" && "${DI_S4F7AO_TEST_INJECT_HEALTH_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${S4F7J_RESTART_PHASE:-primary}" == "primary" && "${DI_S4F7AO_TEST_INJECT_HEALTH_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_verify_scheduler_leaders() { return 0; }
  vps_replica_nginx_dual_upstream_ok() { return 0; }
}

s4f7ao_fail_closed() {
  echo "FAIL_CLOSED=$1"
  if [[ "${S4F7AO_RECOVERY_ARMED:-0}" == "1" ]]; then
    s4f7ao_execute_rollback "${1}"
  fi
  s4f7ao_emit_terminal
  return 1
}

s4f7ao_emit_terminal() {
  echo "GLOBAL_DB_MUTATION_OCCURRED=NO"
  echo "S4_ACTIVATION_OCCURRED=NO"
  echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED"
  echo "FIVE_FLAG_TRANSACTION_COMMITTED=$( [[ "$S4F7AO_TX_COMMITTED" == "1" ]] && echo YES || echo NO )"
  echo "ROLLBACK_ATTEMPTED=$( [[ "$S4F7AO_ROLLBACK_ATTEMPTED" == "1" ]] && echo YES || echo NO )"
  echo "ROLLBACK_COMPLETED=$( [[ "$S4F7AO_ROLLBACK_COMPLETED" == "1" ]] && echo YES || echo NO )"
  if [[ "$S4F7AO_ROLLBACK_ATTEMPTED" == "1" && "$S4F7AO_ROLLBACK_COMPLETED" != "1" ]]; then
    echo "CRITICAL_RECOVERY_STATE=YES"
  fi
}

s4f7ao_prove_replica_prestate_runtime() {
  local label="$1" port="$2"
  S4F7J_RUNTIME_PROOF_MODE=RECOVERY_PRESTATE
  export S4F7J_RUNTIME_PROOF_MODE
  if [[ "${DI_S4F7AO_TEST_INJECT_RECOVERY_ATTESTATION_FAIL:-0}" == "1" ]]; then
    echo "REPLICA_${label}_RECOVERY_PRESTATE_ATTESTATION=FAIL"
    return 1
  fi
  if ! s4f7j_prove_replica_staging_runtime "$label" "$port" "$BACKEND_ENV"; then
    echo "REPLICA_${label}_RECOVERY_PRESTATE_ATTESTATION=FAIL"
    return 1
  fi
  echo "REPLICA_${label}_RECOVERY_PRESTATE_ATTESTATION=PASS"
  return 0
}

s4f7ao_recovery_restart_replica() {
  local name="$1" port="$2" target_sha="$3"
  S4F7J_RESTART_PHASE=recovery
  export S4F7J_RESTART_PHASE
  vps_replica_restart_one "$name" || return 1
  vps_replica_wait_healthy "$name" "$port" "$target_sha" || return 1
  return 0
}

s4f7ao_recovery_rolling_restart() {
  local target_sha="$1"
  local restarted_any=0
  s4f7ao_compute_rollback_replica_scope
  vps_replica_ensure_registered || return 1
  if [[ "$S4F7AO_RECOVER_A" == "1" ]]; then
    restarted_any=1
    echo "ROLLBACK_REPLICA_A_RECOVERY=ATTEMPTED"
    s4f7ao_recovery_restart_replica "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
    echo "ROLLBACK_REPLICA_A_RECOVERY=COMPLETE"
  fi
  if [[ "$S4F7AO_RECOVER_B" == "1" ]]; then
    restarted_any=1
    echo "ROLLBACK_REPLICA_B_RECOVERY=ATTEMPTED"
    s4f7ao_recovery_restart_replica "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
    echo "ROLLBACK_REPLICA_B_RECOVERY=COMPLETE"
  fi
  if [[ "$restarted_any" == "0" ]]; then
    echo "ROLLBACK_REPLICA_RECOVERY=NOT_REQUIRED"
  else
    echo "ROLLBACK_REPLICA_RECOVERY=COMPLETE"
  fi
  return 0
}

s4f7ao_recovery_post_verify() {
  local target_sha="$1"
  local release_dir
  release_dir="$(s4f7j_resolve_release_dir)"
  local restored_sha
  restored_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$restored_sha" != "$S4F7AO_BACKEND_ENV_SHA256_BEFORE" ]]; then
    echo "ROLLBACK_RESTORES_EXACT_ENV_BYTES=NO"
    return 1
  fi
  echo "ROLLBACK_RESTORES_EXACT_ENV_BYTES=YES"
  if ! s4f7ao_run_cli validate-staged "$BACKEND_ENV"; then
    echo "ROLLBACK_PRESTATE_TARGET_KEYS_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_PRESTATE_TARGET_KEYS_VERIFIED=YES"
  if ! s4f7ao_run_cli s4-safe "$BACKEND_ENV"; then
    echo "ROLLBACK_ALL_S4_FLAGS_OFF_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_ALL_S4_FLAGS_OFF_VERIFIED=YES"
  local -a global_lines=()
  mapfile -t global_lines < <(s4f7j_query_global_row_db)
  if ! s4f7ao_run_cli validate-global-prestate "${global_lines[@]}"; then
    echo "ROLLBACK_GLOBAL_KILLED_DB_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_GLOBAL_KILLED_DB_VERIFIED=YES"
  local -a s4_lines=()
  mapfile -t s4_lines < <(s4f7j_query_s4_counts_db)
  if ! s4f7ao_run_cli validate-s4-persistence "${s4_lines[@]}"; then
    echo "ROLLBACK_S4_ZERO_STATE_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_S4_ZERO_STATE_VERIFIED=YES"
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  s4f7j_verify_steady_state_replica A "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" "$release_dir" || return 1
  if ! s4f7ao_prove_replica_prestate_runtime A "${SYNQDRIVE_REPLICA_A_PORT}"; then
    echo "FULL_A_B_PRESTATE_PROOF=NO"
    return 1
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
    s4f7j_verify_steady_state_replica B "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" "$release_dir" || return 1
    if ! s4f7ao_prove_replica_prestate_runtime B "${SYNQDRIVE_REPLICA_B_PORT}"; then
      echo "FULL_A_B_PRESTATE_PROOF=NO"
      return 1
    fi
  fi
  echo "FULL_A_B_PRESTATE_PROOF=YES"
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
  echo "ROLLBACK_PRESERVES_GLOBAL_KILLED=YES"
  echo "ROLLBACK_POST_VERIFY=PASS"
  return 0
}

s4f7ao_execute_rollback() {
  local reason="${1:-unknown}"
  echo "ROLLBACK_TRIGGER=${reason}"
  S4F7AO_ROLLBACK_ATTEMPTED=1
  if [[ -z "$S4F7AO_BACKUP_FILE" || ! -f "$S4F7AO_BACKUP_FILE" ]]; then
    echo "ROLLBACK_RESULT=FAILED"
    echo "CRITICAL_RECOVERY_STATE=YES"
    echo "ROLLBACK_FAILURE_REASON=missing_backup"
    return 1
  fi
  if [[ "${DI_S4F7AO_TEST_INJECT_BACKUP_RESTORE_FAIL:-0}" == "1" ]]; then
    export DI_S4F4_TEST_INJECT_BACKUP_RESTORE_FAIL=1
  fi
  s4f7ao_compute_rollback_replica_scope
  if ! s4f4_restore_backend_env_atomic "$BACKEND_ENV" "$S4F7AO_BACKUP_FILE" "$S4F7AO_BACKEND_ENV_SHA256_BEFORE"; then
    echo "ROLLBACK_RESULT=FAILED"
    echo "CRITICAL_RECOVERY_STATE=YES"
    echo "ROLLBACK_FAILURE_REASON=env_restore"
    return 1
  fi
  local target_sha
  target_sha="$(s4f7j_resolve_deployed_sha)"
  if ! s4f7ao_recovery_rolling_restart "$target_sha"; then
    echo "ROLLBACK_RESULT=FAILED"
    echo "CRITICAL_RECOVERY_STATE=YES"
    echo "ROLLBACK_FAILURE_REASON=replica_recovery"
    return 1
  fi
  if ! s4f7ao_recovery_post_verify "$target_sha"; then
    echo "ROLLBACK_RESULT=FAILED"
    echo "CRITICAL_RECOVERY_STATE=YES"
    echo "ROLLBACK_FAILURE_REASON=post_verify"
    return 1
  fi
  S4F7AO_ROLLBACK_COMPLETED=1
  echo "ROLLBACK_RESULT=COMPLETE"
  return 0
}

s4f7ao_preflight_readonly() {
  echo "EXP021_S4F7AO_PREFLIGHT_READONLY=1"
  s4f7ao_run_cli print-contract || return 1
  if [[ ! -r "$BACKEND_ENV" ]]; then
    echo "BACKEND_ENV_UNREADABLE=YES"
    return 1
  fi
  local actual_env_sha
  actual_env_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$actual_env_sha" != "$REQUIRED_PRE_ENV_SHA256" ]]; then
    echo "PRE_ENV_HASH_MISMATCH=YES"
    return 1
  fi
  s4f7ao_run_cli validate-staged "$BACKEND_ENV" || return 1
  s4f7ao_run_cli s4-safe "$BACKEND_ENV" || return 1

  local -a global_lines=()
  mapfile -t global_lines < <(s4f7j_query_global_row_db)
  s4f7ao_run_cli validate-global-prestate "${global_lines[@]}" || return 1

  local -a s4_lines=()
  mapfile -t s4_lines < <(s4f7j_query_s4_counts_db)
  s4f7ao_run_cli validate-s4-persistence "${s4_lines[@]}" || return 1

  local -a vehicle_lines=()
  mapfile -t vehicle_lines < <(s4f7j_query_vehicle_db) || return 1
  s4f7ao_run_cli validate-vehicle-db "${vehicle_lines[@]}" || return 1

  export DI_S4F7AO_GLOBAL_ROW_LINES="$(printf '%s\n' "${global_lines[@]}")"
  export DI_S4F7AO_S4_PERSISTENCE_LINES="$(printf '%s\n' "${s4_lines[@]}")"
  export DI_S4F7AO_VEHICLE_DB_LINES="$(printf '%s\n' "${vehicle_lines[@]}")"
  export DI_S4F7AO_ENV_CONTENT="$(cat "$BACKEND_ENV")"
  export DI_S4F7AO_ENV_READABLE=YES
  export DI_S4_TINY_STAGING_ACTUAL_SHA="$TARGET_SHA"
  export DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID="$REQUIRED_RELEASE_ID"
  export DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256="$actual_env_sha"
  export DI_S4F7AO_TOPOLOGY_OK=YES
  export DI_S4F7AO_BUDGET_CONFIG_OK=YES
  export DI_S4F7AO_BUDGET_RUNTIME_OK=YES
  export DI_S4F7AO_REDIS_OK=YES

  if ! s4f7j_live_topology_preflight "$TARGET_SHA" "$(s4f7j_resolve_release_dir)"; then
    export DI_S4F7AO_TOPOLOGY_OK=NO
    return 1
  fi
  if ! s4f7j_live_budget_redis_preflight "$(s4f7j_resolve_release_dir)"; then
    export DI_S4F7AO_BUDGET_RUNTIME_OK=NO
    return 1
  fi

  s4f7ao_run_cli guards || return 1
  echo "GLOBAL_KILL_ENFORCED=YES"
  echo "DISCOVERY_EFFECTIVE_ENABLED=NO"
  echo "WORKER_EFFECTIVE_ENABLED=NO"
  return 0
}

s4f7ao_execute_five_flag_transaction() {
  echo "EXP021_S4F7AO_FIVE_FLAG_TRANSACTION=1"
  s4f7ao_assert_production_test_isolation || return 1
  s4f7ao_install_test_stubs
  if [[ "${DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK:-}" != "YES" ]]; then
    echo "OPERATOR_ACK=MISSING"
    return 1
  fi
  if [[ "${DI_S4F7AO_FIVE_FLAG_AUTHORIZED:-}" != "YES" ]]; then
    echo "FIVE_FLAG_AUTHORIZATION=MISSING"
    return 1
  fi
  if [[ "${DI_S4F7AO_ENGINEERING_TEST_HARNESS:-}" == "YES" && "$BACKEND_ENV" == "/opt/synqdrive/shared/backend.env" ]]; then
    echo "ENGINEERING_HARNESS_PRODUCTION_PATH_FORBIDDEN=YES"
    return 1
  fi

  TARGET_SHA="$(s4f7j_resolve_deployed_sha)"
  REQUIRED_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
  REQUIRED_PRE_ENV_SHA256="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"

  s4f7ao_preflight_readonly || return 1

  if ! s4f7j_require_durable_backup_dir; then
    echo "BACKUP_CREATED_BEFORE_MUTATION=NO"
    return 1
  fi
  local backup_dir="${SYNQDRIVE_DEPLOY_STATE_DIR}/s4f7ao-five-flag"
  mkdir -p "$backup_dir"
  S4F7AO_BACKUP_FILE="${backup_dir}/backend.env.$(date -u +%Y%m%dT%H%M%SZ).bak"
  if [[ "${DI_S4F7AO_TEST_INJECT_BACKUP_FAIL:-0}" == "1" ]]; then
    echo "BACKUP_CREATED_BEFORE_MUTATION=NO"
    return 1
  fi
  S4F7AO_BACKEND_ENV_SHA256_BEFORE="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if ! s4f4_create_verified_backend_env_backup "$BACKEND_ENV" "$S4F7AO_BACKUP_FILE"; then
    return 1
  fi
  echo "BACKUP_CREATED_BEFORE_MUTATION=YES"
  echo "BACKUP_VERIFIED=YES"
  S4F7AO_RECOVERY_ARMED=1

  if [[ "${DI_S4F7AO_TEST_INJECT_MUTATION_FAIL:-0}" == "1" ]]; then
    s4f7ao_fail_closed "mutation_inject"
    return 1
  fi
  if ! s4f7ao_run_cli apply-mutation-live "$BACKEND_ENV"; then
    s4f7ao_fail_closed "env_mutation"
    return 1
  fi
  S4F7AO_ENV_MUTATED=1
  echo "ENV_MUTATION_OCCURRED=YES"

  local expected_fp
  expected_fp="$(s4f7ao_run_cli derive-fingerprint "$BACKEND_ENV" | awk -F= '/^INTERNALLY_COMPUTED_FINGERPRINT=/{print $2}')"
  if [[ -z "$expected_fp" ]]; then
    s4f7ao_fail_closed "fingerprint"
    return 1
  fi

  s4f7ao_run_cli post-mutation-audit "$BACKEND_ENV" || { s4f7ao_fail_closed "config_audit"; return 1; }

  local release_dir
  release_dir="$(s4f7j_resolve_release_dir)"
  vps_replica_ensure_registered || { s4f7ao_fail_closed "topology"; return 1; }

  S4F7J_RESTART_PHASE=primary
  export S4F7J_RESTART_PHASE
  s4f7ao_mark_replica_a_runtime_dirty
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || { s4f7ao_fail_closed "replica_a"; return 1; }
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$TARGET_SHA" || { s4f7ao_fail_closed "replica_a_health"; return 1; }
  if [[ "${DI_S4F7AO_TEST_INJECT_ATTESTATION_A_FAIL:-0}" == "1" ]]; then
    s4f7ao_fail_closed "replica_a_attestation"
    return 1
  fi
  s4f7ao_prove_replica_five_flag_runtime A "${SYNQDRIVE_REPLICA_A_PORT}" "$BACKEND_ENV" "$expected_fp" || { s4f7ao_fail_closed "replica_a_attestation"; return 1; }
  S4F7AO_REPLICA_A_FIVE_FLAG_PROVEN=1
  echo "REPLICA_A_RESTART=YES"

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    s4f7ao_mark_replica_b_runtime_dirty
    vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || { s4f7ao_fail_closed "replica_b"; return 1; }
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$TARGET_SHA" || { s4f7ao_fail_closed "replica_b_health"; return 1; }
    if [[ "${DI_S4F7AO_TEST_INJECT_ATTESTATION_B_FAIL:-0}" == "1" ]]; then
      s4f7ao_fail_closed "replica_b_attestation"
      return 1
    fi
    s4f7ao_prove_replica_five_flag_runtime B "${SYNQDRIVE_REPLICA_B_PORT}" "$BACKEND_ENV" "$expected_fp" || { s4f7ao_fail_closed "replica_b_attestation"; return 1; }
    echo "REPLICA_B_RESTART=YES"
  fi

  local -a global_post=()
  mapfile -t global_post < <(s4f7j_query_global_row_db)
  s4f7ao_run_cli validate-global-prestate "${global_post[@]}" || { s4f7ao_fail_closed "post_global"; return 1; }

  local -a s4_post=()
  mapfile -t s4_post < <(s4f7j_query_s4_counts_db)
  s4f7ao_run_cli validate-s4-persistence "${s4_post[@]}" || { s4f7ao_fail_closed "post_s4"; return 1; }

  S4F7AO_RECOVERY_ARMED=0
  S4F7AO_TX_COMMITTED=1
  echo "FIVE_FLAG_PHASE1_COMMITTED=YES"
  s4f7ao_emit_terminal
  return 0
}
