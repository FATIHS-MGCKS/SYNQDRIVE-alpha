#!/usr/bin/env bash
# DIMO global-budget config-only rollout helpers — sourced only (EXP-021 S4F-4).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

DI_S4_GLOBAL_BUDGET_ENV_KEY="DIMO_GLOBAL_BUDGET_ENABLED"
DI_S4_GLOBAL_BUDGET_TARGET_VALUE="true"
DI_S4_GLOBAL_BUDGET_RUNTIME_LOG_MARKER="DIMO global provider budget enabled"
DI_S4_GLOBAL_BUDGET_RUNTIME_DISABLED_MARKER="DIMO_GLOBAL_BUDGET_ENABLED=false"
DI_S4_GLOBAL_BUDGET_ENABLED_METRIC="synqdrive_dimo_global_budget_enabled"

s4f4_rollout_log() {
  printf '[s4f4-global-budget] %s\n' "$*"
}

s4f4_is_fixture_mode() {
  [[ "${DI_S4F4_FIXTURE_MODE:-0}" == "1" ]]
}

s4f4_is_dry_run() {
  [[ "${DRY_RUN:-0}" == "1" ]]
}

s4f4_file_sha256() {
  local file="$1"
  sha256sum "$file" | awk '{print $1}'
}

s4f4_env_file_metadata() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    S4F4_ENV_META_OWNER=""
    S4F4_ENV_META_MODE="644"
    S4F4_ENV_META_UID=""
    S4F4_ENV_META_GID=""
    return 0
  fi
  S4F4_ENV_META_OWNER="$(stat -c '%U:%G' "$file" 2>/dev/null || stat -f '%Su:%Sg' "$file" 2>/dev/null || echo "")"
  S4F4_ENV_META_MODE="$(stat -c '%a' "$file" 2>/dev/null || stat -f '%OLp' "$file" 2>/dev/null || echo "600")"
  S4F4_ENV_META_UID="$(stat -c '%u' "$file" 2>/dev/null || echo "")"
  S4F4_ENV_META_GID="$(stat -c '%g' "$file" 2>/dev/null || echo "")"
}

s4f4_same_dir_temp() {
  local target="$1"
  local dir
  dir="$(dirname "$target")"
  mktemp "${dir}/.backend.env.s4f4.XXXXXX"
}

s4f4_atomic_promote_env_file() {
  local tmp="$1" target="$2" purpose="$3"
  mv -f "$tmp" "$target"
  s4f4_rollout_log "atomic promote (${purpose}) → ${target}"
}

s4f4_create_verified_backend_env_backup() {
  local src="$1" dest="$2"
  local before backup_sha
  before="$(s4f4_file_sha256 "$src")"
  echo "BACKEND_ENV_SHA256_BEFORE=${before}"
  cp "$src" "$dest"
  chmod 600 "$dest" 2>/dev/null || true
  backup_sha="$(s4f4_file_sha256 "$dest")"
  echo "BACKUP_SHA256=${backup_sha}"
  if [[ "$before" != "$backup_sha" ]]; then
    echo "BACKUP_CHECKSUM_VERIFIED=NO"
    return 1
  fi
  echo "BACKUP_CHECKSUM_VERIFIED=YES"
  return 0
}

s4f4_restore_backend_env_atomic() {
  local target="$1" backup="$2" expected_sha256="$3"
  local backup_sha after tmp
  if [[ "${DI_S4F4_TEST_INJECT_BACKUP_RESTORE_FAIL:-0}" == "1" ]]; then
    echo "BACKEND_ENV_RESTORED=NO"
    return 1
  fi
  backup_sha="$(s4f4_file_sha256 "$backup")"
  if [[ "$backup_sha" != "$expected_sha256" ]]; then
    echo "BACKUP_CHECKSUM_MISMATCH=YES"
    echo "BACKEND_ENV_RESTORED=NO"
    return 1
  fi
  s4f4_env_file_metadata "$target"
  tmp="$(s4f4_same_dir_temp "$target")"
  cp "$backup" "$tmp"
  chmod "${S4F4_ENV_META_MODE:-600}" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  if [[ -n "${S4F4_ENV_META_UID:-}" && -n "${S4F4_ENV_META_GID:-}" ]]; then
    if ! chown "${S4F4_ENV_META_UID}:${S4F4_ENV_META_GID}" "$tmp" 2>/dev/null; then
      echo "BACKEND_ENV_RESTORED=NO"
      rm -f "$tmp"
      return 1
    fi
  elif [[ -n "${S4F4_ENV_META_OWNER:-}" ]]; then
    chown "${S4F4_ENV_META_OWNER}" "$tmp" 2>/dev/null || true
  fi
  s4f4_atomic_promote_env_file "$tmp" "$target" restore
  after="$(s4f4_file_sha256 "$target")"
  echo "BACKEND_ENV_SHA256_AFTER_RECOVERY=${after}"
  if [[ "$after" != "$expected_sha256" ]]; then
    echo "RESTORE_CHECKSUM_MISMATCH=YES"
    echo "BACKEND_ENV_RESTORED=NO"
    echo "ROLLBACK_ENV_EXACT_CONTENT_RESTORED=NO"
    return 1
  fi
  echo "BACKEND_ENV_RESTORED=YES"
  echo "ROLLBACK_RESTORES_ENV=YES"
  echo "ROLLBACK_ENV_EXACT_CONTENT_RESTORED=YES"
  return 0
}

s4f4_rollout_backend_root() {
  if [[ -n "${SYNQDRIVE_CURRENT_LINK:-}" && -d "${SYNQDRIVE_CURRENT_LINK}/backend" ]]; then
    echo "${SYNQDRIVE_CURRENT_LINK}/backend"
    return 0
  fi
  local script_dir="${S4F4_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" && -d "${script_dir}/../.." ]]; then
    echo "$(cd "${script_dir}/../.." && pwd)"
    return 0
  fi
  echo ""
  return 1
}

s4f4_run_cli() {
  local backend_root
  backend_root="$(s4f4_rollout_backend_root)" || return 1
  local cli_rel="scripts/ops/di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout-cli.ts"
  if [[ ! -f "${backend_root}/${cli_rel}" ]]; then
    s4f4_rollout_log "ABORT: missing CLI ${backend_root}/${cli_rel}"
    return 1
  fi
  (cd "$backend_root" && npx --yes ts-node --transpile-only "$cli_rel" "$@")
}

s4f4_run_config_file_audit() {
  local env_path="$1"
  SYNQDRIVE_BACKEND_ENV="$env_path" bash "${S4F4_SCRIPT_DIR}/di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh"
}

s4f4_classify_runtime_from_log_snippet() {
  local snippet="$1"
  if [[ "$snippet" == *"${DI_S4_GLOBAL_BUDGET_RUNTIME_DISABLED_MARKER}"* ]]; then
    echo "DISABLED"
    return 0
  fi
  if [[ "$snippet" == *"${DI_S4_GLOBAL_BUDGET_RUNTIME_LOG_MARKER}"* ]]; then
    echo "ENABLED"
    return 0
  fi
  echo "UNKNOWN"
}

s4f4_fetch_replica_startup_log_snippet() {
  local pm2_name="$1" lines="${2:-200}"
  if s4f4_is_fixture_mode || [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    echo "${DI_S4F4_FIXTURE_PM2_LOG_SNIPPET:-}"
    return 0
  fi
  pm2 logs "$pm2_name" --nostream --lines "$lines" 2>/dev/null || true
}

s4f4_report_startup_log_corroboration() {
  local label="$1" pm2_name="$2"
  local snippet classification
  snippet="$(s4f4_fetch_replica_startup_log_snippet "$pm2_name")"
  classification="$(s4f4_classify_runtime_from_log_snippet "$snippet")"
  if [[ "$classification" == "ENABLED" ]]; then
    echo "REPLICA_${label}_STARTUP_LOG_CORROBORATION=YES"
  else
    echo "REPLICA_${label}_STARTUP_LOG_CORROBORATION=NO"
  fi
}

s4f4_fixture_live_metric_value() {
  local label="$1"
  case "$label" in
    A)
      if [[ -n "${DI_S4F4_FIXTURE_METRIC_A:-}" ]]; then echo "${DI_S4F4_FIXTURE_METRIC_A}"; return 0; fi
      ;;
    B)
      if [[ -n "${DI_S4F4_FIXTURE_METRIC_B:-}" ]]; then echo "${DI_S4F4_FIXTURE_METRIC_B}"; return 0; fi
      ;;
  esac
  if s4f4_is_fixture_mode || [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    echo "${DI_S4F4_FIXTURE_METRIC_DEFAULT:-1}"
    return 0
  fi
  echo ""
}

s4f4_classify_live_metric_value() {
  local raw="$1"
  if [[ "$raw" == "1" ]]; then echo "ENABLED"; return 0; fi
  if [[ "$raw" == "0" ]]; then echo "DISABLED"; return 0; fi
  echo "UNKNOWN"
}

s4f4_fetch_live_global_budget_metric_raw() {
  local port="$1" env_file="$2" label="$3"
  if [[ "${DI_S4F4_TEST_INJECT_METRICS_AUTH_FAIL:-0}" == "1" ]]; then
    return 1
  fi
  local fixture
  fixture="$(s4f4_fixture_live_metric_value "$label")"
  if [[ -n "$fixture" ]]; then
    echo "$fixture"
    return 0
  fi
  s4f4_run_cli fetch-live-metric "$env_file" "$port"
}

s4f4_query_replica_live_global_budget_metric() {
  local label="$1" port="$2" env_file="$3"
  local raw proof
  if [[ "${DI_S4F4_TEST_INJECT_RUNTIME_PROOF_FAIL:-0}" == "1" ]]; then
    echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=UNKNOWN"
    return 1
  fi
  raw="$(s4f4_fetch_live_global_budget_metric_raw "$port" "$env_file" "$label" 2>/dev/null || true)"
  if [[ "$raw" == "x" || "$raw" == "missing" ]]; then
    echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=UNKNOWN"
    return 1
  fi
  if [[ -z "$raw" ]]; then
    echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=UNKNOWN"
    return 1
  fi
  proof="$(s4f4_classify_live_metric_value "$raw")"
  echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=${proof}"
  echo "REPLICA_${label}_LIVE_METRIC_RAW=${raw}"
  [[ "$proof" == "ENABLED" ]]
}

s4f4_capture_pm2_identity() {
  local name="$1" label="$2"
  local pid uptime
  if [[ "${DI_S4F4_TEST_MODE:-0}" == "1" || s4f4_is_fixture_mode ]]; then
    case "$label" in
      A)
        pid="${DI_S4F4_TEST_PM2_PID_BEFORE_A:-1000}"
        uptime="${DI_S4F4_TEST_PM2_UPTIME_BEFORE_A:-3600}"
        ;;
      B)
        pid="${DI_S4F4_TEST_PM2_PID_BEFORE_B:-1000}"
        uptime="${DI_S4F4_TEST_PM2_UPTIME_BEFORE_B:-3600}"
        ;;
      *)
        pid="1000"
        uptime="3600"
        ;;
    esac
    echo "$pid"
    echo "$uptime"
    return 0
  fi
  pid="$(vps_replica_pm2_pid "$name")"
  uptime="$(vps_replica_pm2_uptime_sec "$name")"
  echo "$pid"
  echo "$uptime"
}

s4f4_verify_post_restart_pm2_identity() {
  local name="$1" label="$2" pid_before="$3" uptime_before="$4"
  local pid_after uptime_after
  if [[ "${DI_S4F4_TEST_MODE:-0}" == "1" || s4f4_is_fixture_mode ]]; then
    case "$label" in
      A)
        pid_after="${DI_S4F4_TEST_PM2_PID_AFTER_A:-2000}"
        uptime_after="${DI_S4F4_TEST_PM2_UPTIME_AFTER_A:-2}"
        ;;
      B)
        pid_after="${DI_S4F4_TEST_PM2_PID_AFTER_B:-2000}"
        uptime_after="${DI_S4F4_TEST_PM2_UPTIME_AFTER_B:-2}"
        ;;
      *)
        pid_after="2000"
        uptime_after="2"
        ;;
    esac
    if [[ "$pid_after" != "$pid_before" || "$uptime_after" -lt "$uptime_before" ]]; then
      echo "REPLICA_${label}_POST_RESTART_IDENTITY_PROVEN=YES"
      echo "REPLICA_${label}_POST_RESTART_IDENTITY_PROVEN_BY=pid_or_uptime"
      return 0
    fi
    echo "REPLICA_${label}_POST_RESTART_IDENTITY_PROVEN=NO"
    return 1
  fi
  pid_after="$(vps_replica_pm2_pid "$name")"
  uptime_after="$(vps_replica_pm2_uptime_sec "$name")"
  if [[ "$pid_after" == "0" || "$uptime_after" -lt 0 ]]; then
    echo "REPLICA_${label}_POST_RESTART_IDENTITY_PROVEN=NO"
    return 1
  fi
  if [[ "$pid_after" != "$pid_before" ]] || [[ "$uptime_after" -lt "$uptime_before" ]]; then
    echo "REPLICA_${label}_POST_RESTART_IDENTITY_PROVEN=YES"
    echo "REPLICA_${label}_POST_RESTART_IDENTITY_PROVEN_BY=pid_or_uptime"
    return 0
  fi
  echo "REPLICA_${label}_POST_RESTART_IDENTITY_PROVEN=NO"
  return 1
}

s4f4_prove_replica_live_metric_only() {
  local label="$1" port="$2" env_file="$3" pm2_name="$4"
  s4f4_query_replica_live_global_budget_metric "$label" "$port" "$env_file"
  local ok=$?
  s4f4_report_startup_log_corroboration "$label" "$pm2_name" || true
  return $ok
}

s4f4_prove_replica_after_restart() {
  local label="$1" name="$2" port="$3" env_file="$4" pid_before="$5" uptime_before="$6"
  if ! s4f4_verify_post_restart_pm2_identity "$name" "$label" "$pid_before" "$uptime_before"; then
    echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=UNKNOWN"
    return 1
  fi
  s4f4_prove_replica_live_metric_only "$label" "$port" "$env_file" "$name"
}

s4f4_live_runtime_for_idempotent_decision() {
  local label="$1" port="$2" env_file="$3"
  S4F4_METRIC_QUERY_LABEL="$label"
  local raw
  raw="$(s4f4_fetch_live_global_budget_metric_raw "$port" "$env_file" "$label" 2>/dev/null || true)"
  s4f4_classify_live_metric_value "${raw:-unknown}"
}

s4f4_verify_redis_reachable() {
  local env_file="$1"
  echo "REDIS_CONFIG_SOURCE=CANONICAL_HOST_PORT_PASSWORD_DB"
  echo "REDIS_PING_REQUIRED=YES"
  if [[ "${DI_S4F4_TEST_INJECT_REDIS_FAIL:-0}" == "1" ]]; then
    echo "REDIS_REACHABLE=NO"
    return 1
  fi
  if s4f4_is_fixture_mode || [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    if ! s4f4_run_cli redis-ping "$env_file" --fixture-ok; then
      echo "REDIS_REACHABLE=NO"
      return 1
    fi
    echo "REDIS_REACHABLE=YES"
    return 0
  fi
  if ! s4f4_run_cli redis-ping "$env_file"; then
    echo "REDIS_REACHABLE=NO"
    return 1
  fi
  echo "REDIS_REACHABLE=YES"
  return 0
}

s4f4_verify_app_module_s4_dormant() {
  local backend_root app_module
  backend_root="$(s4f4_rollout_backend_root)" || return 1
  app_module="${backend_root}/src/app.module.ts"
  if [[ ! -f "$app_module" ]]; then
    echo "S4_APP_MODULE_REGISTERED=UNKNOWN"
    return 1
  fi
  if grep -qE 'di-v0-s4[bcde]|DiV0S4[BC]' "$app_module" 2>/dev/null; then
    echo "S4_APP_MODULE_REGISTERED=YES"
    return 1
  fi
  echo "S4_APP_MODULE_REGISTERED=NO"
  return 0
}

s4f4_recovery_post_verify() {
  local target_sha="$1"
  echo "ROLLBACK_FULL_POST_VERIFY_REQUIRED=YES"
  if [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    echo "ROLLBACK_REPLICA_HEALTH=PASS"
    echo "ROLLBACK_SCHEDULER_CONVERGENCE=PASS"
    echo "ROLLBACK_POST_VERIFY=PASS"
    return 0
  fi
  if ! vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha"; then
    echo "ROLLBACK_REPLICA_HEALTH=FAIL"
    return 1
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha"; then
      echo "ROLLBACK_REPLICA_HEALTH=FAIL"
      return 1
    fi
  fi
  if ! vps_replica_verify_no_mixed_sha "$target_sha"; then
    echo "ROLLBACK_REPLICA_HEALTH=FAIL"
    return 1
  fi
  if ! vps_replica_wait_scheduler_leader_convergence; then
    echo "ROLLBACK_SCHEDULER_CONVERGENCE=FAIL"
    return 1
  fi
  if ! vps_replica_verify_scheduler_leaders 1; then
    echo "ROLLBACK_SCHEDULER_CONVERGENCE=FAIL"
    return 1
  fi
  if ! vps_replica_nginx_dual_upstream_ok; then
    echo "ROLLBACK_POST_VERIFY=FAIL"
    return 1
  fi
  echo "ROLLBACK_REPLICA_HEALTH=PASS"
  echo "ROLLBACK_SCHEDULER_CONVERGENCE=PASS"
  echo "ROLLBACK_POST_VERIFY=PASS"
  return 0
}
