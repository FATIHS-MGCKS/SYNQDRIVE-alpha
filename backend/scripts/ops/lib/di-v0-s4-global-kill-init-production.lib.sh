#!/usr/bin/env bash
# S4F-7F Production GLOBAL kill initializer wrapper helpers — sourced only.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7F_SCRIPT_DIR="${S4F7F_SCRIPT_DIR:-}"
S4F7F_RELEASE_BACKEND="${S4F7F_RELEASE_BACKEND:-}"

s4f7f_log() {
  printf '[s4f7f-kill-init] %s\n' "$*"
}

s4f7f_is_fixture_mode() {
  [[ "${DI_S4F7F_FIXTURE_MODE:-0}" == "1" ]]
}

s4f7f_is_test_mode() {
  [[ "${DI_S4F7F_TEST_MODE:-0}" == "1" ]]
}

s4f7f_is_dry_run() {
  [[ "${DRY_RUN:-0}" == "1" ]]
}

s4f7f_wrapper_backend_root() {
  local script_dir="${S4F7F_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" && -d "${script_dir}/../.." ]]; then
    echo "$(cd "${script_dir}/../.." && pwd)"
    return 0
  fi
  echo ""
  return 1
}

s4f7f_run_cli() {
  local backend_root
  backend_root="$(s4f7f_wrapper_backend_root)" || return 1
  local cli_rel="scripts/ops/di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production-cli.ts"
  if [[ ! -f "${backend_root}/${cli_rel}" ]]; then
    s4f7f_log "ABORT: missing CLI ${backend_root}/${cli_rel}"
    return 1
  fi
  (cd "$backend_root" && npx --yes ts-node --transpile-only "$cli_rel" "$@")
}

s4f7f_run_deployed_s4f4_cli() {
  local release_backend="$1"
  shift
  local cli_rel="scripts/ops/di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout-cli.ts"
  if [[ ! -f "${release_backend}/${cli_rel#scripts/}" && ! -f "${release_backend}/scripts/ops/di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout-cli.ts" ]]; then
    return 1
  fi
  (cd "$release_backend" && npx --yes ts-node --transpile-only scripts/ops/di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout-cli.ts "$@")
}

s4f7f_resolve_release_dir() {
  if [[ -n "${DI_S4F7F_FIXTURE_RELEASE_DIR:-}" ]] && { s4f7f_is_fixture_mode || s4f7f_is_test_mode; }; then
    echo "${DI_S4F7F_FIXTURE_RELEASE_DIR}"
    return 0
  fi
  readlink -f "${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}" 2>/dev/null || echo ""
}

s4f7f_release_sha() {
  local dir="$1"
  git -C "$dir" rev-parse HEAD 2>/dev/null || echo ""
}

s4f7f_file_sha256() {
  local file="$1"
  sha256sum "$file" | awk '{print $1}'
}

s4f7f_psql_at_checked() {
  local sql="$1"
  local out
  out="$(mktemp)"
  if ! sudo -n -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -At -c "$sql" >"$out" 2>/dev/null; then
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
  return 0
}

s4f7f_classify_replica_health() {
  local port="$1"
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    case "$port" in
      "${SYNQDRIVE_REPLICA_A_PORT}") echo "${DI_S4F7F_FIXTURE_REPLICA_A_HEALTH:-OK}" ;;
      "${SYNQDRIVE_REPLICA_B_PORT}") echo "${DI_S4F7F_FIXTURE_REPLICA_B_HEALTH:-OK}" ;;
      *) echo "FAIL" ;;
    esac
    return 0
  fi
  if vps_replica_curl_health_ok "$port"; then echo "OK"; else echo "FAIL"; fi
}

s4f7f_replica_process_cwd() {
  local pm2_name="$1"
  local pid cwd
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    case "$pm2_name" in
      "${SYNQDRIVE_REPLICA_A_PM2_NAME}")
        echo "${DI_S4F7F_FIXTURE_REPLICA_A_PROCESS_CWD:-}"
        return 0
        ;;
      "${SYNQDRIVE_REPLICA_B_PM2_NAME}")
        echo "${DI_S4F7F_FIXTURE_REPLICA_B_PROCESS_CWD:-}"
        return 0
        ;;
    esac
    echo ""
    return 0
  fi
  pid="$(vps_replica_pm2_pid "$pm2_name")"
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    echo ""
    return 1
  fi
  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
  if [[ -z "$cwd" ]]; then
    cwd="$(sudo -n readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
  fi
  echo "$cwd"
}

s4f7f_verify_steady_state_replica() {
  local label="$1" pm2_name="$2" port="$3" required_sha="$4" release_dir="$5"
  local expected_backend pid cwd current_link uptime

  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    case "$label" in
      A)
        if [[ "${DI_S4F7F_FIXTURE_REPLICA_A_PROCESS_RELEASE_IDENTITY:-YES}" == "YES" ]]; then
          echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=YES"
          return 0
        fi
        echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
        return 1
        ;;
      B)
        if [[ "${DI_S4F7F_FIXTURE_REPLICA_B_PROCESS_RELEASE_IDENTITY:-YES}" == "YES" ]]; then
          echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=YES"
          return 0
        fi
        echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
        return 1
        ;;
    esac
  fi

  expected_backend="$(readlink -f "${release_dir}/backend")"
  if ! vps_replica_pm2_exists "$pm2_name"; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  pid="$(vps_replica_pm2_pid "$pm2_name")"
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  if ! vps_replica_port_listening "$port"; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  if ! vps_replica_curl_health_ok "$port"; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  if ! vps_replica_curl_readiness_ok "$port"; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  current_link="$(readlink -f "${SYNQDRIVE_CURRENT_LINK}")"
  if [[ "$current_link" != "$(readlink -f "$release_dir")" ]]; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  if [[ "$(s4f7f_release_sha "$release_dir")" != "$required_sha" ]]; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  cwd="$(s4f7f_replica_process_cwd "$pm2_name")"
  if [[ -z "$cwd" || "$cwd" != "$expected_backend" ]]; then
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  uptime="$(vps_replica_pm2_uptime_sec "$pm2_name")"
  echo "REPLICA_${label}_PM2_UPTIME_SEC=${uptime}"
  echo "REPLICA_${label}_PROCESS_CWD=${cwd}"
  echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=YES"
  return 0
}

s4f7f_topology_snapshot() {
  local release_sha="$1" release_dir="$2"
  local health_a health_b leader_count nginx_dual identity_a identity_b steady
  health_a="$(s4f7f_classify_replica_health "${SYNQDRIVE_REPLICA_A_PORT}")"
  health_b="$(s4f7f_classify_replica_health "${SYNQDRIVE_REPLICA_B_PORT}")"
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    leader_count="${DI_S4F7F_FIXTURE_SCHEDULER_LEADERS:-1}"
    nginx_dual="${DI_S4F7F_FIXTURE_NGINX_DUAL:-YES}"
  else
    leader_count="$(vps_replica_count_scheduler_leaders)"
    nginx_dual=NO
    vps_replica_nginx_dual_upstream_ok 2>/dev/null && nginx_dual=YES || true
  fi
  identity_a=NO
  identity_b=NO
  if s4f7f_verify_steady_state_replica A "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$release_sha" "$release_dir"; then
    identity_a=YES
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if s4f7f_verify_steady_state_replica B "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$release_sha" "$release_dir"; then
      identity_b=YES
    fi
  else
    identity_b=YES
    echo "REPLICA_B_PROCESS_RELEASE_IDENTITY=N/A"
  fi
  steady=NO
  if [[ "$identity_a" == "YES" && "$identity_b" == "YES" ]]; then steady=YES; fi
  echo "REPLICA_A_HEALTH=${health_a}"
  echo "REPLICA_B_HEALTH=${health_b}"
  echo "SCHEDULER_SINGLE_LEADER=$([[ "$leader_count" == "1" ]] && echo YES || echo NO)"
  echo "NGINX_DUAL_UPSTREAM=${nginx_dual}"
  echo "STEADY_STATE_NO_MIXED_RELEASE_IDENTITY=${steady}"
  echo "NO_MIXED_SHA=${steady}"
  echo "POST_DEPLOY_UPTIME_HELPER_USED_FOR_STEADY_STATE=NO"
  export DI_S4F7F_REPLICA_A_HEALTH="$health_a"
  export DI_S4F7F_REPLICA_B_HEALTH="$health_b"
  export DI_S4F7F_REPLICA_A_PROCESS_RELEASE_IDENTITY="$identity_a"
  export DI_S4F7F_REPLICA_B_PROCESS_RELEASE_IDENTITY="$identity_b"
  export DI_S4F7F_STEADY_STATE_NO_MIXED_RELEASE_IDENTITY="$steady"
  export DI_S4F7F_NO_MIXED_SHA="$steady"
  export DI_S4F7F_SCHEDULER_SINGLE_LEADER="$([[ "$leader_count" == "1" ]] && echo YES || echo NO)"
  export DI_S4F7F_NGINX_DUAL_UPSTREAM="$nginx_dual"
}

s4f7f_verify_deployed_kill_files_clean() {
  local release_dir="$1" required_sha="$2"
  local rel_paths=(
    "backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts"
    "backend/src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-control-kill-initializer.ts"
  )
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    if [[ "${DI_S4F7F_FIXTURE_DEPLOYED_DIRTY:-0}" == "1" ]]; then
      echo "DEPLOYED_INITIALIZER_TRACKED=NO"
      return 1
    fi
    echo "DEPLOYED_INITIALIZER_TRACKED=YES"
    echo "DEPLOYED_INITIALIZER_WORKTREE_CLEAN=YES"
    echo "DEPLOYED_KILL_IMPLEMENTATION_TRACKED=YES"
    echo "DEPLOYED_KILL_IMPLEMENTATION_WORKTREE_CLEAN=YES"
    export DI_S4F7F_DEPLOYED_INITIALIZER_TRACKED=YES
    export DI_S4F7F_DEPLOYED_INITIALIZER_WORKTREE_CLEAN=YES
    export DI_S4F7F_DEPLOYED_KILL_IMPLEMENTATION_TRACKED=YES
    export DI_S4F7F_DEPLOYED_KILL_IMPLEMENTATION_WORKTREE_CLEAN=YES
    return 0
  fi
  if [[ "$(s4f7f_release_sha "$release_dir")" != "$required_sha" ]]; then
    echo "DEPLOYED_INITIALIZER_TRACKED=NO"
    return 1
  fi
  for rel in "${rel_paths[@]}"; do
    if ! git -C "$release_dir" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
      echo "DEPLOYED_INITIALIZER_TRACKED=NO"
      return 1
    fi
    if ! git -C "$release_dir" diff --quiet HEAD -- "$rel"; then
      echo "DEPLOYED_INITIALIZER_WORKTREE_CLEAN=NO"
      return 1
    fi
    if [[ -L "${release_dir}/${rel}" ]]; then
      echo "DEPLOYED_INITIALIZER_WORKTREE_CLEAN=NO"
      return 1
    fi
  done
  echo "DEPLOYED_INITIALIZER_TRACKED=YES"
  echo "DEPLOYED_INITIALIZER_WORKTREE_CLEAN=YES"
  echo "DEPLOYED_KILL_IMPLEMENTATION_TRACKED=YES"
  echo "DEPLOYED_KILL_IMPLEMENTATION_WORKTREE_CLEAN=YES"
  export DI_S4F7F_DEPLOYED_INITIALIZER_TRACKED=YES
  export DI_S4F7F_DEPLOYED_INITIALIZER_WORKTREE_CLEAN=YES
  export DI_S4F7F_DEPLOYED_KILL_IMPLEMENTATION_TRACKED=YES
  export DI_S4F7F_DEPLOYED_KILL_IMPLEMENTATION_WORKTREE_CLEAN=YES
  return 0
}

s4f7f_verify_initializer_path_pinned() {
  local release_dir="$1" resolved="$2"
  local expected_backend expected_init
  expected_backend="$(readlink -f "${release_dir}/backend")"
  expected_init="$(readlink -f "${expected_backend}/scripts/ops/di-v0-s4-initialize-global-kill-row.ts")"
  resolved="$(readlink -f "$resolved" 2>/dev/null || echo "$resolved")"
  if [[ "$resolved" != "$expected_init" ]]; then
    echo "INITIALIZER_SUBSTITUTION_RISK=YES"
    export DI_S4F7F_INITIALIZER_SUBSTITUTION_RISK=YES
    return 1
  fi
  echo "INITIALIZER_SUBSTITUTION_RISK=NO"
  export DI_S4F7F_INITIALIZER_SUBSTITUTION_RISK=NO
  return 0
}

s4f7f_budget_runtime_for_label() {
  local label="$1" port="$2" env_file="$3" release_backend="$4"
  if [[ "${DI_S4F7F_FIXTURE_METRIC_AUTH_FAIL:-0}" == "1" ]]; then
    return 1
  fi
  if [[ -n "${DI_S4F7F_FIXTURE_METRIC_A:-}" && "$label" == "A" ]]; then
    echo "${DI_S4F7F_FIXTURE_METRIC_A}"
    return 0
  fi
  if [[ -n "${DI_S4F7F_FIXTURE_METRIC_B:-}" && "$label" == "B" ]]; then
    echo "${DI_S4F7F_FIXTURE_METRIC_B}"
    return 0
  fi
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    echo "${DI_S4F7F_FIXTURE_METRIC_DEFAULT:-1}"
    return 0
  fi
  s4f7f_run_deployed_s4f4_cli "$release_backend" fetch-live-metric "$env_file" "$port"
}

s4f7f_map_metric_to_runtime() {
  local raw="$1"
  if [[ "$raw" == "ENABLED" ]]; then echo "ENABLED"; return; fi
  if [[ "$raw" == "DISABLED" ]]; then echo "DISABLED"; return; fi
  if [[ "$raw" == "1" ]]; then echo "ENABLED"; return; fi
  if [[ "$raw" == "0" ]]; then echo "DISABLED"; return; fi
  echo "UNKNOWN"
}

s4f7f_query_global_row_fixture() {
  local include_meta="${1:-0}"
  if [[ "${DI_S4F7F_FIXTURE_GLOBAL_DB_READ_FAIL:-0}" == "1" ]]; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  if [[ -n "${DI_S4F7F_FIXTURE_MALFORMED_GLOBAL_DB_OUTPUT:-}" ]]; then
    echo "${DI_S4F7F_FIXTURE_MALFORMED_GLOBAL_DB_OUTPUT}"
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  local count="${DI_S4F7F_FIXTURE_GLOBAL_ROW_COUNT:-0}"
  local state="${DI_S4F7F_FIXTURE_GLOBAL_KILL_STATE:-}"
  local reason="${DI_S4F7F_FIXTURE_GLOBAL_REASON:-}"
  local actor="${DI_S4F7F_FIXTURE_GLOBAL_ACTOR:-}"
  echo "$count"
  if [[ "$count" == "0" ]]; then
    echo ""
    if [[ "$include_meta" == "1" ]]; then
      echo ""
      echo ""
    fi
    return 0
  fi
  echo "$state"
  if [[ "$include_meta" == "1" ]]; then
    echo "$reason"
    echo "$actor"
  fi
  return 0
}

s4f7f_query_global_row_db() {
  local include_meta="${1:-0}"
  if [[ "${DI_S4F7F_TEST_USE_REAL_DB:-0}" == "1" ]]; then
    if [[ "$include_meta" == "1" ]]; then
      s4f7f_run_cli query-global-detail || { echo "GLOBAL_PRESTATE_READ_FAILED=YES"; return 1; }
    else
      s4f7f_run_cli query-global-prestate || { echo "GLOBAL_PRESTATE_READ_FAILED=YES"; return 1; }
    fi
    return 0
  fi
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    s4f7f_query_global_row_fixture "$include_meta"
    return $?
  fi
  local count state reason actor
  if ! count="$(s4f7f_psql_at_checked "SELECT COUNT(*)::text FROM di_v0_s4_control WHERE id='GLOBAL';")"; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  count="${count//$'\n'/}"
  if [[ "$count" == "0" ]]; then
    if [[ "$include_meta" == "1" ]]; then
      echo "0"
      echo ""
      echo ""
      echo ""
      return 0
    fi
    echo "0"
    echo ""
    return 0
  fi
  if [[ "$count" != "1" ]]; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  if ! state="$(s4f7f_psql_at_checked "SELECT kill_state::text FROM di_v0_s4_control WHERE id='GLOBAL' LIMIT 1;")"; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  state="${state//$'\n'/}"
  if [[ "$state" != "KILLED" && "$state" != "NOT_KILLED" ]]; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  if [[ "$include_meta" != "1" ]]; then
    echo "$count"
    echo "$state"
    return 0
  fi
  if ! reason="$(s4f7f_psql_at_checked "SELECT reason::text FROM di_v0_s4_control WHERE id='GLOBAL' LIMIT 1;")"; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  if ! actor="$(s4f7f_psql_at_checked "SELECT actor::text FROM di_v0_s4_control WHERE id='GLOBAL' LIMIT 1;")"; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  echo "$count"
  echo "${state//$'\n'/}"
  echo "${reason//$'\n'/}"
  echo "${actor//$'\n'/}"
  return 0
}

s4f7f_query_s4_counts_db() {
  if [[ "${DI_S4F7F_TEST_USE_REAL_DB:-0}" == "1" ]]; then
    s4f7f_run_cli query-s4-counts || { echo "S4_PERSISTENCE_READ_FAILED=YES"; return 1; }
    return 0
  fi
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    if [[ "${DI_S4F7F_FIXTURE_S4_PERSISTENCE_READ_FAIL:-0}" == "1" ]]; then
      echo "S4_PERSISTENCE_READ_FAILED=YES"
      return 1
    fi
    if [[ -n "${DI_S4F7F_FIXTURE_MALFORMED_S4_PERSISTENCE_OUTPUT:-}" ]]; then
      echo "${DI_S4F7F_FIXTURE_MALFORMED_S4_PERSISTENCE_OUTPUT}"
      echo "S4_PERSISTENCE_READ_FAILED=YES"
      return 1
    fi
    echo "${DI_S4F7F_FIXTURE_S4_PIPELINE:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_WORK_ITEMS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_ACTIVE_WORK_ITEMS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_SNAPSHOTS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_SHADOW_RUNS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_SHADOW_INTERVALS:-0}"
    return 0
  fi
  local out
  out="$(mktemp)"
  if ! sudo -n -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -At >"$out" 2>/dev/null <<'SQL'
SELECT COUNT(*)::text FROM di_v0_s4_pipeline_versions;
SELECT COUNT(*)::text FROM di_v0_s4_work_items;
SELECT COUNT(*)::text FROM di_v0_s4_work_items WHERE status NOT IN ('RETIRED','FAILED');
SELECT COUNT(*)::text FROM di_v0_s4_evidence_snapshots;
SELECT COUNT(*)::text FROM di_v0_shadow_runs;
SELECT COUNT(*)::text FROM di_v0_shadow_intervals;
SQL
  then
    rm -f "$out"
    echo "S4_PERSISTENCE_READ_FAILED=YES"
    return 1
  fi
  local line_count
  line_count="$(wc -l <"$out" | tr -d ' ')"
  if [[ "$line_count" != "6" ]]; then
    rm -f "$out"
    echo "S4_PERSISTENCE_READ_FAILED=YES"
    return 1
  fi
  cat "$out"
  rm -f "$out"
  return 0
}

s4f7f_apply_global_read_to_env() {
  local include_meta="$1"
  local -a lines=()
  mapfile -t lines < <(s4f7f_query_global_row_db "$include_meta")
  local rc=$?
  if [[ "$rc" != "0" ]]; then
    return 1
  fi
  export DI_S4F7F_VALIDATE_GLOBAL_INCLUDE_META="$include_meta"
  if ! s4f7f_run_cli validate-global-prestate "${lines[@]}"; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  export DI_S4F7F_GLOBAL_ROW_COUNT="${lines[0]}"
  export DI_S4F7F_GLOBAL_KILL_STATE="${lines[1]:-}"
  if [[ "$include_meta" == "1" ]]; then
    export DI_S4F7F_GLOBAL_REASON="${lines[2]:-}"
    export DI_S4F7F_GLOBAL_ACTOR="${lines[3]:-}"
  fi
  return 0
}

s4f7f_apply_s4_counts_to_env() {
  local -a lines=()
  mapfile -t lines < <(s4f7f_query_s4_counts_db)
  local rc=$?
  if [[ "$rc" != "0" ]]; then
    return 1
  fi
  if ! s4f7f_run_cli validate-s4-persistence "${lines[@]}"; then
    echo "S4_PERSISTENCE_READ_FAILED=YES"
    return 1
  fi
  export DI_S4F7F_S4_PIPELINE_REGISTRY_ROWS="${lines[0]}"
  export DI_S4F7F_S4_WORK_ITEM_ROWS="${lines[1]}"
  export DI_S4F7F_S4_ACTIVE_WORK_ITEM_ROWS="${lines[2]}"
  export DI_S4F7F_S4_EVIDENCE_SNAPSHOT_ROWS="${lines[3]}"
  export DI_S4F7F_S4_SHADOW_RUN_ROWS="${lines[4]}"
  export DI_S4F7F_S4_SHADOW_INTERVAL_ROWS="${lines[5]}"
  return 0
}

s4f7f_invoke_deployed_initializer() {
  local release_backend="$1"
  local out_file="$2"
  if [[ -n "${DI_S4F7F_TEST_INJECT_INITIALIZER_OUTCOME:-}" ]]; then
    echo "DI_V0_S4_GLOBAL_KILL_INIT_RESULT=${DI_S4F7F_TEST_INJECT_INITIALIZER_OUTCOME}" | tee "$out_file"
    return 0
  fi
  if [[ ! -f "${release_backend}/scripts/ops/di-v0-s4-initialize-global-kill-row.ts" ]]; then
    return 1
  fi
  (
    cd "$release_backend" || exit 1
    DI_S4_KILL_INIT_ACTOR="${DI_S4_KILL_INIT_ACTOR}" \
    DI_S4_KILL_INIT_REASON="${DI_S4_KILL_INIT_REASON}" \
    npx --yes ts-node --transpile-only scripts/ops/di-v0-s4-initialize-global-kill-row.ts
  ) | tee "$out_file"
}
