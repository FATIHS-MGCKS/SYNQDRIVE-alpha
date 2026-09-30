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
    return 0
  fi
  S4F4_ENV_META_OWNER="$(stat -c '%U:%G' "$file" 2>/dev/null || stat -f '%Su:%Sg' "$file" 2>/dev/null || echo "")"
  S4F4_ENV_META_MODE="$(stat -c '%a' "$file" 2>/dev/null || stat -f '%OLp' "$file" 2>/dev/null || echo "600")"
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
  chmod 600 "$tmp"
  if [[ -n "${S4F4_ENV_META_OWNER:-}" ]]; then
    chown "${S4F4_ENV_META_OWNER}" "$tmp" 2>/dev/null || true
  fi
  s4f4_atomic_promote_env_file "$tmp" "$target" restore
  after="$(s4f4_file_sha256 "$target")"
  echo "BACKEND_ENV_SHA256_AFTER_RECOVERY=${after}"
  if [[ "$after" != "$expected_sha256" ]]; then
    echo "RESTORE_CHECKSUM_MISMATCH=YES"
    echo "BACKEND_ENV_RESTORED=NO"
    return 1
  fi
  echo "BACKEND_ENV_RESTORED=YES"
  echo "ROLLBACK_RESTORES_ENV=YES"
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

s4f4_fixture_runtime_proof() {
  local replica="$1"
  if [[ "${DI_S4F4_FIXTURE_RUNTIME_A:-}" == "ENABLED" && "$replica" == "A" ]]; then echo "ENABLED"; return 0; fi
  if [[ "${DI_S4F4_FIXTURE_RUNTIME_B:-}" == "ENABLED" && "$replica" == "B" ]]; then echo "ENABLED"; return 0; fi
  if [[ "${DI_S4F4_FIXTURE_RUNTIME_A:-}" == "UNKNOWN" && "$replica" == "A" ]]; then echo "UNKNOWN"; return 0; fi
  if [[ "${DI_S4F4_FIXTURE_RUNTIME_B:-}" == "UNKNOWN" && "$replica" == "B" ]]; then echo "UNKNOWN"; return 0; fi
  if s4f4_is_fixture_mode || [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    echo "${DI_S4F4_FIXTURE_RUNTIME_DEFAULT:-ENABLED}"
    return 0
  fi
  echo "UNKNOWN"
}

s4f4_fetch_replica_runtime_log_snippet() {
  local pm2_name="$1" lines="${2:-400}"
  if s4f4_is_fixture_mode || [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    echo "${DI_S4F4_FIXTURE_PM2_LOG_SNIPPET:-${DI_S4_GLOBAL_BUDGET_RUNTIME_LOG_MARKER}}"
    return 0
  fi
  pm2 logs "$pm2_name" --nostream --lines "$lines" 2>/dev/null || true
}

s4f4_prove_replica_runtime_budget() {
  local label="$1" pm2_name="$2"
  local snippet proof
  if [[ "$label" == "A" ]]; then
    proof="$(s4f4_fixture_runtime_proof A)"
    if [[ "$proof" != "UNKNOWN" && ( s4f4_is_fixture_mode || "${DI_S4F4_TEST_MODE:-0}" == "1" ) ]]; then
      echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=${proof}"
      [[ "$proof" == "ENABLED" ]]
      return
    fi
  elif [[ "$label" == "B" ]]; then
    proof="$(s4f4_fixture_runtime_proof B)"
    if [[ "$proof" != "UNKNOWN" && ( s4f4_is_fixture_mode || "${DI_S4F4_TEST_MODE:-0}" == "1" ) ]]; then
      echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=${proof}"
      [[ "$proof" == "ENABLED" ]]
      return
    fi
  fi
  snippet="$(s4f4_fetch_replica_runtime_log_snippet "$pm2_name")"
  proof="$(s4f4_classify_runtime_from_log_snippet "$snippet")"
  echo "REPLICA_${label}_GLOBAL_BUDGET_RUNTIME=${proof}"
  [[ "$proof" == "ENABLED" ]]
}

s4f4_verify_redis_reachable() {
  local env_file="$1"
  local url
  url="$(node -e '
    const fs=require("fs");const f=process.argv[1];let u="";
    for(const line of fs.readFileSync(f,"utf8").split(/\n/)){
      if(line.startsWith("REDIS_URL=")) u=line.slice(10).trim();
    }
    process.stdout.write(u);
  ' "$env_file" 2>/dev/null || true)"
  if [[ -z "$url" ]]; then
    echo "REDIS_URL_CONFIGURED=NO"
    echo "REDIS_REACHABLE=SKIPPED_NO_URL"
    return 0
  fi
  echo "REDIS_URL_CONFIGURED=YES"
  if s4f4_is_fixture_mode || [[ "${DI_S4F4_TEST_MODE:-0}" == "1" ]]; then
    echo "REDIS_REACHABLE=FIXTURE_PASS"
    return 0
  fi
  if [[ "${DI_S4F4_TEST_INJECT_REDIS_FAIL:-0}" == "1" ]]; then
    echo "REDIS_REACHABLE=NO"
    return 1
  fi
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -u "$url" ping 2>/dev/null | grep -q PONG; then
      echo "REDIS_REACHABLE=YES"
      return 0
    fi
  fi
  echo "REDIS_REACHABLE=NO"
  return 1
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
