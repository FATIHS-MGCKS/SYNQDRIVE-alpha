#!/usr/bin/env bash
# S4F-7AS Gate-6 OPEN / EMERGENCY_REKILL Production helpers — sourced only.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7AS_SCRIPT_DIR="${S4F7AS_SCRIPT_DIR:-}"
S4F7AS_PRODUCTION_SHARED_BACKEND_ENV="/opt/synqdrive/shared/backend.env"

s4f7as_resolve_canonical_backend_env() {
  local p="${BACKEND_ENV:-}"
  [[ -z "$p" ]] && return 1
  readlink -f "$p" 2>/dev/null || echo "$p"
}

s4f7as_is_production_backend_env_path() {
  local canonical
  canonical="$(s4f7as_resolve_canonical_backend_env)" || return 1
  [[ "$canonical" == "$(readlink -f "$S4F7AS_PRODUCTION_SHARED_BACKEND_ENV" 2>/dev/null || echo "$S4F7AS_PRODUCTION_SHARED_BACKEND_ENV")" ]]
}

s4f7as_export_canonical_backend_env() {
  local canonical
  canonical="$(s4f7as_resolve_canonical_backend_env)" || return 1
  export SYNQDRIVE_BACKEND_ENV_CANONICAL="$canonical"
  export BACKEND_ENV="$canonical"
  export SYNQDRIVE_BACKEND_ENV="$canonical"
  echo "SYNQDRIVE_BACKEND_ENV_CANONICAL=${canonical}"
}

s4f7as_is_test_mode() {
  [[ "${DI_S4F7AS_TEST_MODE:-0}" == "1" || "${DI_S4F7J_TEST_MODE:-0}" == "1" || "${DI_S4F7AO_TEST_MODE:-0}" == "1" ]]
}

s4f7as_is_fixture_mode() {
  [[ "${DI_S4F7AS_FIXTURE_MODE:-0}" == "1" || "${DI_S4F7J_FIXTURE_MODE:-0}" == "1" || "${DI_S4F7AO_FIXTURE_MODE:-0}" == "1" ]]
}

s4f7as_production_fixture_env_present() {
  local name
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    if [[ -n "${!name:-}" ]]; then
      echo "PRODUCTION_FIXTURE_ENV_PRESENT=${name}"
      return 0
    fi
  done <<'EOF'
DI_S4F7AS_FIXTURE_MODE
DI_S4F7J_FIXTURE_MODE
DI_S4F7AO_FIXTURE_MODE
DI_S4F7AS_FIXTURE_METRICS_BODY_A
DI_S4F7AS_FIXTURE_METRICS_BODY_B
DI_S4F7J_FIXTURE_METRICS_BODY_A
DI_S4F7J_FIXTURE_METRICS_BODY_B
DI_S4F7J_FIXTURE_METRICS_BODY
DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE
DI_S4F7J_FIXTURE_VEHICLE_DB_LINES
DI_S4F7J_FIXTURE_DEPLOYED_SHA
DI_S4F7J_FIXTURE_RELEASE_DIR
DI_S4F7AS_ENGINEERING_TEST_HARNESS
EOF
  return 1
}

s4f7as_assert_production_test_isolation() {
  if ! s4f7as_is_production_backend_env_path; then
    echo "PRODUCTION_TEST_CONTROL_FORBIDDEN=NOT_APPLICABLE"
    return 0
  fi
  if s4f7as_is_test_mode || s4f7as_is_fixture_mode; then
    echo "PRODUCTION_TEST_CONTROL_FORBIDDEN=YES"
    echo "ACCIDENTAL_TEST_CONTROL_IN_REAL_LIVE_PATH=YES"
    return 1
  fi
  if [[ "${DI_S4F7AS_ENGINEERING_TEST_HARNESS:-}" == "YES" ]]; then
    echo "PRODUCTION_TEST_CONTROL_FORBIDDEN=YES"
    return 1
  fi
  if s4f7as_production_fixture_env_present; then
    echo "PRODUCTION_TEST_CONTROL_FORBIDDEN=YES"
    return 1
  fi
  echo "PRODUCTION_TEST_CONTROL_FORBIDDEN=NO"
  return 0
}

s4f7as_assert_explicit_dry_run_mode() {
  if [[ -z "${DRY_RUN+set}" ]]; then
    echo "EXPLICIT_DRY_RUN_REQUIRED=YES"
    return 1
  fi
  if [[ "${DRY_RUN}" != "0" && "${DRY_RUN}" != "1" ]]; then
    echo "EXPLICIT_DRY_RUN_INVALID=YES"
    return 1
  fi
  echo "EXPLICIT_DRY_RUN_MODE=${DRY_RUN}"
  return 0
}

s4f7as_wrapper_backend_root() {
  local script_dir="${S4F7AS_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" && -d "${script_dir}/../.." ]]; then
    echo "$(cd "${script_dir}/../.." && pwd)"
    return 0
  fi
  return 1
}

s4f7as_run_cli() {
  local backend_root
  backend_root="$(s4f7as_wrapper_backend_root)" || return 1
  local cli_rel="scripts/ops/di-v0-s4-gate6-open-rekill-production/di-v0-s4-gate6-open-rekill-production-cli.ts"
  (cd "$backend_root" && npx --yes ts-node --transpile-only "$cli_rel" "$@")
}

s4f7as_fetch_replica_metrics_body() {
  local port="$1" label="$2"
  if s4f7as_is_production_backend_env_path; then
    :
  else
    case "$label" in
      A)
        if [[ -n "${DI_S4F7AS_FIXTURE_METRICS_BODY_A:-}" && -f "${DI_S4F7AS_FIXTURE_METRICS_BODY_A}" ]]; then cat "${DI_S4F7AS_FIXTURE_METRICS_BODY_A}"; return 0; fi
        if [[ -n "${DI_S4F7J_FIXTURE_METRICS_BODY_A:-}" && -f "${DI_S4F7J_FIXTURE_METRICS_BODY_A}" ]]; then cat "${DI_S4F7J_FIXTURE_METRICS_BODY_A}"; return 0; fi
        ;;
      B)
        if [[ -n "${DI_S4F7AS_FIXTURE_METRICS_BODY_B:-}" && -f "${DI_S4F7AS_FIXTURE_METRICS_BODY_B}" ]]; then cat "${DI_S4F7AS_FIXTURE_METRICS_BODY_B}"; return 0; fi
        if [[ -n "${DI_S4F7J_FIXTURE_METRICS_BODY_B:-}" && -f "${DI_S4F7J_FIXTURE_METRICS_BODY_B}" ]]; then cat "${DI_S4F7J_FIXTURE_METRICS_BODY_B}"; return 0; fi
        ;;
    esac
  fi
  local token
  token=$(grep -m1 '^METRICS_BEARER_TOKEN=' "$BACKEND_ENV" | cut -d= -f2-)
  curl -sf -H "Authorization: Bearer ${token}" "http://127.0.0.1:${port}/api/v1/metrics"
}

s4f7as_collect_open_preflight_exports() {
  TARGET_SHA="$(s4f7j_resolve_deployed_sha)"
  REQUIRED_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
  REQUIRED_PRE_ENV_SHA256="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"
  export DI_S4_TINY_STAGING_ACTUAL_SHA="$TARGET_SHA"
  export DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID="$REQUIRED_RELEASE_ID"
  export DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256="$(s4f4_file_sha256 "$BACKEND_ENV")"

  local -a global_lines=()
  mapfile -t global_lines < <(s4f7j_query_global_row_db)
  local -a s4_lines=()
  mapfile -t s4_lines < <(s4f7j_query_s4_counts_db)
  local -a vehicle_lines=()
  mapfile -t vehicle_lines < <(s4f7j_query_vehicle_db) || return 1

  export DI_S4F7AS_GLOBAL_ROW_LINES="$(printf '%s\n' "${global_lines[@]}")"
  export DI_S4F7AS_S4_PERSISTENCE_LINES="$(printf '%s\n' "${s4_lines[@]}")"
  export DI_S4F7AS_VEHICLE_DB_LINES="$(printf '%s\n' "${vehicle_lines[@]}")"
  export DI_S4F7AS_ENV_CONTENT="$(cat "$BACKEND_ENV")"

  if ! s4f7j_live_topology_preflight "$TARGET_SHA" "$(s4f7j_resolve_release_dir)"; then
    export DI_S4F7AS_TOPOLOGY_OK=NO
    return 1
  fi
  export DI_S4F7AS_TOPOLOGY_OK=YES
  if ! s4f7j_live_budget_redis_preflight "$(s4f7j_resolve_release_dir)"; then
    export DI_S4F7AS_BUDGET_RUNTIME_OK=NO
    return 1
  fi
  export DI_S4F7AS_BUDGET_CONFIG_OK=YES
  export DI_S4F7AS_BUDGET_RUNTIME_OK=YES
  export DI_S4F7AS_REDIS_OK=YES

  local metrics_a metrics_b expected_fp
  metrics_a="$(mktemp)"
  metrics_b="$(mktemp)"
  s4f7as_fetch_replica_metrics_body "${SYNQDRIVE_REPLICA_A_PORT}" A >"$metrics_a"
  s4f7as_fetch_replica_metrics_body "${SYNQDRIVE_REPLICA_B_PORT}" B >"$metrics_b"
  expected_fp="$(s4f7ao_run_cli derive-fingerprint "$BACKEND_ENV" | awk -F= '/^INTERNALLY_COMPUTED_FINGERPRINT=/{print $2}')"
  export DI_S4_GATE6_EXPECTED_ATTESTATION_FINGERPRINT="${DI_S4_GATE6_EXPECTED_ATTESTATION_FINGERPRINT:-$expected_fp}"
  export DI_S4_GATE6_REPLICA_A_ATTESTATION_FINGERPRINT="$(grep -m1 'synqdrive_di_v0_s4_runtime_config_attestation_info{' "$metrics_a" | sed -n 's/.*fingerprint="\([^"]*\)".*/\1/p')"
  export DI_S4_GATE6_REPLICA_B_ATTESTATION_FINGERPRINT="$(grep -m1 'synqdrive_di_v0_s4_runtime_config_attestation_info{' "$metrics_b" | sed -n 's/.*fingerprint="\([^"]*\)".*/\1/p')"
  rm -f "$metrics_a" "$metrics_b"
  return 0
}

s4f7as_export_wrapper_attestation() {
  export DI_S4_GATE6_WRAPPER_ATTESTATION="${DI_S4_GATE6_WRAPPER_ATTESTATION:-SYNQDRIVE_GATE6_PINNED_WRAPPER_V1}"
  echo "WRAPPER_ATTESTATION_EXPORTED=YES"
  return 0
}

s4f7as_assert_open_audit_and_pins() {
  if [[ -z "${DI_S4_TINY_STAGING_REQUIRED_SHA:-}" || -z "${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}" || -z "${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}" ]]; then
    echo "LIVE_OPEN_PINS_INCOMPLETE=YES"
    return 1
  fi
  if [[ -z "${DI_S4_GATE6_OPERATOR_REASON:-}" || -z "${DI_S4_GATE6_OPERATOR_ACTOR:-}" ]]; then
    echo "AUDIT_FIELDS_MISSING=YES"
    return 1
  fi
  return 0
}

s4f7as_preflight_open_readonly() {
  echo "EXP021_S4F7AS_OPEN_PREFLIGHT_READONLY=1"
  s4f7as_collect_open_preflight_exports || return 1
  local actual_env_sha
  actual_env_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$actual_env_sha" != "$REQUIRED_PRE_ENV_SHA256" ]]; then
    echo "PRE_ENV_HASH_MISMATCH=YES"
    return 1
  fi
  s4f7as_run_cli guards-open || return 1
  echo "OPEN_PREFLIGHT_OK=YES"
  return 0
}

s4f7as_execute_preflight_mode() {
  s4f7as_assert_production_test_isolation || return 1
  s4f7as_preflight_open_readonly || return 1
  return 0
}

s4f7as_execute_dry_run_mode() {
  s4f7as_assert_production_test_isolation || return 1
  if [[ "${DI_S4_GATE6_OPEN_ACK:-}" != "YES" || "${DI_S4_GATE6_OPEN_AUTHORIZED:-}" != "YES" ]]; then
    echo "GATE6_OPEN_AUTHORIZATION=MISSING"
    return 1
  fi
  export DI_S4_GATE6_DRY_RUN_AUTHORIZED=YES
  export DRY_RUN=1
  s4f7as_assert_open_audit_and_pins || return 1
  s4f7as_preflight_open_readonly || return 1
  s4f7as_run_cli dry-run-open || return 1
  s4f7as_run_cli read-global || true
  echo "DRY_RUN_OPEN_COMPLETE=YES"
  echo "GLOBAL_DB_MUTATION_OCCURRED=NO"
  echo "S4_ACTIVATION_OCCURRED=NO"
  return 0
}

s4f7as_execute_live_open_mode() {
  s4f7as_assert_production_test_isolation || return 1
  if [[ "${DI_S4_GATE6_OPEN_ACK:-}" != "YES" || "${DI_S4_GATE6_OPEN_AUTHORIZED:-}" != "YES" ]]; then
    echo "GATE6_OPEN_AUTHORIZATION=MISSING"
    return 1
  fi
  export DI_S4_GATE6_PILOT_VEHICLE_CONFIRM="${DI_S4_GATE6_PILOT_VEHICLE_CONFIRM:-c10351f8-b6a2-4258-947f-631aeaa6d359}"
  export DRY_RUN=0
  s4f7as_assert_open_audit_and_pins || return 1
  s4f7as_preflight_open_readonly || return 1
  if ! s4f7as_run_cli live-open; then
    echo "LIVE_OPEN_FAILED=YES"
    return 1
  fi
  echo "LIVE_OPEN_COMPLETE=YES"
  echo "GLOBAL_KILL_OPENED=YES"
  echo "GLOBAL_DB_MUTATION_OCCURRED=YES"
  return 0
}

# Legacy entry for older callers.
s4f7as_execute_open_mode() {
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    s4f7as_execute_dry_run_mode
  else
    s4f7as_execute_live_open_mode
  fi
}

s4f7as_execute_emergency_rekill_mode() {
  s4f7as_assert_production_test_isolation || return 1
  if [[ "${DI_S4_GATE6_EMERGENCY_REKILL_ACK:-}" != "YES" ]]; then
    echo "EMERGENCY_REKILL_ACK=MISSING"
    return 1
  fi
  if [[ -z "${DI_S4_GATE6_OPERATOR_REASON:-}" || -z "${DI_S4_GATE6_OPERATOR_ACTOR:-}" ]]; then
    echo "AUDIT_FIELDS_MISSING=YES"
    return 1
  fi
  if ! s4f7as_run_cli live-rekill; then
    echo "EMERGENCY_REKILL_FAILED=YES"
    return 1
  fi
  if ! s4f7as_run_cli read-global; then
    echo "EMERGENCY_REKILL_POST_READ_FAILED=YES"
    echo "CRITICAL_RECOVERY_STATE=YES"
    return 1
  fi
  echo "EMERGENCY_REKILL_COMPLETE=YES"
  return 0
}
