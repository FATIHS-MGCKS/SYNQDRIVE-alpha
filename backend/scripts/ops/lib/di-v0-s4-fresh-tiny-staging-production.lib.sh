#!/usr/bin/env bash
# S4F-7V fresh Tiny config staging — tool checkout helpers (independent of /opt/synqdrive/current).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7V_SCRIPT_DIR="${S4F7V_SCRIPT_DIR:-}"

s4f7v_log() {
  printf '[s4f7v-fresh-tiny-staging] %s\n' "$*"
}

s4f7v_is_fixture_mode() {
  [[ "${DI_S4F7V_FIXTURE_MODE:-0}" == "1" ]]
}

s4f7v_is_test_mode() {
  [[ "${DI_S4F7V_TEST_MODE:-0}" == "1" ]]
}

s4f7v_is_dry_run() {
  [[ "${DRY_RUN:-0}" == "1" ]]
}

s4f7v_tool_backend_root() {
  if [[ -n "${SYNQDRIVE_FRESH_TINY_STAGING_TOOL_ROOT:-}" ]]; then
    echo "${SYNQDRIVE_FRESH_TINY_STAGING_TOOL_ROOT}/backend"
    return 0
  fi
  local script_dir="${S4F7V_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" && -d "${script_dir}/../.." ]]; then
    echo "$(cd "${script_dir}/../.." && pwd)"
    return 0
  fi
  echo ""
  return 1
}

s4f7v_resolve_tool_checkout_sha() {
  local root
  root="$(s4f7v_tool_backend_root)" || return 1
  if [[ -n "${DI_S4F7V_TOOL_CHECKOUT_SHA:-}" ]]; then
    echo "${DI_S4F7V_TOOL_CHECKOUT_SHA}"
    return 0
  fi
  git -C "$(dirname "$root")" rev-parse HEAD 2>/dev/null || echo ""
}

s4f7v_assert_tool_sha_pin() {
  local required="${EXPECTED_FRESH_TINY_STAGING_TOOL_SHA:-}"
  local actual
  actual="$(s4f7v_resolve_tool_checkout_sha)"
  if [[ -z "$required" ]]; then
    s4f7v_log "ABORT: missing EXPECTED_FRESH_TINY_STAGING_TOOL_SHA"
    return 1
  fi
  if [[ "$actual" != "$required" ]]; then
    s4f7v_log "ABORT: tool SHA pin mismatch (required ${required:0:12}, actual ${actual:0:12})"
    return 1
  fi
  echo "TOOL_SHA_PIN=PASS"
  return 0
}

s4f7v_run_cli() {
  local backend_root
  backend_root="$(s4f7v_tool_backend_root)" || return 1
  local cli_rel="scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-production-cli.ts"
  if [[ ! -f "${backend_root}/${cli_rel}" ]]; then
    s4f7v_log "ABORT: missing CLI ${backend_root}/${cli_rel}"
    return 1
  fi
  (
    cd "$backend_root"
    export DI_S4F7V_TOOL_CHECKOUT_SHA="$(s4f7v_resolve_tool_checkout_sha)"
    npx --yes ts-node --transpile-only "$cli_rel" "$@"
  )
}

s4f7v_query_db_clock_canonical() {
  if s4f7v_is_fixture_mode || s4f7v_is_test_mode; then
    echo "${DI_S4F7V_DB_CLOCK_CANONICAL_UTC:-}"
    return 0
  fi
  sudo -n -u postgres psql -d synqdrive -Atqc "SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC'), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');"
}

s4f7v_validate_canonical_db_clock_format() {
  local clock="${1:-}"
  [[ -n "$clock" ]] || return 1
  [[ "$clock" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]] || return 1
  return 0
}

# EXP-021 S4F-7AG — fail-closed canonical DB clock for fresh-authority validation (no local-time fallback).
s4f7v_export_db_clock_canonical_utc_fail_closed() {
  local label="${1:-INITIAL}"
  local clock
  clock="$(s4f7v_query_db_clock_canonical)" || {
    echo "DB_CLOCK_QUERY_FAILED=${label}"
    return 1
  }
  if [[ -z "$clock" ]]; then
    echo "DB_CLOCK_EMPTY=${label}"
    return 1
  fi
  if ! s4f7v_validate_canonical_db_clock_format "$clock"; then
    echo "DB_CLOCK_INVALID_FORMAT=${label}"
    return 1
  fi
  export DI_S4F7V_DB_CLOCK_CANONICAL_UTC="$clock"
  if [[ "$label" == "FINAL" ]]; then
    export DI_S4F7V_FINAL_DB_CLOCK_CANONICAL_UTC="$clock"
    echo "FINAL_DB_CLOCK_CANONICAL_UTC=${clock}"
  else
    echo "DB_CLOCK_CANONICAL_UTC=${clock}"
    echo "INITIAL_DB_CLOCK_EXPORTED=YES"
  fi
  return 0
}

s4f7v_run_validate_fresh_authority_fail_closed() {
  local label="${1:-}"
  local out rc
  set +e
  out="$(s4f7v_run_cli validate-fresh-authority 2>&1)"
  rc=$?
  set -e
  printf '%s\n' "$out"
  if [[ "$rc" != "0" ]]; then
    echo "VALIDATE_FRESH_AUTHORITY_CLI_EXIT_NONZERO=${label}"
    return 1
  fi
  if ! printf '%s\n' "$out" | grep -q '^FRESH_AUTHORITY_OK=YES$'; then
    echo "VALIDATE_FRESH_AUTHORITY_FAILED=${label}"
    return 1
  fi
  if [[ "$label" == "FINAL" ]]; then
    local age
    age="$(printf '%s\n' "$out" | awk -F= '/^FRESH_AUTHORITY_AGE_SECONDS=/{print $2; exit}')"
    echo "FINAL_JIT_AUTHORITY_AGE_SECONDS=${age}"
    if [[ -z "$age" ]]; then
      echo "FINAL_JIT_AUTHORITY_AGE_MISSING=YES"
      return 1
    fi
  fi
  return 0
}

# Reuse S4F-7J read-only DB helpers when available.
if [[ -f "${S4F7V_SCRIPT_DIR:-}/lib/di-v0-s4-tiny-staging-production.lib.sh" ]]; then
  # shellcheck source=lib/di-v0-s4-tiny-staging-production.lib.sh
  source "${S4F7V_SCRIPT_DIR}/lib/di-v0-s4-tiny-staging-production.lib.sh"
fi

s4f7v_bridge_j_fixture_env() {
  if ! s4f7v_is_fixture_mode && ! s4f7v_is_test_mode; then
    return 0
  fi
  export DI_S4F7J_FIXTURE_MODE=1
  [[ "${DI_S4F7V_TEST_MODE:-0}" == "1" ]] && export DI_S4F7J_TEST_MODE=1
  [[ -n "${DI_S4F7V_FIXTURE_DEPLOYED_SHA:-}" ]] && export DI_S4F7J_FIXTURE_DEPLOYED_SHA="${DI_S4F7V_FIXTURE_DEPLOYED_SHA}"
  [[ -n "${DI_S4F7V_FIXTURE_RELEASE_DIR:-}" ]] && export DI_S4F7J_FIXTURE_RELEASE_DIR="${DI_S4F7V_FIXTURE_RELEASE_DIR}"
  [[ -n "${DI_S4F7V_FIXTURE_METRICS_BODY_A:-}" ]] && export DI_S4F7J_FIXTURE_METRICS_BODY_A="${DI_S4F7V_FIXTURE_METRICS_BODY_A}"
  [[ -n "${DI_S4F7V_FIXTURE_METRICS_BODY_B:-}" ]] && export DI_S4F7J_FIXTURE_METRICS_BODY_B="${DI_S4F7V_FIXTURE_METRICS_BODY_B}"
  [[ -n "${DI_S4F7V_FIXTURE_GLOBAL_ROW_COUNT:-}" ]] && export DI_S4F7J_FIXTURE_GLOBAL_ROW_COUNT="${DI_S4F7V_FIXTURE_GLOBAL_ROW_COUNT}"
  [[ -n "${DI_S4F7V_FIXTURE_GLOBAL_KILL_STATE:-}" ]] && export DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE="${DI_S4F7V_FIXTURE_GLOBAL_KILL_STATE}"
  [[ -n "${DI_S4F7V_FIXTURE_VEHICLE_DB_LINES:-}" ]] && export DI_S4F7J_FIXTURE_VEHICLE_DB_LINES="${DI_S4F7V_FIXTURE_VEHICLE_DB_LINES}"
  [[ "${DI_S4F7V_FIXTURE_BUDGET_CONFIG_FAIL:-0}" == "1" ]] && export DI_S4F7J_FIXTURE_BUDGET_CONFIG_FAIL=1
  [[ "${DI_S4F7V_FIXTURE_BUDGET_METRIC_A_FAIL:-0}" == "1" ]] && export DI_S4F7J_FIXTURE_BUDGET_METRIC_A_FAIL=1
  [[ "${DI_S4F7V_FIXTURE_BUDGET_METRIC_B_FAIL:-0}" == "1" ]] && export DI_S4F7J_FIXTURE_BUDGET_METRIC_B_FAIL=1
  [[ "${DI_S4F7V_FIXTURE_REDIS_FAIL:-0}" == "1" ]] && export DI_S4F7J_FIXTURE_REDIS_FAIL=1
  [[ -n "${DI_S4F7V_FIXTURE_SCHEDULER_LEADERS:-}" ]] && export DI_S4F7J_FIXTURE_SCHEDULER_LEADERS="${DI_S4F7V_FIXTURE_SCHEDULER_LEADERS}"
  [[ -n "${DI_S4F7V_FIXTURE_NGINX_DUAL:-}" ]] && export DI_S4F7J_FIXTURE_NGINX_DUAL="${DI_S4F7V_FIXTURE_NGINX_DUAL}"
  [[ -n "${DI_S4F7V_FIXTURE_S4_PIPELINE:-}" ]] && export DI_S4F7J_FIXTURE_S4_PIPELINE="${DI_S4F7V_FIXTURE_S4_PIPELINE}"
  return 0
}

s4f7v_resolve_deployed_sha() {
  if [[ -n "${DI_S4F7V_FIXTURE_DEPLOYED_SHA:-}" ]] && { s4f7v_is_fixture_mode || s4f7v_is_test_mode; }; then
    echo "${DI_S4F7V_FIXTURE_DEPLOYED_SHA}"
    return 0
  fi
  vps_replica_current_sha
}

s4f7v_resolve_release_dir() {
  if [[ -n "${DI_S4F7V_FIXTURE_RELEASE_DIR:-}" ]] && { s4f7v_is_fixture_mode || s4f7v_is_test_mode; }; then
    echo "${DI_S4F7V_FIXTURE_RELEASE_DIR}"
    return 0
  fi
  readlink -f "${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}" 2>/dev/null || echo ""
}

s4f7w_require_staging_pins() {
  echo "ACK_REQUIRED=YES"
  for var in DI_S4_TINY_STAGING_REQUIRED_SHA DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256; do
    if [[ -z "${!var:-}" ]]; then
      echo "PIN_MISSING=${var}"
      return 1
    fi
  done
  if [[ "${DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE:-}" != "KILLED" ]]; then
    echo "GLOBAL_KILLED_REQUIRED=NO"
    return 1
  fi
  echo "GLOBAL_KILLED_REQUIRED=YES"
  echo "PRODUCTION_SHA_PIN_REQUIRED=YES"
  echo "PRODUCTION_RELEASE_PIN_REQUIRED=YES"
  echo "PRE_ENV_SHA_PIN_REQUIRED=YES"
  return 0
}

# EXP-021 S4F-7W — read-only Production preflight; populates DI_S4F7V_* for fresh guards CLI.
s4f7w_live_preflight_readonly() {
  local backend_env="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
  local required_sha="${DI_S4_TINY_STAGING_REQUIRED_SHA:-}"
  local required_release="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
  local required_env_sha="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"

  echo "EXP021_S4F7W_LIVE_PREFLIGHT_READONLY=1"
  s4f7v_bridge_j_fixture_env

  local observed_sha observed_release release_dir actual_env_sha
  observed_sha="$(s4f7v_resolve_deployed_sha)"
  release_dir="$(s4f7v_resolve_release_dir)"
  observed_release="$(basename "$release_dir")"

  echo "ACTUAL_PRODUCTION_SHA_OBSERVED=${observed_sha}"
  echo "ACTUAL_PRODUCTION_RELEASE_OBSERVED=${observed_release}"

  export DI_S4_TINY_STAGING_ACTUAL_SHA="$observed_sha"
  export DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID="$observed_release"

  if [[ -z "$observed_sha" || "$observed_sha" != "$required_sha" ]]; then
    echo "PRODUCTION_SHA_PIN=FAIL"
    echo "SHA_MISMATCH_FAILS_PRE_MUTATION=YES"
    return 1
  fi
  echo "PRODUCTION_SHA_PIN=PASS"

  if [[ -z "$observed_release" || "$observed_release" != "$required_release" ]]; then
    echo "PRODUCTION_RELEASE_PIN=FAIL"
    return 1
  fi
  echo "PRODUCTION_RELEASE_PIN=PASS"

  if [[ ! -r "$backend_env" ]]; then
    echo "BACKEND_ENV_UNREADABLE=YES"
    return 1
  fi
  actual_env_sha="$(s4f4_file_sha256 "$backend_env")"
  echo "BACKEND_ENV_SHA256=${actual_env_sha}"
  echo "ACTUAL_PRE_ENV_SHA_OBSERVED=${actual_env_sha}"
  export DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256="$actual_env_sha"
  if [[ "$actual_env_sha" != "$required_env_sha" ]]; then
    echo "PRE_ENV_SHA_PIN=FAIL"
    echo "PRE_ENV_HASH_MISMATCH=YES"
    return 1
  fi
  echo "PRE_ENV_SHA_PIN=PASS"

  local -a global_lines=()
  mapfile -t global_lines < <(s4f7j_query_global_row_db)
  if [[ "${global_lines[0]:-}" == *FAILED* ]]; then
    echo "GLOBAL_DB_READ_FAILURE_FAILS_CLOSED=YES"
    return 1
  fi
  if ! s4f7j_run_cli validate-global-prestate "${global_lines[@]}"; then
    echo "GLOBAL_KILLED_PRECONDITION=FAIL"
    return 1
  fi
  export DI_S4F7V_GLOBAL_ROW_LINES="$(printf '%s\n' "${global_lines[@]}")"

  local -a s4_lines=()
  mapfile -t s4_lines < <(s4f7j_query_s4_counts_db)
  if [[ "${s4_lines[0]:-}" == *FAILED* ]]; then
    echo "S4_ZERO_STATE_PRECONDITION=FAIL"
    return 1
  fi
  if ! s4f7j_run_cli validate-s4-persistence "${s4_lines[@]}"; then
    echo "S4_ZERO_STATE_PRECONDITION=FAIL"
    return 1
  fi
  export DI_S4F7V_S4_PERSISTENCE_LINES="$(printf '%s\n' "${s4_lines[@]}")"
  echo "GLOBAL_KILLED_PRECONDITION=PASS"
  echo "S4_ZERO_STATE_PRECONDITION=PASS"

  if ! s4f7j_run_cli s4-safe "$backend_env"; then
    echo "ALL_S4_FLAGS_OFF_PRECONDITION=FAIL"
    return 1
  fi
  echo "ALL_S4_FLAGS_OFF_PRECONDITION=PASS"

  local prestate_out
  if ! prestate_out="$(s4f7j_run_cli validate-prestate-keys "$backend_env")"; then
    echo "ALL_THREE_TARGET_KEYS_MISSING_PRECONDITION=FAIL"
    return 1
  fi
  printf '%s\n' "$prestate_out"
  export PRE_NOT_BEFORE_STATE="$(printf '%s\n' "$prestate_out" | awk -F= '/^PRE_NOT_BEFORE_STATE=/{print $2}')"
  export PRE_ORG_ALLOWLIST_STATE="$(printf '%s\n' "$prestate_out" | awk -F= '/^PRE_ORG_ALLOWLIST_STATE=/{print $2}')"
  export PRE_VEHICLE_ALLOWLIST_STATE="$(printf '%s\n' "$prestate_out" | awk -F= '/^PRE_VEHICLE_ALLOWLIST_STATE=/{print $2}')"
  if [[ "$PRE_NOT_BEFORE_STATE" != "MISSING" || "$PRE_ORG_ALLOWLIST_STATE" != "MISSING" || "$PRE_VEHICLE_ALLOWLIST_STATE" != "MISSING" ]]; then
    echo "ALL_THREE_TARGET_KEYS_MISSING_PRECONDITION=FAIL"
    return 1
  fi
  echo "ALL_THREE_TARGET_KEYS_MISSING_PRECONDITION=PASS"

  export DI_S4F7V_ENV_CONTENT="$(cat "$backend_env")"
  export DI_S4F7V_ENV_CONTENT_READABLE=YES

  local -a vehicle_lines=()
  mapfile -t vehicle_lines < <(s4f7j_query_vehicle_db) || return 1
  if ! s4f7j_run_cli validate-vehicle-db "${vehicle_lines[@]}"; then
    echo "TINY_IDENTITY_DB_PRECONDITION=FAIL"
    return 1
  fi
  export DI_S4F7V_VEHICLE_DB_LINES="$(printf '%s\n' "${vehicle_lines[@]}")"
  echo "TINY_IDENTITY_DB_PRECONDITION=PASS"

  if ! s4f7j_live_topology_preflight "$required_sha" "$release_dir"; then
    echo "TOPOLOGY_PRECONDITION=FAIL"
    export DI_S4F7V_TOPOLOGY_OK=NO
    return 1
  fi
  if s4f7v_is_fixture_mode || s4f7v_is_test_mode; then
    if [[ "${DI_S4F7V_FIXTURE_SCHEDULER_LEADERS:-1}" != "1" ]]; then
      echo "TOPOLOGY_PRECONDITION=FAIL"
      export DI_S4F7V_TOPOLOGY_OK=NO
      return 1
    fi
    if [[ "${DI_S4F7V_FIXTURE_NGINX_DUAL:-YES}" != "YES" ]]; then
      echo "TOPOLOGY_PRECONDITION=FAIL"
      export DI_S4F7V_TOPOLOGY_OK=NO
      return 1
    fi
  fi
  export DI_S4F7V_TOPOLOGY_OK=YES
  echo "TOPOLOGY_PRECONDITION=PASS"

  if ! s4f7j_live_budget_redis_preflight "$release_dir"; then
    echo "BUDGET_RUNTIME_PRECONDITION=FAIL"
    export DI_S4F7V_BUDGET_CONFIG_EXPLICIT_ENABLED=NO
    export DI_S4F7V_BUDGET_RUNTIME_BOTH_ENABLED=NO
    export DI_S4F7V_REDIS_REACHABLE=NO
    return 1
  fi
  export DI_S4F7V_BUDGET_CONFIG_EXPLICIT_ENABLED="${DI_S4F7J_BUDGET_CONFIG_EXPLICIT_ENABLED:-YES}"
  export DI_S4F7V_BUDGET_RUNTIME_BOTH_ENABLED="${DI_S4F7J_BUDGET_RUNTIME_BOTH_ENABLED:-YES}"
  export DI_S4F7V_REDIS_REACHABLE="${DI_S4F7J_REDIS_REACHABLE:-YES}"
  echo "BUDGET_RUNTIME_PRECONDITION=PASS"
  echo "REDIS_PRECONDITION=PASS"
  echo "METRICS_SECRET_LOGGED=NO"

  local tool_sha
  tool_sha="$(s4f7v_resolve_tool_checkout_sha)"
  export DI_S4F7V_TOOL_CHECKOUT_SHA="$tool_sha"
  echo "TOOL_CHECKOUT_SHA_OBSERVED=${tool_sha}"

  echo "LIVE_PREFLIGHT_READONLY=PASS"
  return 0
}

s4f7w_emit_dry_run_success_contract() {
  echo "DRY_RUN_FULL_GUARD_PATH_EXECUTED=YES"
  echo "DRY_RUN_ENV_MUTATION_COUNT=0"
  echo "DRY_RUN_RESTART_COUNT=0"
  echo "PRODUCTION_MUTATION_OCCURRED=NO"
  echo "PRODUCTION_ENV_MUTATION_OCCURRED=NO"
  echo "PRODUCTION_DB_WRITE_OCCURRED=NO"
  echo "PRODUCTION_RESTART_OCCURRED=NO"
  echo "DRY_RUN_MUTATION_SIMULATION_FAILURE_IS_FATAL=YES"
  echo "DRY_RUN_INTENDED_DELTA_FAILURE_IS_FATAL=YES"
  echo "DRY_RUN_FAILURE_SWALLOWING_PRESENT=NO"
  echo "LIVE_STAGING_SHELL_EXECUTION_READY=NO"
  echo "LIVE_STAGING_REMAINS_FAIL_CLOSED=YES"
}
