#!/usr/bin/env bash
# EXP-021 S4F-7AA.1 — local tool-pin authority (no Production side effects).
set -euo pipefail

S4F7AA_STALE_PIN_ENV_VARS=(
  TOOL_AUTHORITY_SHA
  EXPECTED_FRESH_TINY_STAGING_TOOL_SHA
  CLOUD_AGENT_S4F7X_TOOL_SHA
  CLOUD_AGENT_S4F7AA_TOOL_SHA
)

s4f7aa_read_sealed_tool_sha_from_evidence() {
  local evidence_path="$1"
  if [[ ! -f "$evidence_path" ]]; then
    echo "S4F7AA_FAIL_CLOSED=Z2_EVIDENCE_MISSING" >&2
    return 1
  fi
  local sealed
  sealed="$(grep -E '^\| \*\*`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA`\*\*' "$evidence_path" | sed -n 's/.*`\([0-9a-f]\{40\}\)`.*/\1/p' || true)"
  if [[ -z "$sealed" ]] || ! [[ "$sealed" =~ ^[0-9a-f]{40}$ ]]; then
    echo "S4F7AA_FAIL_CLOSED=Z2_EVIDENCE_SEAL_UNREADABLE" >&2
    return 1
  fi
  printf '%s' "$sealed"
}

s4f7aa_collect_stale_tool_pin_violations() {
  local sealed="$1"
  local var value
  local -a violations=()
  for var in "${S4F7AA_STALE_PIN_ENV_VARS[@]}"; do
    value="${!var:-}"
    if [[ -n "$value" && "$value" != "$sealed" ]]; then
      violations+=("${var}=${value}")
    fi
  done
  if ((${#violations[@]} > 0)); then
    printf '%s\n' "${violations[@]}"
    return 1
  fi
  return 0
}

s4f7aa_clear_tool_pin_env() {
  local var
  for var in "${S4F7AA_STALE_PIN_ENV_VARS[@]}"; do
    unset "$var" || true
  done
}

s4f7aa_resolve_tool_sha_for_dispatch() {
  local evidence_path="$1"
  local sealed
  sealed="$(s4f7aa_read_sealed_tool_sha_from_evidence "$evidence_path")"
  if ! s4f7aa_collect_stale_tool_pin_violations "$sealed" >/dev/null; then
    echo "S4F7AA_FAIL_CLOSED=STALE_TOOL_PIN_ENV" >&2
    s4f7aa_collect_stale_tool_pin_violations "$sealed" >&2 || true
    echo "SEALED_FROM_AUTHORITY=${sealed}" >&2
    return 1
  fi
  s4f7aa_clear_tool_pin_env
  printf '%s' "$sealed"
}

s4f7aa_bootstrap_script_identity() {
  local bootstrap_path="$1"
  if [[ ! -f "$bootstrap_path" ]]; then
    echo "S4F7AA_FAIL_CLOSED=BOOTSTRAP_SCRIPT_MISSING" >&2
    return 1
  fi
  local sha
  sha="$(sha256sum "$bootstrap_path" | awk '{print $1}')"
  echo "BOOTSTRAP_SCRIPT_PATH=${bootstrap_path}"
  echo "BOOTSTRAP_SCRIPT_SHA256=${sha}"
}

s4f7aa_assert_local_dispatch_guards() {
  if [[ "${DI_S4F7Y_LIVE_STAGING_AUTHORIZED:-}" == "YES" ]]; then
    echo "S4F7AA_FAIL_CLOSED=LIVE_STAGING_AUTH_FORBIDDEN_LOCAL" >&2
    return 1
  fi
  if [[ "${DRY_RUN:-}" == "0" ]]; then
    echo "S4F7AA_FAIL_CLOSED=DRY_RUN_ZERO_FORBIDDEN_LOCAL" >&2
    return 1
  fi
  if [[ "${S4F7AA_SKIP_PRODUCTION_DISPATCH:-}" == "1" ]]; then
    echo "S4F7AA_FAIL_CLOSED=PRODUCTION_DISPATCH_DISABLED" >&2
    return 1
  fi
  return 0
}
