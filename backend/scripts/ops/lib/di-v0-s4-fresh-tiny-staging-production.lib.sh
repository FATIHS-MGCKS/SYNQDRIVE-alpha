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

# Reuse S4F-7J read-only DB helpers when available.
if [[ -f "${S4F7V_SCRIPT_DIR:-}/lib/di-v0-s4-tiny-staging-production.lib.sh" ]]; then
  # shellcheck source=lib/di-v0-s4-tiny-staging-production.lib.sh
  source "${S4F7V_SCRIPT_DIR}/lib/di-v0-s4-tiny-staging-production.lib.sh"
fi
