#!/usr/bin/env bash
# S4F-7F Production GLOBAL kill initializer wrapper helpers — sourced only.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7F_SCRIPT_DIR="${S4F7F_SCRIPT_DIR:-}"

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

s4f7f_topology_snapshot() {
  local release_sha="$1"
  local health_a health_b leader_count nginx_dual no_mixed
  health_a="$(s4f7f_classify_replica_health "${SYNQDRIVE_REPLICA_A_PORT}")"
  health_b="$(s4f7f_classify_replica_health "${SYNQDRIVE_REPLICA_B_PORT}")"
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    leader_count="${DI_S4F7F_FIXTURE_SCHEDULER_LEADERS:-1}"
    nginx_dual="${DI_S4F7F_FIXTURE_NGINX_DUAL:-YES}"
    no_mixed="${DI_S4F7F_FIXTURE_NO_MIXED_SHA:-YES}"
  else
    leader_count="$(vps_replica_count_scheduler_leaders)"
    nginx_dual=NO
    vps_replica_nginx_dual_upstream_ok 2>/dev/null && nginx_dual=YES || true
    no_mixed=NO
    if vps_replica_verify_no_mixed_sha "$release_sha" 2>/dev/null; then no_mixed=YES; fi
  fi
  echo "REPLICA_A_HEALTH=${health_a}"
  echo "REPLICA_B_HEALTH=${health_b}"
  echo "SCHEDULER_SINGLE_LEADER=$([[ "$leader_count" == "1" ]] && echo YES || echo NO)"
  echo "NGINX_DUAL_UPSTREAM=${nginx_dual}"
  echo "NO_MIXED_SHA=${no_mixed}"
  export DI_S4F7F_REPLICA_A_HEALTH="$health_a"
  export DI_S4F7F_REPLICA_B_HEALTH="$health_b"
  export DI_S4F7F_SCHEDULER_SINGLE_LEADER="$([[ "$leader_count" == "1" ]] && echo YES || echo NO)"
  export DI_S4F7F_NGINX_DUAL_UPSTREAM="$nginx_dual"
  export DI_S4F7F_NO_MIXED_SHA="$no_mixed"
}

s4f7f_budget_runtime_for_label() {
  local label="$1" port="$2" env_file="$3"
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
  s4f7f_run_cli live-metric "$env_file" "$port" 2>/dev/null | sed -n 's/^LIVE_GLOBAL_BUDGET_METRIC=//p'
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
  echo "${DI_S4F7F_FIXTURE_GLOBAL_ROW_COUNT:-0}"
  echo "${DI_S4F7F_FIXTURE_GLOBAL_KILL_STATE:-}"
}

s4f7f_query_global_row_db() {
  if [[ "${DI_S4F7F_TEST_USE_REAL_DB:-0}" == "1" ]]; then
    s4f7f_run_cli query-global || { echo "0"; echo ""; }
    return 0
  fi
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    s4f7f_query_global_row_fixture
    return 0
  fi
  local count state
  count="$(sudo -n -u postgres psql -d synqdrive -At -c "SELECT COUNT(*)::text FROM di_v0_s4_control WHERE id='GLOBAL';" 2>/dev/null || echo "0")"
  state="$(sudo -n -u postgres psql -d synqdrive -At -c "SELECT kill_state::text FROM di_v0_s4_control WHERE id='GLOBAL' LIMIT 1;" 2>/dev/null || echo "")"
  echo "$count"
  echo "$state"
}

s4f7f_query_s4_counts_db() {
  if [[ "${DI_S4F7F_TEST_USE_REAL_DB:-0}" == "1" ]]; then
    s4f7f_run_cli query-s4-counts || true
    return 0
  fi
  if s4f7f_is_fixture_mode || s4f7f_is_test_mode; then
    echo "${DI_S4F7F_FIXTURE_S4_PIPELINE:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_WORK_ITEMS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_ACTIVE_WORK_ITEMS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_SNAPSHOTS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_SHADOW_RUNS:-0}"
    echo "${DI_S4F7F_FIXTURE_S4_SHADOW_INTERVALS:-0}"
    return 0
  fi
  sudo -n -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT COUNT(*)::text FROM di_v0_s4_pipeline_versions;
SELECT COUNT(*)::text FROM di_v0_s4_work_items;
SELECT COUNT(*)::text FROM di_v0_s4_work_items WHERE status NOT IN ('RETIRED','FAILED');
SELECT COUNT(*)::text FROM di_v0_s4_evidence_snapshots;
SELECT COUNT(*)::text FROM di_v0_shadow_runs;
SELECT COUNT(*)::text FROM di_v0_shadow_intervals;
SQL
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
