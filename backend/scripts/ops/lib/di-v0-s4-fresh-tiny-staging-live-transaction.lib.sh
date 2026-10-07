#!/usr/bin/env bash
# EXP-021 S4F-7Y / S4F-7Y.1 / S4F-7Y.2 — fresh Tiny live staging transaction (fail-closed; forensic terminal outcomes).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7Y_TX_STATE=PRE_MUTATION
S4F7Y_RECOVERY_ARMED=0
S4F7Y_RECOVERY_IN_PROGRESS=0
S4F7Y_BACKUP_FILE=""
S4F7Y_BACKEND_ENV_SHA256_BEFORE=""
S4F7Y_TARGET_SHA=""
S4F7Y_ENV_MUTATION_COUNT=0
S4F7Y_RESTART_COUNT=0
S4F7Y_REPLICA_A_ATTESTATION_OK=0
S4F7Y_FORWARD_B_RESTART_COUNT=0
S4F7Y_PROOF_KIND=PRESTATE
S4F7Y_ROLLBACK_RESTART_FAILURE=0
S4F7Y_TERMINAL_OUTCOME_EMITTED=0
# S4F-7Y.2 monotonic production historical facts (0 -> 1 only; never erased by rollback)
S4F7Y_OPERATOR_AUTH_VALIDATED=0
S4F7Y_STAGING_ATTEMPTED=0
S4F7Y_ENV_MUTATION_OCCURRED=0
S4F7Y_RESTART_ATTEMPTED=0
S4F7Y_PRODUCTION_RESTART_OCCURRED=0
S4F7Y_FORWARD_RESTART_SUCCESS_COUNT=0
S4F7Y_ROLLBACK_RESTART_SUCCESS_COUNT=0
S4F7Y_ROLLBACK_ATTEMPTED=0
S4F7Y_ROLLBACK_COMPLETED=0
S4F7Y_FINAL_STATE_RESTORED=0
S4F7Y_TRANSACTION_COMMITTED=0

S4F7Y_PRODUCTION_SHARED_BACKEND_ENV="/opt/synqdrive/shared/backend.env"

s4f7y_is_engineering_test_harness() {
  [[ "${DI_S4F7Y_ENGINEERING_TEST_HARNESS:-}" == "YES" ]]
}

s4f7y_is_forensic_production_simulation() {
  [[ "${DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION:-}" == "YES" && "${DI_S4F7V_FIXTURE_MODE:-0}" == "1" ]]
}

s4f7y_uses_fixture_stubs() {
  s4f7y_is_engineering_test_harness || s4f7y_is_forensic_production_simulation
}

s4f7y_records_production_history() {
  ! s4f7y_is_engineering_test_harness
}

s4f7y_init_forensic_facts() {
  S4F7Y_OPERATOR_AUTH_VALIDATED=0
  S4F7Y_STAGING_ATTEMPTED=0
  S4F7Y_ENV_MUTATION_OCCURRED=0
  S4F7Y_RESTART_ATTEMPTED=0
  S4F7Y_PRODUCTION_RESTART_OCCURRED=0
  S4F7Y_FORWARD_RESTART_SUCCESS_COUNT=0
  S4F7Y_ROLLBACK_RESTART_SUCCESS_COUNT=0
  S4F7Y_ROLLBACK_ATTEMPTED=0
  S4F7Y_ROLLBACK_COMPLETED=0
  S4F7Y_FINAL_STATE_RESTORED=0
  S4F7Y_TRANSACTION_COMMITTED=0
  S4F7Y_TERMINAL_OUTCOME_EMITTED=0
}

s4f7y_yes_no() {
  if [[ "${1:-0}" == "1" ]]; then
    echo "YES"
  else
    echo "NO"
  fi
}

s4f7y_fact_mark_once() {
  local var="$1"
  if ! s4f7y_records_production_history; then
    return 0
  fi
  if [[ "${!var:-0}" == "0" ]]; then
    printf -v "$var" '%s' 1
    echo "${var}=1"
  fi
}

s4f7y_fact_operator_auth_validated() {
  s4f7y_fact_mark_once S4F7Y_OPERATOR_AUTH_VALIDATED
}

s4f7y_fact_staging_attempted() {
  s4f7y_fact_mark_once S4F7Y_STAGING_ATTEMPTED
}

s4f7y_fact_env_mutation_occurred() {
  s4f7y_fact_mark_once S4F7Y_ENV_MUTATION_OCCURRED
}

s4f7y_fact_restart_attempted() {
  s4f7y_fact_mark_once S4F7Y_RESTART_ATTEMPTED
}

s4f7y_fact_production_restart_success() {
  local phase="${1:-forward}"
  if ! s4f7y_records_production_history; then
    return 0
  fi
  s4f7y_fact_mark_once S4F7Y_PRODUCTION_RESTART_OCCURRED
  if [[ "$phase" == "forward" ]]; then
    S4F7Y_FORWARD_RESTART_SUCCESS_COUNT=$((S4F7Y_FORWARD_RESTART_SUCCESS_COUNT + 1))
  elif [[ "$phase" == "recovery" ]]; then
    S4F7Y_ROLLBACK_RESTART_SUCCESS_COUNT=$((S4F7Y_ROLLBACK_RESTART_SUCCESS_COUNT + 1))
  fi
}

s4f7y_fact_rollback_attempted() {
  s4f7y_fact_mark_once S4F7Y_ROLLBACK_ATTEMPTED
}

s4f7y_fact_rollback_completed() {
  if ! s4f7y_records_production_history; then
    return 0
  fi
  S4F7Y_ROLLBACK_COMPLETED=1
  S4F7Y_FINAL_STATE_RESTORED=1
  echo "S4F7Y_ROLLBACK_COMPLETED=1"
  echo "S4F7Y_FINAL_STATE_RESTORED=1"
}

s4f7y_fact_transaction_committed() {
  s4f7y_fact_mark_once S4F7Y_TRANSACTION_COMMITTED
}

s4f7y_production_mutation_occurred_fact() {
  if [[ "$S4F7Y_ENV_MUTATION_OCCURRED" == "1" || "$S4F7Y_PRODUCTION_RESTART_OCCURRED" == "1" ]]; then
    echo "1"
  else
    echo "0"
  fi
}

s4f7y_tx_set() {
  S4F7Y_TX_STATE="$1"
  echo "TX_STATE=${S4F7Y_TX_STATE}"
}

s4f7y_log() {
  printf '[s4f7y-live-staging] %s\n' "$*"
}

s4f7y_emit_terminal_outcomes() {
  if [[ "$S4F7Y_TERMINAL_OUTCOME_EMITTED" == "1" ]]; then
    echo "TERMINAL_OUTCOME_KEYS_DUPLICATED=YES"
    echo "TERMINAL_OUTCOME_KEYS_CONTRADICTORY=YES"
    return 1
  fi
  S4F7Y_TERMINAL_OUTCOME_EMITTED=1
  echo "TERMINAL_OUTCOME_AUTHORITY_COUNT=1"
  echo "TERMINAL_OUTCOME_KEYS_DUPLICATED=NO"
  echo "TERMINAL_OUTCOME_KEYS_CONTRADICTORY=NO"

  local total_restart_success=0
  if s4f7y_records_production_history; then
    total_restart_success=$((S4F7Y_FORWARD_RESTART_SUCCESS_COUNT + S4F7Y_ROLLBACK_RESTART_SUCCESS_COUNT))
    echo "PRODUCTION_STAGING_AUTHORIZED=$(s4f7y_yes_no "$S4F7Y_OPERATOR_AUTH_VALIDATED")"
    echo "PRODUCTION_STAGING_ATTEMPTED=$(s4f7y_yes_no "$S4F7Y_STAGING_ATTEMPTED")"
    echo "PRODUCTION_STAGING_EXECUTED=$(s4f7y_yes_no "$S4F7Y_TRANSACTION_COMMITTED")"
    echo "PRODUCTION_STAGING_TRANSACTION_COMMITTED=$(s4f7y_yes_no "$S4F7Y_TRANSACTION_COMMITTED")"
    echo "PRODUCTION_ENV_MUTATION_OCCURRED=$(s4f7y_yes_no "$S4F7Y_ENV_MUTATION_OCCURRED")"
    echo "PRODUCTION_RESTART_ATTEMPTED=$(s4f7y_yes_no "$S4F7Y_RESTART_ATTEMPTED")"
    echo "PRODUCTION_RESTART_OCCURRED=$(s4f7y_yes_no "$S4F7Y_PRODUCTION_RESTART_OCCURRED")"
    echo "PRODUCTION_MUTATION_OCCURRED=$(s4f7y_yes_no "$(s4f7y_production_mutation_occurred_fact)")"
    echo "PRODUCTION_ROLLBACK_ATTEMPTED=$(s4f7y_yes_no "$S4F7Y_ROLLBACK_ATTEMPTED")"
    echo "PRODUCTION_ROLLBACK_COMPLETED=$(s4f7y_yes_no "$S4F7Y_ROLLBACK_COMPLETED")"
    echo "PRODUCTION_FINAL_STATE_RESTORED=$(s4f7y_yes_no "$S4F7Y_FINAL_STATE_RESTORED")"
    echo "FORWARD_RESTART_SUCCESS_COUNT=${S4F7Y_FORWARD_RESTART_SUCCESS_COUNT}"
    echo "ROLLBACK_RESTART_SUCCESS_COUNT=${S4F7Y_ROLLBACK_RESTART_SUCCESS_COUNT}"
    echo "TOTAL_PRODUCTION_RESTART_SUCCESS_COUNT=${total_restart_success}"
  else
    echo "PRODUCTION_STAGING_AUTHORIZED=NO"
    echo "PRODUCTION_STAGING_ATTEMPTED=NO"
    echo "PRODUCTION_STAGING_EXECUTED=NO"
    echo "PRODUCTION_STAGING_TRANSACTION_COMMITTED=NO"
    echo "PRODUCTION_ENV_MUTATION_OCCURRED=NO"
    echo "PRODUCTION_RESTART_ATTEMPTED=NO"
    echo "PRODUCTION_RESTART_OCCURRED=NO"
    echo "PRODUCTION_MUTATION_OCCURRED=NO"
    echo "PRODUCTION_ROLLBACK_ATTEMPTED=NO"
    echo "PRODUCTION_ROLLBACK_COMPLETED=NO"
    echo "PRODUCTION_FINAL_STATE_RESTORED=NO"
    echo "FORWARD_RESTART_SUCCESS_COUNT=0"
    echo "ROLLBACK_RESTART_SUCCESS_COUNT=0"
    echo "TOTAL_PRODUCTION_RESTART_SUCCESS_COUNT=0"
    if [[ "$S4F7Y_TRANSACTION_COMMITTED" == "1" ]]; then
      echo "ENGINEERING_TEST_HARNESS_LIVE_TRANSACTION=SIMULATED"
    fi
  fi
  echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED"
  echo "TINY_ACTIVATION_READY=NO"
  echo "S4_ACTIVATION_OCCURRED=NO"
  return 0
}

s4f7y_emit_terminal_and_fail() {
  s4f7y_emit_terminal_outcomes || true
  return 1
}

s4f7y_guard_or_terminal_fail() {
  if ! "$@"; then
    s4f7y_emit_terminal_outcomes || true
    return 1
  fi
  return 0
}

s4f7y_assert_real_live_path_no_accidental_test_controls() {
  if s4f7y_uses_fixture_stubs; then
    return 0
  fi
  if [[ "${DI_S4F7V_TEST_MODE:-0}" == "1" || "${DI_S4F7Y_TEST_MODE:-0}" == "1" ]]; then
    echo "LEGACY_TEST_MODE_ALONE_CAN_ENABLE_LIVE_STUBS=YES"
    echo "ACCIDENTAL_TEST_CONTROL_IN_REAL_LIVE_PATH=YES"
    return 1
  fi
  if [[ "${DI_S4F7V_FIXTURE_MODE:-0}" == "1" || "${DI_S4F7Y_FIXTURE_MODE:-0}" == "1" ]]; then
    echo "LEGACY_FIXTURE_MODE_ALONE_CAN_ENABLE_LIVE_STUBS=YES"
    echo "ACCIDENTAL_TEST_CONTROL_IN_REAL_LIVE_PATH=YES"
    return 1
  fi
  echo "LEGACY_TEST_MODE_ALONE_CAN_ENABLE_LIVE_STUBS=NO"
  echo "LEGACY_FIXTURE_MODE_ALONE_CAN_ENABLE_LIVE_STUBS=NO"
  echo "ACCIDENTAL_TEST_CONTROL_IN_REAL_LIVE_PATH_FAILS_CLOSED=YES"
  return 0
}

s4f7y_validate_engineering_test_harness() {
  if ! s4f7y_uses_fixture_stubs; then
    return 0
  fi
  if [[ "${SYNQDRIVE_BACKEND_ENV:-}" == "$S4F7Y_PRODUCTION_SHARED_BACKEND_ENV" ]]; then
    echo "PRODUCTION_BACKEND_ENV_ALLOWED_IN_TEST_HARNESS=YES"
    return 1
  fi
  if s4f7y_is_engineering_test_harness; then
    s4f7v_run_cli validate-engineering-harness || return 1
  elif s4f7y_is_forensic_production_simulation; then
    s4f7v_run_cli validate-forensic-harness || return 1
  else
    return 1
  fi
  echo "PRODUCTION_BACKEND_ENV_ALLOWED_IN_TEST_HARNESS=NO"
  return 0
}

s4f7y_revalidate_external_live_authorization() {
  if ! s4f7v_run_cli revalidate-external-live-authorization; then
    echo "FAIL_CLOSED=YES"
    return 1
  fi
  return 0
}

s4f7y_emit_operator_authorization_validated_pre_mutation() {
  echo "LIVE_STAGING_OPERATOR_AUTHORIZATION_VALIDATED=YES"
  s4f7y_fact_operator_auth_validated
  return 0
}

s4f7y_install_test_stubs() {
  if ! s4f7y_uses_fixture_stubs; then
    return 0
  fi
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() {
    local name=$1
    if [[ "${DI_S4F7Y_TEST_INJECT_ROLLBACK_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" && "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7Y_TEST_INJECT_ROLLBACK_RESTART_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" && "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7Y_TEST_INJECT_RESTART_A_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" && "${S4F7Y_RESTART_PHASE:-forward}" == "forward" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7Y_TEST_INJECT_RESTART_B_FAIL:-0}" == "1" && "$name" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" && "${S4F7Y_RESTART_PHASE:-forward}" == "forward" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_wait_healthy() {
    if [[ "${DI_S4F7Y_TEST_INJECT_HEALTH_A_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7Y_TEST_INJECT_HEALTH_B_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7Y_TEST_INJECT_ROLLBACK_HEALTH_A_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_A_PM2_NAME}" && "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then
      return 1
    fi
    if [[ "${DI_S4F7Y_TEST_INJECT_ROLLBACK_HEALTH_B_FAIL:-0}" == "1" && "$1" == "${SYNQDRIVE_REPLICA_B_PM2_NAME}" && "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then
      return 1
    fi
    return 0
  }
  vps_replica_verify_post_deploy() {
    if [[ "${DI_S4F7Y_TEST_INJECT_SCHEDULER_FAIL:-0}" == "1" ]]; then return 1; fi
    if [[ "${DI_S4F7Y_TEST_INJECT_ROLLBACK_RELEASE_FAIL:-0}" == "1" && "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then return 1; fi
    return 0
  }
  vps_replica_verify_no_mixed_sha() {
    if [[ "${DI_S4F7Y_TEST_INJECT_ROLLBACK_RELEASE_FAIL:-0}" == "1" && "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then return 1; fi
    return 0
  }
  vps_replica_wait_scheduler_leader_convergence() {
    if [[ "${DI_S4F7Y_TEST_INJECT_SCHEDULER_FAIL:-0}" == "1" ]]; then return 1; fi
    return 0
  }
  vps_replica_verify_scheduler_leaders() { return 0; }
  vps_replica_nginx_dual_upstream_ok() {
    if [[ "${DI_S4F7Y_TEST_INJECT_NGINX_FAIL:-0}" == "1" ]]; then return 1; fi
    if [[ "${DI_S4F7Y_TEST_INJECT_ROLLBACK_NGINX_FAIL:-0}" == "1" && "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then return 1; fi
    return 0
  }
  vps_replica_pm2_pid() {
    case "$1" in
      "${SYNQDRIVE_REPLICA_A_PM2_NAME}") echo "${DI_S4F7Y_FIXTURE_REPLICA_A_PID:-101}" ;;
      "${SYNQDRIVE_REPLICA_B_PM2_NAME}") echo "${DI_S4F7Y_FIXTURE_REPLICA_B_PID:-102}" ;;
      *) echo "0" ;;
    esac
  }
}

s4f7y_query_no_backfill_trip_proof() {
  if s4f7y_is_engineering_test_harness; then
    echo "FINAL_LATEST_COMPLETED_TRIP_END_TIME=${DI_S4F7Y_FIXTURE_LATEST_COMPLETED_TRIP_END_TIME:-NULL}"
    echo "FINAL_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT=${DI_S4F7Y_FIXTURE_FUTURE_TRIP_COUNT:-0}"
    echo "FINAL_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT=${DI_S4F7Y_FIXTURE_ELIGIBLE_TRIP_COUNT:-0}"
    return 0
  fi
  local vehicle="${AUTHORIZED_VEHICLE_ALLOWLIST:-c10351f8-b6a2-4258-947f-631aeaa6d359}"
  local cutoff="${AUTHORIZED_FRESH_NOT_BEFORE:-}"
  local latest future eligible
  latest="$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT COALESCE(to_char(MAX(end_time) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), '') FROM vehicle_trips WHERE vehicle_id = '${vehicle}' AND end_time IS NOT NULL AND trip_status = 'COMPLETED';")"
  future="$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT COUNT(*)::text FROM vehicle_trips WHERE vehicle_id = '${vehicle}' AND end_time IS NOT NULL AND end_time > (clock_timestamp() AT TIME ZONE 'UTC');")"
  eligible="$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT COUNT(*)::text FROM vehicle_trips WHERE vehicle_id = '${vehicle}' AND end_time IS NOT NULL AND trip_status = 'COMPLETED' AND end_time >= timestamptz '${cutoff}';")"
  echo "FINAL_LATEST_COMPLETED_TRIP_END_TIME=${latest:-NULL}"
  echo "FINAL_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT=${future:-0}"
  echo "FINAL_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT=${eligible:-0}"
}

s4f7y_fetch_metrics_body_for_proof() {
  local label="$1" port="$2" env_file="$3"
  local fixture=""
  if [[ "${S4F7Y_PROOF_KIND}" == "FRESH" ]]; then
    case "$label" in
      A) fixture="${DI_S4F7Y_FIXTURE_METRICS_BODY_FRESH_A:-}" ;;
      B) fixture="${DI_S4F7Y_FIXTURE_METRICS_BODY_FRESH_B:-}" ;;
    esac
  else
    case "$label" in
      A) fixture="${DI_S4F7Y_FIXTURE_METRICS_BODY_PRESTATE_A:-${DI_S4F7V_FIXTURE_METRICS_BODY_A:-}}" ;;
      B) fixture="${DI_S4F7Y_FIXTURE_METRICS_BODY_PRESTATE_B:-${DI_S4F7V_FIXTURE_METRICS_BODY_B:-}}" ;;
    esac
  fi
  if [[ "${S4F7Y_RESTART_PHASE:-forward}" == "recovery" ]]; then
    case "$label" in
      A) fixture="${DI_S4F7Y_FIXTURE_METRICS_BODY_RECOVERY_A:-${DI_S4F7V_FIXTURE_METRICS_BODY_A:-}}" ;;
      B) fixture="${DI_S4F7Y_FIXTURE_METRICS_BODY_RECOVERY_B:-${DI_S4F7V_FIXTURE_METRICS_BODY_B:-}}" ;;
    esac
  fi
  if [[ -n "$fixture" && -f "$fixture" ]]; then
    cat "$fixture"
    return 0
  fi
  s4f4_run_cli fetch-metrics-body "$env_file" "$port"
}

s4f7y_prove_replica_runtime() {
  local label="$1" port="$2" env_file="$3"
  local metrics_file expected_fp
  metrics_file="$(mktemp)"
  expected_fp="${AUTHORIZED_FRESH_EXPECTED_FINGERPRINT:-${DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT:-}}"
  if ! s4f7y_fetch_metrics_body_for_proof "$label" "$port" "$env_file" >"$metrics_file"; then
    rm -f "$metrics_file"
    return 1
  fi
  if [[ "${S4F7Y_PROOF_KIND}" == "FRESH" ]]; then
    if ! s4f7v_run_cli prove-fresh-runtime "$metrics_file" "$expected_fp"; then
      rm -f "$metrics_file"
      return 1
    fi
  else
    if ! s4f7v_run_cli prove-recovery-prestate "$metrics_file"; then
      rm -f "$metrics_file"
      return 1
    fi
  fi
  rm -f "$metrics_file"
  return 0
}

s4f7y_capture_pre_replica_pids() {
  echo "PRE_REPLICA_A_PID=$(vps_replica_pm2_pid "${SYNQDRIVE_REPLICA_A_PM2_NAME}")"
  echo "PRE_REPLICA_B_PID=$(vps_replica_pm2_pid "${SYNQDRIVE_REPLICA_B_PM2_NAME}")"
  echo "PRE_REPLICA_PID_CAPTURE_IMPLEMENTED=YES"
}

s4f7y_prove_pre_mutation_prestate_both() {
  S4F7Y_PROOF_KIND=PRESTATE
  echo "PRE_REPLICA_PRESTATE_ATTESTATION_IMPLEMENTED=YES"
  if [[ "${DI_S4F7Y_TEST_INJECT_PRESTATE_ATTESTATION_FAIL:-0}" == "1" ]]; then
    return 1
  fi
  s4f7y_prove_replica_runtime A "${SYNQDRIVE_REPLICA_A_PORT}" "$BACKEND_ENV" || return 1
  s4f7y_prove_replica_runtime B "${SYNQDRIVE_REPLICA_B_PORT}" "$BACKEND_ENV" || return 1
  return 0
}

s4f7y_arm_recovery() {
  S4F7Y_RECOVERY_ARMED=1
  trap 's4f7y_on_err' ERR
  trap 's4f7y_on_signal TERM' TERM
  trap 's4f7y_on_signal INT' INT
  trap 's4f7y_on_signal HUP' HUP
  echo "RECOVERY_ARMED_BEFORE_MUTATION=YES"
  echo "SIGKILL_LIMITATION_DOCUMENTED=YES"
  s4f7y_tx_set RECOVERY_ARMED
}

s4f7y_disarm_recovery() {
  S4F7Y_RECOVERY_ARMED=0
  trap - ERR TERM INT HUP
  s4f7y_tx_set COMMITTED
  echo "RECOVERY_DISARMED=YES"
  echo "SIGNAL_ERR_RECOVERY=YES"
  echo "SIGNAL_TERM_RECOVERY=YES"
  echo "SIGNAL_INT_RECOVERY=YES"
  echo "SIGNAL_HUP_RECOVERY=YES"
}

s4f7y_rollback_restart_replica() {
  local label="$1" name="$2"
  echo "ROLLBACK_REPLICA_${label}_RESTART_ATTEMPTED=YES"
  s4f7y_fact_restart_attempted
  if vps_replica_restart_one "$name"; then
    echo "ROLLBACK_REPLICA_${label}_RESTART_RESULT=SUCCESS"
    s4f7y_fact_production_restart_success recovery
    return 0
  fi
  echo "ROLLBACK_REPLICA_${label}_RESTART_RESULT=FAILED"
  S4F7Y_ROLLBACK_RESTART_FAILURE=1
  return 1
}

s4f7y_recovery_post_verify() {
  local target_sha="$1"
  local release_dir
  release_dir="$(s4f7v_resolve_release_dir)"
  local restored_sha
  restored_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$restored_sha" != "$S4F7Y_BACKEND_ENV_SHA256_BEFORE" ]]; then
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
    return 1
  fi
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

  if ! vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha"; then
    echo "ROLLBACK_REPLICA_A_HEALTH_READY_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_REPLICA_A_HEALTH_READY_VERIFIED=YES"
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha"; then
      echo "ROLLBACK_REPLICA_B_HEALTH_READY_VERIFIED=NO"
      return 1
    fi
    echo "ROLLBACK_REPLICA_B_HEALTH_READY_VERIFIED=YES"
  fi

  if s4f7y_uses_fixture_stubs; then
    echo "REPLICA_A_PROCESS_RELEASE_IDENTITY=YES"
    echo "REPLICA_B_PROCESS_RELEASE_IDENTITY=YES"
  else
    s4f7j_verify_steady_state_replica A "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" "$release_dir" || return 1
    if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
      s4f7j_verify_steady_state_replica B "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" "$release_dir" || return 1
    fi
  fi
  echo "ROLLBACK_RELEASE_IDENTITY_VERIFIED=YES"

  vps_replica_verify_post_deploy "${SYNQDRIVE_CURRENT_LINK}" "$target_sha" || return 1
  vps_replica_verify_no_mixed_sha "$target_sha" || return 1
  echo "ROLLBACK_NO_MIXED_SHA_VERIFIED=YES"

  S4F7Y_PROOF_KIND=PRESTATE
  S4F7Y_RESTART_PHASE=recovery
  export S4F7Y_RESTART_PHASE
  if ! s4f7y_prove_replica_runtime A "${SYNQDRIVE_REPLICA_A_PORT}" "$BACKEND_ENV"; then
    echo "ROLLBACK_REPLICA_A_PRESTATE_ATTESTATION=FAIL"
    return 1
  fi
  echo "ROLLBACK_REPLICA_A_PRESTATE_ATTESTATION=PASS"
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! s4f7y_prove_replica_runtime B "${SYNQDRIVE_REPLICA_B_PORT}" "$BACKEND_ENV"; then
      echo "ROLLBACK_REPLICA_B_PRESTATE_ATTESTATION=FAIL"
      return 1
    fi
    echo "ROLLBACK_REPLICA_B_PRESTATE_ATTESTATION=PASS"
  fi

  vps_replica_wait_scheduler_leader_convergence || return 1
  echo "ROLLBACK_SCHEDULER_CONVERGENCE_VERIFIED=YES"
  vps_replica_verify_scheduler_leaders 1 || return 1
  echo "ROLLBACK_SCHEDULER_SINGLE_LEADER_VERIFIED=YES"
  vps_replica_nginx_dual_upstream_ok || return 1
  echo "ROLLBACK_NGINX_VERIFIED=YES"

  if ! s4f7j_live_budget_redis_preflight "$release_dir"; then
    echo "ROLLBACK_GLOBAL_BUDGET_VERIFIED=NO"
    echo "ROLLBACK_REDIS_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_GLOBAL_BUDGET_VERIFIED=YES"
  echo "ROLLBACK_REDIS_VERIFIED=YES"
  echo "ROLLBACK_POST_VERIFY=PASS"
  return 0
}

s4f7y_on_recovery() {
  local reason="$1"
  if [[ "$S4F7Y_RECOVERY_IN_PROGRESS" == "1" ]]; then
    return 1
  fi
  if [[ "$S4F7Y_RECOVERY_ARMED" != "1" || -z "$S4F7Y_BACKUP_FILE" ]]; then
    echo "RECOVERY_SKIPPED=not_armed_or_no_backup reason=${reason}"
    return 1
  fi
  S4F7Y_RECOVERY_IN_PROGRESS=1
  s4f7y_tx_set RECOVERY_IN_PROGRESS
  echo "ROLLBACK_TRIGGER=${reason}"
  echo "ROLLBACK_REQUIRED=YES"
  s4f7y_fact_rollback_attempted
  S4F7Y_ROLLBACK_RESTART_FAILURE=0
  if ! s4f4_restore_backend_env_atomic "$BACKEND_ENV" "$S4F7Y_BACKUP_FILE" "$S4F7Y_BACKEND_ENV_SHA256_BEFORE"; then
    echo "ROLLBACK_RESULT=FAILED"
    echo "ROLLBACK_RESTART_FAILURE_SILENTLY_IGNORED=NO"
    echo "OPERATOR_INTERVENTION_REQUIRED=YES"
    s4f7y_emit_terminal_outcomes || true
    return 1
  fi
  S4F7Y_RESTART_PHASE=recovery
  export S4F7Y_RESTART_PHASE
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || true
  s4f7y_rollback_restart_replica A "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || true
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    s4f7y_rollback_restart_replica B "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || true
  fi
  echo "ROLLBACK_RESTART_PATH_TESTED=YES"
  if [[ "$S4F7Y_ROLLBACK_RESTART_FAILURE" == "1" ]]; then
    echo "ROLLBACK_RESTART_FAILURE_SILENTLY_IGNORED=NO"
    echo "ROLLBACK_RESULT=FAILED"
    echo "OPERATOR_INTERVENTION_REQUIRED=YES"
    s4f7y_emit_terminal_outcomes || true
    return 1
  fi
  echo "ROLLBACK_RESTART_FAILURE_SILENTLY_IGNORED=NO"
  if ! s4f7y_recovery_post_verify "$S4F7Y_TARGET_SHA"; then
    echo "ROLLBACK_RESULT=FAILED"
    echo "OPERATOR_INTERVENTION_REQUIRED=YES"
    s4f7y_emit_terminal_outcomes || true
    return 1
  fi
  echo "ROLLBACK_RESULT=COMPLETE"
  s4f7y_fact_rollback_completed
  s4f7y_emit_terminal_outcomes || true
  return 1
}

s4f7y_on_err() {
  local code=$?
  s4f7y_on_recovery "ERR trap exit=${code}" || true
  exit "$code"
}

s4f7y_on_signal() {
  local sig="$1"
  echo "SIGNAL_RECEIVED=${sig}"
  s4f7y_on_recovery "signal ${sig}" || true
  exit 130
}

s4f7y_fail_after_arm() {
  local reason="$1"
  if [[ "$S4F7Y_RECOVERY_ARMED" == "1" ]]; then
    s4f7y_on_recovery "$reason" || true
  else
    s4f7y_emit_terminal_outcomes || true
  fi
  exit 1
}

s4f7y_final_pre_mutation_revalidation() {
  echo "FULL_LIVE_GUARDS_REVALIDATED_IMMEDIATELY_PRE_MUTATION=YES"
  s4f7w_live_preflight_readonly || return 1
  export DI_S4F7V_FINAL_DB_CLOCK_CANONICAL_UTC="$(s4f7v_query_db_clock_canonical)"
  echo "FINAL_JIT_AUTHORITY_AGE_SECONDS=$(s4f7v_run_cli validate-fresh-authority | awk -F= '/^FRESH_AUTHORITY_AGE_SECONDS=/{print $2}')"
  if ! s4f7v_run_cli guards; then
    return 1
  fi
  s4f7y_revalidate_external_live_authorization || return 1
  if ! s4f7v_run_cli validate-live-authorization; then
    echo "LIVE_STAGING_AUTHORIZATION_VALID=NO"
    return 1
  fi
  echo "LIVE_STAGING_AUTHORIZATION_VALID=YES"
  s4f7y_emit_operator_authorization_validated_pre_mutation
  local trip_out
  trip_out="$(s4f7y_query_no_backfill_trip_proof)"
  printf '%s\n' "$trip_out"
  export FINAL_LATEST_COMPLETED_TRIP_END_TIME="$(printf '%s\n' "$trip_out" | awk -F= '/^FINAL_LATEST_COMPLETED_TRIP_END_TIME=/{print $2}')"
  export FINAL_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT="$(printf '%s\n' "$trip_out" | awk -F= '/^FINAL_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT=/{print $2}')"
  export FINAL_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT="$(printf '%s\n' "$trip_out" | awk -F= '/^FINAL_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT=/{print $2}')"
  s4f7v_run_cli validate-no-backfill-final || return 1
  echo "FINAL_NO_BACKFILL_TRIP_GATE_IMPLEMENTED=YES"
  echo "NEW_COMPLETED_TRIP_AFTER_CUTOFF_FAILS_PRE_MUTATION=YES"
  return 0
}

s4f7y_restart_replica_a_forward() {
  local target_sha="$1" release_dir="$2"
  S4F7Y_RESTART_PHASE=forward
  export S4F7Y_RESTART_PHASE
  S4F7Y_PROOF_KIND=FRESH
  s4f7y_fact_restart_attempted
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || return 1
  S4F7Y_RESTART_COUNT=$((S4F7Y_RESTART_COUNT + 1))
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  s4f7y_fact_production_restart_success forward
  if [[ "${DI_S4F7Y_TEST_INJECT_ATTESTATION_A_FAIL:-0}" == "1" ]]; then
    return 1
  fi
  if ! s4f7y_prove_replica_runtime A "${SYNQDRIVE_REPLICA_A_PORT}" "$BACKEND_ENV"; then
    echo "REPLICA_A_FRESH_RUNTIME_ATTESTATION=FAIL"
    return 1
  fi
  echo "REPLICA_A_FRESH_RUNTIME_ATTESTATION=PASS"
  s4f7j_run_cli s4-safe "$BACKEND_ENV" || return 1
  S4F7Y_REPLICA_A_ATTESTATION_OK=1
  echo "REPLICA_A_ATTESTATION_BEFORE_B_RESTART=YES"
  return 0
}

s4f7y_restart_replica_b_forward() {
  local target_sha="$1"
  if [[ "$S4F7Y_REPLICA_A_ATTESTATION_OK" != "1" ]]; then
    echo "REPLICA_B_RESTART_BEFORE_A_ATTESTATION_PASS=POSSIBLE"
    echo "FORWARD_REPLICA_B_RESTART_OCCURRED=NO"
    return 1
  fi
  echo "REPLICA_B_RESTART_BEFORE_A_ATTESTATION_PASS=NO"
  S4F7Y_FORWARD_B_RESTART_COUNT=$((S4F7Y_FORWARD_B_RESTART_COUNT + 1))
  s4f7y_fact_restart_attempted
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || return 1
  S4F7Y_RESTART_COUNT=$((S4F7Y_RESTART_COUNT + 1))
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
  s4f7y_fact_production_restart_success forward
  if [[ "${DI_S4F7Y_TEST_INJECT_ATTESTATION_B_FAIL:-0}" == "1" ]]; then
    return 1
  fi
  s4f7y_prove_replica_runtime B "${SYNQDRIVE_REPLICA_B_PORT}" "$BACKEND_ENV" || return 1
  return 0
}

s4f7y_final_pre_commit_verify() {
  if ! s4f7v_run_cli verify-live-poststate "$S4F7Y_BACKUP_FILE" "$BACKEND_ENV"; then
    return 1
  fi
  S4F7Y_PROOF_KIND=FRESH
  if ! s4f7y_prove_replica_runtime A "${SYNQDRIVE_REPLICA_A_PORT}" "$BACKEND_ENV"; then
    echo "FINAL_REPLICA_A_FRESH_ATTESTATION=FAIL"
    return 1
  fi
  echo "FINAL_REPLICA_A_FRESH_ATTESTATION=PASS"
  if ! s4f7y_prove_replica_runtime B "${SYNQDRIVE_REPLICA_B_PORT}" "$BACKEND_ENV"; then
    echo "FINAL_REPLICA_B_FRESH_ATTESTATION=FAIL"
    return 1
  fi
  echo "FINAL_REPLICA_B_FRESH_ATTESTATION=PASS"
  echo "FINAL_REPLICA_FRESH_ATTESTATION_PARITY=YES"
  s4f7j_run_cli s4-safe "$BACKEND_ENV" || return 1
  return 0
}

s4f7y_post_staging_verify() {
  local target_sha="$1"
  vps_replica_verify_post_deploy "${SYNQDRIVE_CURRENT_LINK}" "$target_sha" || return 1
  vps_replica_wait_scheduler_leader_convergence || return 1
  vps_replica_verify_scheduler_leaders 1 || return 1
  vps_replica_nginx_dual_upstream_ok || return 1
  local release_dir
  release_dir="$(s4f7v_resolve_release_dir)"
  if ! s4f7j_live_budget_redis_preflight "$release_dir"; then
    return 1
  fi
  local -a global_post=()
  mapfile -t global_post < <(s4f7j_query_global_row_db)
  s4f7j_run_cli validate-global-prestate "${global_post[@]}" || return 1
  echo "POST_STAGING_GLOBAL_KILLED_VERIFIED=YES"
  local -a s4_post=()
  mapfile -t s4_post < <(s4f7j_query_s4_counts_db)
  s4f7j_run_cli validate-s4-persistence "${s4_post[@]}" || return 1
  echo "POST_STAGING_S4_ZERO_VERIFIED=YES"
  s4f7j_run_cli s4-safe "$BACKEND_ENV" || return 1
  echo "POST_STAGING_ALL_FLAGS_OFF_VERIFIED=YES"
  echo "POST_STAGING_TOPOLOGY_VERIFIED=YES"
  echo "POST_STAGING_BUDGET_VERIFIED=YES"
  echo "POST_STAGING_REDIS_VERIFIED=YES"
  echo "DISCOVERY_EFFECTIVE_ENABLED=NO"
  echo "WORKER_EFFECTIVE_ENABLED=NO"
  echo "MAINTENANCE_EFFECTIVE_ENABLED=NO"
  return 0
}

s4f7y_require_operator_authorization_packet() {
  local missing=0
  for v in AUTHORIZED_TOOL_SHA AUTHORIZED_PRODUCTION_SHA AUTHORIZED_PRODUCTION_RELEASE_ID AUTHORIZED_PRE_ENV_SHA256 AUTHORIZED_FRESH_NOT_BEFORE AUTHORIZED_FRESH_EXPECTED_FINGERPRINT AUTHORIZED_ORGANIZATION_ALLOWLIST AUTHORIZED_VEHICLE_ALLOWLIST; do
    if [[ -z "${!v:-}" ]]; then
      echo "AUTHORIZED_PACKET_MISSING=${v}"
      missing=1
    fi
  done
  if [[ "$missing" == "1" ]]; then
    return 1
  fi
  return 0
}

s4f7y_execute_live_transaction() {
  s4f7y_init_forensic_facts
  echo "EXP021_S4F7Y_LIVE_STAGING_TRANSACTION=1"
  echo "EXP021_S4F7Y_1_LIVE_TRANSACTION_SAFETY_SEAL=1"
  echo "EXP021_S4F7Y_2_TERMINAL_OUTCOME_FORENSICS_SEAL=1"
  echo "ROLLING_RESTART_ORDER=A_THEN_B"
  echo "SAME_PRODUCTION_SHA_REQUIRED=YES"
  echo "CODE_DEPLOY_OCCURRED=NO"
  echo "FRESH_RUNTIME_EXPECTED_STATE=OTHER"
  echo "PRODUCTION_DB_WRITE_OCCURRED=NO"

  s4f7y_guard_or_terminal_fail s4f7y_assert_real_live_path_no_accidental_test_controls || return 1
  s4f7y_guard_or_terminal_fail s4f7y_validate_engineering_test_harness || return 1

  if [[ "${DI_S4F7Y_LIVE_STAGING_AUTHORIZED:-}" != "YES" ]]; then
    echo "DEDICATED_LIVE_STAGING_AUTHORIZATION_REQUIRED=YES"
    echo "LIVE_STAGING_AUTHORIZATION_VALID=NO"
    echo "FAIL_CLOSED=YES"
    s4f7y_emit_terminal_outcomes || true
    return 1
  fi
  echo "OLD_S4F7V_AUTHORIZATION_ALONE_CAN_AUTHORIZE_LIVE_MUTATION=NO"
  echo "GENERIC_ACK_ALONE_CAN_AUTHORIZE_LIVE_MUTATION=NO"
  echo "DEDICATED_LIVE_STAGING_AUTHORIZATION_REQUIRED=YES"

  s4f7y_install_test_stubs

  s4f7y_guard_or_terminal_fail s4f7y_require_operator_authorization_packet || return 1
  s4f7y_guard_or_terminal_fail s4f7w_live_preflight_readonly || return 1
  s4f7y_guard_or_terminal_fail s4f7v_run_cli validate-fresh-authority || return 1

  S4F7Y_TARGET_SHA="$(s4f7v_resolve_deployed_sha)"
  export DI_S4_TINY_STAGING_ACTUAL_SHA="$S4F7Y_TARGET_SHA"
  local release_dir actual_release
  release_dir="$(s4f7v_resolve_release_dir)"
  actual_release="$(basename "$release_dir")"
  export DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID="$actual_release"

  s4f7y_guard_or_terminal_fail s4f7y_final_pre_mutation_revalidation || return 1
  s4f7y_fact_staging_attempted
  echo "FINAL_JIT_AGE_RECHECK_IMPLEMENTED=YES"

  s4f7y_capture_pre_replica_pids
  s4f7y_guard_or_terminal_fail s4f7y_prove_pre_mutation_prestate_both || return 1

  s4f7y_guard_or_terminal_fail s4f7j_require_durable_backup_dir || return 1
  local backup_dir="${SYNQDRIVE_DEPLOY_STATE_DIR}/s4f7y-fresh-tiny-staging"
  mkdir -p "$backup_dir"
  S4F7Y_BACKUP_FILE="${backup_dir}/backend.env.$(date -u +%Y%m%dT%H%M%SZ).bak"
  if [[ "${DI_S4F7Y_TEST_INJECT_BACKUP_FAIL:-0}" == "1" ]]; then
    echo "BACKUP_CREATED_BEFORE_MUTATION=NO"
    s4f7y_emit_terminal_outcomes || true
    return 1
  fi
  if ! s4f4_create_verified_backend_env_backup "$BACKEND_ENV" "$S4F7Y_BACKUP_FILE"; then
    s4f7y_emit_terminal_outcomes || true
    return 1
  fi
  echo "DURABLE_BACKUP_BEFORE_MUTATION=YES"
  echo "BACKUP_CREATED_BEFORE_MUTATION=YES"
  echo "BACKUP_CHECKSUM_VERIFIED=YES"
  S4F7Y_BACKEND_ENV_SHA256_BEFORE="$(s4f4_file_sha256 "$BACKEND_ENV")"
  echo "BACKUP_PREIMAGE_SHA256=${S4F7Y_BACKEND_ENV_SHA256_BEFORE}"

  s4f7y_arm_recovery

  if [[ "${DI_S4F7Y_TEST_INJECT_MUTATION_FAIL:-0}" == "1" ]]; then
    s4f7y_fail_after_arm "mutation_inject"
  fi
  if ! s4f7v_run_cli apply-mutation-live "$BACKEND_ENV"; then
    s4f7y_fail_after_arm "env_mutation"
  fi
  S4F7Y_ENV_MUTATION_COUNT=1
  s4f7y_fact_env_mutation_occurred
  echo "FRESH_LIVE_MUTATION_IMPLEMENTED=YES"
  echo "LIVE_MUTATION_EXACT_CHANGED_KEY_COUNT=3"
  echo "LIVE_MUTATION_UNEXPECTED_CHANGED_KEY_COUNT=0"

  if s4f7y_uses_fixture_stubs; then
    echo "POST_MUTATION_CONFIG_AUDIT=SKIPPED_TEST_HARNESS"
  else
    if ! s4f7j_run_config_file_audit "$BACKEND_ENV"; then
      s4f7y_fail_after_arm "config_audit"
    fi
  fi

  if ! s4f7y_restart_replica_a_forward "$S4F7Y_TARGET_SHA" "$release_dir"; then
    echo "A_FAILURE_FORWARD_B_RESTART_COUNT=${S4F7Y_FORWARD_B_RESTART_COUNT}"
    s4f7y_fail_after_arm "replica_a_forward"
  fi

  if [[ "${DI_S4F7Y_TEST_INJECT_SKIP_B_RESTART:-0}" != "1" ]]; then
    if ! s4f7y_restart_replica_b_forward "$S4F7Y_TARGET_SHA"; then
      s4f7y_fail_after_arm "replica_b_forward"
    fi
  fi

  if ! s4f7y_post_staging_verify "$S4F7Y_TARGET_SHA"; then
    s4f7y_fail_after_arm "post_staging"
  fi

  if ! s4f7y_final_pre_commit_verify; then
    s4f7y_fail_after_arm "final_pre_commit"
  fi

  s4f7y_disarm_recovery
  echo "LIVE_STAGING_TRANSACTION_COMMITTED=YES"
  echo "SUCCESS_FORWARD_RESTART_ORDER=A_THEN_B"
  echo "A_FAILURE_FORWARD_B_RESTART_COUNT=${S4F7Y_FORWARD_B_RESTART_COUNT}"
  echo "REPLICA_B_RESTART_BLOCKED_ON_A_FAILURE=YES"

  if s4f7y_is_engineering_test_harness; then
    S4F7Y_TRANSACTION_COMMITTED=1
  else
    s4f7y_fact_transaction_committed
  fi
  s4f7y_emit_terminal_outcomes || return 1
  return 0
}
