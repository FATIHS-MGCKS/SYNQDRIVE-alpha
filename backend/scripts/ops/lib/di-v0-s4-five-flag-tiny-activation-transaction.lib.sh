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

s4f7ao_uses_test_stubs() {
  [[ "${DI_S4F7AO_TEST_MODE:-0}" == "1" || "${DI_S4F7J_TEST_MODE:-0}" == "1" || "${DI_S4F7AO_ENGINEERING_TEST_HARNESS:-}" == "YES" ]]
}

s4f7ao_install_test_stubs() {
  if ! s4f7ao_uses_test_stubs; then
    return 0
  fi
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() {
    local name=$1
    if [[ "${DI_S4F7AO_TEST_INJECT_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7AO_TEST_INJECT_RESTART_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_wait_healthy() { return 0; }
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
}

s4f7ao_execute_rollback() {
  local reason="${1:-unknown}"
  echo "ROLLBACK_TRIGGER=${reason}"
  S4F7AO_ROLLBACK_ATTEMPTED=1
  if [[ -z "$S4F7AO_BACKUP_FILE" || ! -f "$S4F7AO_BACKUP_FILE" ]]; then
    echo "ROLLBACK_RESULT=FAILED"
    return 1
  fi
  if [[ "${DI_S4F7AO_TEST_INJECT_BACKUP_RESTORE_FAIL:-0}" == "1" ]]; then
    echo "ROLLBACK_RESULT=FAILED"
    return 1
  fi
  cp -f "$S4F7AO_BACKUP_FILE" "$BACKEND_ENV"
  local restored_sha
  restored_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$restored_sha" != "$S4F7AO_BACKEND_ENV_SHA256_BEFORE" ]]; then
    echo "ROLLBACK_RESTORES_EXACT_ENV_BYTES=NO"
    echo "ROLLBACK_RESULT=FAILED"
    return 1
  fi
  echo "ROLLBACK_RESTORES_EXACT_ENV_BYTES=YES"
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

  local backup_dir="${SYNQDRIVE_DEPLOY_STATE_DIR:-/tmp}/s4f7ao-five-flag"
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

  if [[ "${DI_S4F7AO_TEST_INJECT_RESTART_A_FAIL:-0}" == "1" ]]; then
    s4f7ao_fail_closed "replica_a"
    return 1
  fi
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || { s4f7ao_fail_closed "replica_a"; return 1; }
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$TARGET_SHA" || { s4f7ao_fail_closed "replica_a_health"; return 1; }
  s4f7ao_prove_replica_five_flag_runtime A "${SYNQDRIVE_REPLICA_A_PORT}" "$BACKEND_ENV" "$expected_fp" || { s4f7ao_fail_closed "replica_a_attestation"; return 1; }
  echo "REPLICA_A_RESTART=YES"

  if [[ "${DI_S4F7AO_TEST_INJECT_RESTART_B_FAIL:-0}" == "1" ]]; then
    s4f7ao_fail_closed "replica_b"
    return 1
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
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
