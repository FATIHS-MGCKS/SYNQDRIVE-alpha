#!/usr/bin/env bash
# VO5C Cloud Agent fixed VPS bootstrap — integrity verification + pinned-runner delegate.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

_OPS_LIB_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vo5c-operator-deploy-session.lib.sh
source "${_OPS_LIB_SELF}/vo5c-operator-deploy-session.lib.sh"

VO5C_CLOUD_AGENT_EXIT_MISSING_AUTH=42
VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY=45

vo5c_cloud_agent_bootstrap_apply_default_paths() {
  VO5C_CLOUD_AGENT_BOOTSTRAP_PATH="${VO5C_CLOUD_AGENT_BOOTSTRAP_PATH:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh}"
  VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST="${VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env}"
  VO5C_CLOUD_AGENT_PIN_ENV="${VO5C_CLOUD_AGENT_PIN_ENV:-/opt/synqdrive/shared/vo5c-pinned-executor.env}"
  VO5C_CLOUD_AGENT_OPERATOR_SESSION="${VO5C_CLOUD_AGENT_OPERATOR_SESSION:-/opt/synqdrive/shared/vo5c-operator-deploy-session.env}"
  VO5C_CLOUD_AGENT_AUTHORITY_ENV="${VO5C_CLOUD_AGENT_AUTHORITY_ENV:-/opt/synqdrive/shared/vo5c-production-deploy-authority.env}"
  VO5C_CLOUD_AGENT_ENFORCEMENT_ARMED="${VO5C_CLOUD_AGENT_ENFORCEMENT_ARMED:-/opt/synqdrive/shared/vo5c-production-deploy-enforcement-armed}"
  VO5C_CLOUD_AGENT_STAGED_ROOT="${VO5C_CLOUD_AGENT_STAGED_ROOT:-/opt/synqdrive/staging-release}"
}

vo5c_cloud_agent_bootstrap_parse_manifest() {
  local manifest_file=$1
  VO5C_MANIFEST_SHA256=''
  VO5C_MANIFEST_INSTALLED_FROM_COMMIT=''
  VO5C_MANIFEST_VERSION=''

  if [[ -L "$manifest_file" ]]; then
    echo "ABORT: bootstrap manifest must not be a symlink" >&2
    return 1
  fi
  if [[ ! -f "$manifest_file" ]]; then
    echo "ABORT: bootstrap manifest missing" >&2
    return 1
  fi
  local mode owner
  mode="$(stat -c '%a' "$manifest_file" 2>/dev/null || echo "")"
  owner="$(stat -c '%u' "$manifest_file" 2>/dev/null || echo "")"
  if [[ "$mode" != "600" ]]; then
    echo "ABORT: bootstrap manifest permissions must be 600 (got ${mode})" >&2
    return 1
  fi
  if [[ "${VO5C_CLOUD_AGENT_BOOTSTRAP_TEST_SKIP_OWNER:-0}" != "1" ]] && [[ "$owner" != "0" ]]; then
    echo "ABORT: bootstrap manifest must be root-owned (uid ${owner})" >&2
    return 1
  fi

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue
    [[ "$line" == *'='* ]] || { echo "ABORT: malformed manifest line" >&2; return 1; }
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      VO5C_CLOUD_AGENT_BOOTSTRAP_SHA256)
        [[ "$value" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "ABORT: invalid bootstrap SHA256 in manifest" >&2; return 1; }
        VO5C_MANIFEST_SHA256="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
        ;;
      VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALLED_FROM_COMMIT)
        vo5c_operator_session_is_full_sha "$value" || { echo "ABORT: invalid INSTALLED_FROM_COMMIT in manifest" >&2; return 1; }
        VO5C_MANIFEST_INSTALLED_FROM_COMMIT="$(vo5c_operator_session_normalize_sha "$value")"
        ;;
      VO5C_CLOUD_AGENT_BOOTSTRAP_VERSION)
        [[ "$value" =~ ^[0-9]+$ ]] || { echo "ABORT: invalid bootstrap VERSION in manifest" >&2; return 1; }
        VO5C_MANIFEST_VERSION="$value"
        ;;
      *)
        echo "ABORT: unknown manifest key: ${key}" >&2
        return 1
        ;;
    esac
  done <"$manifest_file"

  [[ -n "$VO5C_MANIFEST_SHA256" && -n "$VO5C_MANIFEST_INSTALLED_FROM_COMMIT" && -n "$VO5C_MANIFEST_VERSION" ]] || {
    echo "ABORT: bootstrap manifest incomplete" >&2
    return 1
  }
  return 0
}

vo5c_cloud_agent_bootstrap_verify_filesystem() {
  local bootstrap_path=$1
  if [[ -L "$bootstrap_path" ]]; then
    echo "ABORT: bootstrap must not be a symlink" >&2
    return 1
  fi
  if [[ ! -f "$bootstrap_path" ]]; then
    echo "ABORT: bootstrap not installed" >&2
    return 1
  fi
  local mode owner
  mode="$(stat -c '%a' "$bootstrap_path" 2>/dev/null || echo "")"
  owner="$(stat -c '%u' "$bootstrap_path" 2>/dev/null || echo "")"
  if [[ "$mode" != "750" ]]; then
    echo "ABORT: bootstrap permissions must be 750 (got ${mode})" >&2
    return 1
  fi
  if [[ "${VO5C_CLOUD_AGENT_BOOTSTRAP_TEST_SKIP_OWNER:-0}" != "1" ]] && [[ "$owner" != "0" ]]; then
    echo "ABORT: bootstrap must be root-owned (uid ${owner})" >&2
    return 1
  fi
  return 0
}

vo5c_cloud_agent_bootstrap_verify_content_hash() {
  local bootstrap_path=$1
  local expected_sha256=$2
  local actual
  actual="$(sha256sum "$bootstrap_path" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')"
  if [[ "$actual" != "$expected_sha256" ]]; then
    echo "ABORT: bootstrap SHA256 mismatch (manifest vs on-disk)" >&2
    return 1
  fi
  return 0
}

vo5c_cloud_agent_bootstrap_verify_installation() {
  local bootstrap_path="${1:-${VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH:-${VO5C_CLOUD_AGENT_BOOTSTRAP_PATH}}}"
  local manifest_path="${2:-${VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST}}"
  vo5c_cloud_agent_bootstrap_verify_filesystem "$bootstrap_path" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  vo5c_cloud_agent_bootstrap_parse_manifest "$manifest_path" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  vo5c_cloud_agent_bootstrap_verify_content_hash "$bootstrap_path" "$VO5C_MANIFEST_SHA256" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  return 0
}

vo5c_cloud_agent_load_authority_state() {
  local auth_file=$1
  local armed_stamp=$2
  VO5C_ENFORCEMENT_ACTIVE=0

  if [[ ! -e "$auth_file" ]]; then
    if [[ -f "$armed_stamp" ]]; then
      echo "ABORT: VO5C production deploy authority missing after armed stamp" >&2
      return 1
    fi
    return 0
  fi
  if [[ ! -r "$auth_file" ]] || [[ ! -f "$auth_file" ]]; then
    echo "ABORT: VO5C production deploy authority file unreadable" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$auth_file"
  set +a
  case "${VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE:-}" in
    0) VO5C_ENFORCEMENT_ACTIVE=0 ;;
    1) VO5C_ENFORCEMENT_ACTIVE=1 ;;
    *)
      echo "ABORT: VO5C production deploy authority invalid active flag" >&2
      return 1
      ;;
  esac
  return 0
}

vo5c_cloud_agent_prepare_staged_release_checkout() {
  local staged_root=$1
  local requested_sha=$2
  [[ -n "$staged_root" ]] || return 0
  local staged_canon
  if ! staged_canon="$(vo5c_operator_session_canonical_shared_path "$staged_root")"; then
    echo "ABORT: invalid SYNQDRIVE_STAGED_RELEASE_ROOT" >&2
    return 1
  fi
  mkdir -p "$staged_canon"
  if [[ ! -d "${staged_canon}/.git" ]]; then
    git init -q "$staged_canon"
    git -C "$staged_canon" remote add origin "${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}" 2>/dev/null \
      || git -C "$staged_canon" remote set-url origin "${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
  fi
  if ! git -C "$staged_canon" fetch --depth 1 origin "$requested_sha"; then
    echo "ABORT: staged release fetch failed for ${requested_sha}" >&2
    return 1
  fi
  if ! git -C "$staged_canon" checkout -q FETCH_HEAD; then
    echo "ABORT: staged release checkout failed" >&2
    return 1
  fi
  local actual
  actual="$(git -C "$staged_canon" rev-parse HEAD)"
  if [[ "$(vo5c_operator_session_normalize_sha "$actual")" != "$(vo5c_operator_session_normalize_sha "$requested_sha")" ]]; then
    echo "ABORT: staged release HEAD != requested SHA" >&2
    return 1
  fi
  export SYNQDRIVE_STAGED_RELEASE_ROOT="$staged_canon"
  return 0
}

vo5c_cloud_agent_resolve_session_authorization() {
  local session_file=$1
  local requested_sha=$2
  [[ -f "$session_file" ]] || return 1
  vo5c_operator_session_parse_file "$session_file" "$requested_sha" || return 1
  export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
  return 0
}

vo5c_cloud_agent_run_pinned_deploy() {
  local requested_sha=$1

  vo5c_cloud_agent_bootstrap_apply_default_paths

  if ! vo5c_operator_session_is_full_sha "$requested_sha"; then
    echo "ABORT: invalid REQUESTED_DEPLOY_SHA" >&2
    return 1
  fi

  if ! vo5c_cloud_agent_bootstrap_verify_installation; then
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  fi

  for p in "$VO5C_CLOUD_AGENT_PIN_ENV" "$VO5C_CLOUD_AGENT_OPERATOR_SESSION" "$VO5C_CLOUD_AGENT_AUTHORITY_ENV" "$VO5C_CLOUD_AGENT_STAGED_ROOT"; do
    vo5c_operator_session_validate_shared_path "$p" || { echo "ABORT: invalid configured path ${p}" >&2; return 1; }
  done

  if ! vo5c_cloud_agent_load_authority_state "$VO5C_CLOUD_AGENT_AUTHORITY_ENV" "$VO5C_CLOUD_AGENT_ENFORCEMENT_ARMED"; then
    return 1
  fi
  if [[ "${VO5C_ENFORCEMENT_ACTIVE:-0}" == "1" ]]; then
    echo "INFO: VO5C production deploy enforcement ACTIVE — pinned runner entry required (legacy bypass blocked)"
  fi

  if [[ ! -f "$VO5C_CLOUD_AGENT_PIN_ENV" ]]; then
    echo "ABORT: missing pin env ${VO5C_CLOUD_AGENT_PIN_ENV}" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$VO5C_CLOUD_AGENT_PIN_ENV"
  set +a

  if [[ "$(vo5c_operator_session_normalize_sha "${SYNQDRIVE_PINNED_EXECUTOR_SHA:-}")" != "$VO5C_MANIFEST_INSTALLED_FROM_COMMIT" ]]; then
    echo "ABORT: pin executor SHA does not match bootstrap manifest INSTALLED_FROM_COMMIT" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  fi

  export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$(vo5c_operator_session_normalize_sha "$requested_sha")"

  if ! vo5c_cloud_agent_resolve_session_authorization "$VO5C_CLOUD_AGENT_OPERATOR_SESSION" "$requested_sha"; then
    echo "ABORT: operator deploy session file missing or invalid (Cloud Agent requires VPS session file)" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_MISSING_AUTH"
  fi

  if ! vo5c_cloud_agent_prepare_staged_release_checkout "$VO5C_CLOUD_AGENT_STAGED_ROOT" "$requested_sha"; then
    return 1
  fi

  local pinned_ops="${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops"
  if [[ ! -f "${pinned_ops}/vps-vo5c-run-pinned-security-deploy.sh" ]]; then
    echo "ABORT: pinned runner missing under ${pinned_ops}" >&2
    return 1
  fi

  if declare -F vo5c_cloud_agent_invoke_pinned_runner_hook >/dev/null 2>&1; then
    vo5c_cloud_agent_invoke_pinned_runner_hook "$pinned_ops"
    return $?
  fi

  cd "$pinned_ops"
  exec bash "${pinned_ops}/vps-vo5c-run-pinned-security-deploy.sh"
}

vo5c_cloud_agent_bootstrap_main() {
  local requested_sha=$1
  vo5c_cloud_agent_bootstrap_apply_default_paths
  export VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH="${VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH:-$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH}"
  vo5c_cloud_agent_run_pinned_deploy "$requested_sha"
}
