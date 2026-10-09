#!/usr/bin/env bash
# S4F-7AO five-flag Tiny activation Production helpers — sourced only.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7AO_SCRIPT_DIR="${S4F7AO_SCRIPT_DIR:-}"

s4f7ao_is_test_mode() {
  [[ "${DI_S4F7AO_TEST_MODE:-0}" == "1" || "${DI_S4F7J_TEST_MODE:-0}" == "1" ]]
}

s4f7ao_is_fixture_mode() {
  [[ "${DI_S4F7AO_FIXTURE_MODE:-0}" == "1" || "${DI_S4F7J_FIXTURE_MODE:-0}" == "1" ]]
}

s4f7ao_wrapper_backend_root() {
  local script_dir="${S4F7AO_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" && -d "${script_dir}/../.." ]]; then
    echo "$(cd "${script_dir}/../.." && pwd)"
    return 0
  fi
  echo ""
  return 1
}

s4f7ao_run_cli() {
  local backend_root
  backend_root="$(s4f7ao_wrapper_backend_root)" || return 1
  local cli_rel="scripts/ops/di-v0-s4-five-flag-tiny-activation-production/di-v0-s4-five-flag-tiny-activation-production-cli.ts"
  if [[ ! -f "${backend_root}/${cli_rel}" ]]; then
    echo "S4F7AO_CLI_MISSING=YES"
    return 1
  fi
  (cd "$backend_root" && npx --yes ts-node --transpile-only "$cli_rel" "$@")
}

s4f7ao_fetch_replica_metrics_body() {
  local port="$1" env_file="$2" label="$3"
  case "$label" in
    A)
      if [[ -n "${DI_S4F7AO_FIXTURE_METRICS_BODY_A:-}" && -f "${DI_S4F7AO_FIXTURE_METRICS_BODY_A}" ]]; then cat "${DI_S4F7AO_FIXTURE_METRICS_BODY_A}"; return 0; fi
      if [[ -n "${DI_S4F7J_FIXTURE_METRICS_BODY_A:-}" && -f "${DI_S4F7J_FIXTURE_METRICS_BODY_A}" ]]; then cat "${DI_S4F7J_FIXTURE_METRICS_BODY_A}"; return 0; fi
      ;;
    B)
      if [[ -n "${DI_S4F7AO_FIXTURE_METRICS_BODY_B:-}" && -f "${DI_S4F7AO_FIXTURE_METRICS_BODY_B}" ]]; then cat "${DI_S4F7AO_FIXTURE_METRICS_BODY_B}"; return 0; fi
      if [[ -n "${DI_S4F7J_FIXTURE_METRICS_BODY_B:-}" && -f "${DI_S4F7J_FIXTURE_METRICS_BODY_B}" ]]; then cat "${DI_S4F7J_FIXTURE_METRICS_BODY_B}"; return 0; fi
      ;;
  esac
  local token
  token=$(grep -m1 '^METRICS_BEARER_TOKEN=' "$env_file" | cut -d= -f2-)
  curl -sf -H "Authorization: Bearer ${token}" "http://127.0.0.1:${port}/api/v1/metrics"
}

s4f7ao_prove_replica_five_flag_runtime() {
  local label="$1" port="$2" env_file="$3" expected_fp="$4"
  local metrics_file
  metrics_file="$(mktemp)"
  if ! s4f7ao_fetch_replica_metrics_body "$port" "$env_file" "$label" >"$metrics_file"; then
    rm -f "$metrics_file"
    echo "REPLICA_${label}_FIVE_FLAG_ATTESTATION=FAIL"
    return 1
  fi
  if ! s4f7ao_run_cli prove-attestation "$metrics_file" "$expected_fp"; then
    rm -f "$metrics_file"
    return 1
  fi
  rm -f "$metrics_file"
  echo "REPLICA_${label}_FIVE_FLAG_ATTESTATION=PASS"
  return 0
}
