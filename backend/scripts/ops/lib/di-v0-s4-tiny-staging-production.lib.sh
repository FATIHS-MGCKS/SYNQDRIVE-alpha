#!/usr/bin/env bash
# S4F-7J Tiny config staging Production wrapper helpers — sourced only.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7J_SCRIPT_DIR="${S4F7J_SCRIPT_DIR:-}"

s4f7j_log() {
  printf '[s4f7j-tiny-staging] %s\n' "$*"
}

s4f7j_is_fixture_mode() {
  [[ "${DI_S4F7J_FIXTURE_MODE:-0}" == "1" ]]
}

s4f7j_is_test_mode() {
  [[ "${DI_S4F7J_TEST_MODE:-0}" == "1" ]]
}

s4f7j_is_dry_run() {
  [[ "${DRY_RUN:-0}" == "1" ]]
}

s4f7j_wrapper_backend_root() {
  local script_dir="${S4F7J_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" && -d "${script_dir}/../.." ]]; then
    echo "$(cd "${script_dir}/../.." && pwd)"
    return 0
  fi
  echo ""
  return 1
}

s4f7j_run_cli() {
  local backend_root
  backend_root="$(s4f7j_wrapper_backend_root)" || return 1
  local cli_rel="scripts/ops/di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production-cli.ts"
  if [[ ! -f "${backend_root}/${cli_rel}" ]]; then
    s4f7j_log "ABORT: missing CLI ${backend_root}/${cli_rel}"
    return 1
  fi
  (cd "$backend_root" && npx --yes ts-node --transpile-only "$cli_rel" "$@")
}

s4f7j_run_deployed_s4f4_cli() {
  local release_backend="$1"
  shift
  (
    cd "$release_backend" || exit 1
    npx --yes ts-node --transpile-only scripts/ops/di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout-cli.ts "$@"
  )
}

s4f7j_psql_at_checked() {
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

s4f7j_query_global_row_db() {
  if s4f7j_is_fixture_mode || s4f7j_is_test_mode; then
    echo "${DI_S4F7J_FIXTURE_GLOBAL_ROW_COUNT:-1}"
    echo "${DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE:-KILLED}"
    return 0
  fi
  local count state
  if ! count="$(s4f7j_psql_at_checked "SELECT COUNT(*)::text FROM di_v0_s4_control WHERE id='GLOBAL';")"; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  count="${count//$'\n'/}"
  if [[ "$count" == "0" ]]; then
    echo "0"
    echo ""
    return 0
  fi
  if [[ "$count" != "1" ]]; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  if ! state="$(s4f7j_psql_at_checked "SELECT kill_state::text FROM di_v0_s4_control WHERE id='GLOBAL' LIMIT 1;")"; then
    echo "GLOBAL_PRESTATE_READ_FAILED=YES"
    return 1
  fi
  state="${state//$'\n'/}"
  echo "$count"
  echo "$state"
  return 0
}

s4f7j_query_s4_counts_db() {
  if s4f7j_is_fixture_mode || s4f7j_is_test_mode; then
    if [[ "${DI_S4F7J_FIXTURE_S4_PERSISTENCE_READ_FAIL:-0}" == "1" ]]; then
      echo "S4_PERSISTENCE_READ_FAILED=YES"
      return 1
    fi
    echo "${DI_S4F7J_FIXTURE_S4_PIPELINE:-0}"
    echo "${DI_S4F7J_FIXTURE_S4_WORK_ITEMS:-0}"
    echo "${DI_S4F7J_FIXTURE_S4_ACTIVE_WORK_ITEMS:-0}"
    echo "${DI_S4F7J_FIXTURE_S4_SNAPSHOTS:-0}"
    echo "${DI_S4F7J_FIXTURE_S4_SHADOW_RUNS:-0}"
    echo "${DI_S4F7J_FIXTURE_S4_SHADOW_INTERVALS:-0}"
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
  cat "$out"
  rm -f "$out"
  return 0
}

s4f7j_query_vehicle_db() {
  if s4f7j_is_fixture_mode || s4f7j_is_test_mode; then
    if [[ -n "${DI_S4F7J_FIXTURE_VEHICLE_DB_LINES:-}" ]]; then
      echo "${DI_S4F7J_FIXTURE_VEHICLE_DB_LINES}"
      return 0
    fi
    echo "1"
    echo "faa710c9-6d91-4079-a7d5-91fdccdec14a"
    echo "ACTIVE"
    echo "LTE_R1"
    echo "1"
    return 0
  fi
  local vid="c10351f8-b6a2-4258-947f-631aeaa6d359"
  local sql
  sql=$(cat <<SQL
SELECT CASE WHEN COUNT(*) = 1 THEN '1' ELSE '0' END
FROM vehicles v
WHERE v.id = '${vid}'::uuid;
SELECT COALESCE((SELECT organization_id::text FROM vehicles WHERE id = '${vid}'::uuid), '');
SELECT COALESCE((SELECT registry_lifecycle::text FROM vehicles WHERE id = '${vid}'::uuid), '');
SELECT COALESCE((SELECT hardware_type::text FROM vehicles WHERE id = '${vid}'::uuid), '');
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM vehicle_provider_consents vpc
  WHERE vpc.vehicle_id = '${vid}'::uuid AND vpc.status = 'ACTIVE'
) THEN '1' ELSE '0' END;
SQL
)
  local out
  out="$(mktemp)"
  if ! sudo -n -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -At >"$out" 2>/dev/null <<<"$sql"; then
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
  return 0
}

s4f7j_capture_filtered_proc_environ() {
  local pid="$1" dest="$2"
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    return 1
  fi
  local raw
  if s4f7j_is_fixture_mode || s4f7j_is_test_mode; then
    case "$pid" in
      fixture-a|A|${DI_S4F7J_FIXTURE_PM2_PID_A:-fixture-a})
        if [[ -n "${DI_S4F7J_FIXTURE_PROC_ENV_FILE_A:-}" && -f "${DI_S4F7J_FIXTURE_PROC_ENV_FILE_A}" ]]; then
          cp "${DI_S4F7J_FIXTURE_PROC_ENV_FILE_A}" "$dest"
          return 0
        fi
        printf '%s' "${DI_S4F7J_FIXTURE_PROC_ENV_A:-}" >"$dest"
        return 0
        ;;
      fixture-b|B|${DI_S4F7J_FIXTURE_PM2_PID_B:-fixture-b})
        if [[ -n "${DI_S4F7J_FIXTURE_PROC_ENV_FILE_B:-}" && -f "${DI_S4F7J_FIXTURE_PROC_ENV_FILE_B}" ]]; then
          cp "${DI_S4F7J_FIXTURE_PROC_ENV_FILE_B}" "$dest"
          return 0
        fi
        printf '%s' "${DI_S4F7J_FIXTURE_PROC_ENV_B:-}" >"$dest"
        return 0
        ;;
    esac
    printf '%s' "${DI_S4F7J_FIXTURE_PROC_ENV_DEFAULT:-}" >"$dest"
    return 0
  fi
  if [[ ! -r "/proc/${pid}/environ" ]]; then
    if ! sudo -n test -r "/proc/${pid}/environ" 2>/dev/null; then
      return 1
    fi
    raw="$(sudo -n tr '\0' '\n' <"/proc/${pid}/environ" 2>/dev/null || true)"
  else
    raw="$(tr '\0' '\n' <"/proc/${pid}/environ" 2>/dev/null || true)"
  fi
  : >"$dest"
  local allowed=(
    DI_V0_S4_MASTER_ENABLED
    DI_V0_S4_DISCOVERY_ENABLED
    DI_V0_S4_WORKER_ENABLED
    DI_V0_S4_POSITION_ENABLED
    DI_V0_S4_R1_ENABLED
    DI_V0_S4_NATIVE_ENABLED
    DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE
    DI_V0_S4_ORGANIZATION_ALLOWLIST
    DI_V0_S4_VEHICLE_ALLOWLIST
  )
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    for a in "${allowed[@]}"; do
      if [[ "$key" == "$a" ]]; then
        printf '%s=%s\0' "$key" "$val" >>"$dest"
        break
      fi
    done
  done <<<"$raw"
  return 0
}

s4f7j_prove_replica_staging_runtime() {
  local label="$1" pm2_name="$2"
  local pid environ_file
  if s4f7j_is_fixture_mode || s4f7j_is_test_mode; then
    pid="fixture-${label,,}"
  else
    pid="$(vps_replica_pm2_pid "$pm2_name")"
  fi
  environ_file="$(mktemp)"
  if ! s4f7j_capture_filtered_proc_environ "$pid" "$environ_file"; then
    rm -f "$environ_file"
    echo "REPLICA_${label}_RUNTIME_PROOF=FAIL"
    return 1
  fi
  if ! s4f7j_run_cli proc-environ-proof "$label" "$environ_file"; then
    rm -f "$environ_file"
    return 1
  fi
  rm -f "$environ_file"
  return 0
}

s4f7j_verify_steady_state_replica() {
  local label="$1" pm2_name="$2" port="$3" required_sha="$4" release_dir="$5"
  if s4f7j_is_fixture_mode || s4f7j_is_test_mode; then
    case "$label" in
      A)
        if [[ "${DI_S4F7J_FIXTURE_REPLICA_A_PROCESS_RELEASE_IDENTITY:-YES}" == "YES" ]]; then
          echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=YES"
          return 0
        fi
        ;;
      B)
        if [[ "${DI_S4F7J_FIXTURE_REPLICA_B_PROCESS_RELEASE_IDENTITY:-YES}" == "YES" ]]; then
          echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=YES"
          return 0
        fi
        ;;
    esac
    echo "REPLICA_${label}_PROCESS_RELEASE_IDENTITY=NO"
    return 1
  fi
  s4f7f_verify_steady_state_replica "$label" "$pm2_name" "$port" "$required_sha" "$release_dir"
}

s4f7j_run_config_file_audit() {
  local env_path="$1"
  SYNQDRIVE_BACKEND_ENV="$env_path" bash "${S4F7J_SCRIPT_DIR}/di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh"
}
