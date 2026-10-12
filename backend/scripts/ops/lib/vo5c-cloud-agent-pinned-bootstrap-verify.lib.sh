#!/usr/bin/env bash
# Co-installed on VPS under /opt/synqdrive/shared — verified before sourcing pinned-tree implementation.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY=45

# Pinned-executor paths verified in the co-installed trusted lib before sourcing any pin-tree library.
_VO5C_BOOTSTRAP_TRUSTED_INTEGRITY_PATHS=(
  backend/scripts/ops/vps-deploy-release.sh
  backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh
  backend/scripts/ops/lib/vps-vo5c-security-floor.lib.sh
  backend/scripts/ops/lib/vps-production-replica.lib.sh
  backend/scripts/ops/lib/vps-vo5c-deploy-admission.lib.sh
  backend/scripts/ops/lib/vps-vo5c-deploy-executor-selection.lib.sh
  backend/scripts/ops/lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh
  backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh
  backend/scripts/ops/lib/vo5c-operator-deploy-session.lib.sh
)

vo5c_bootstrap_is_full_sha() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]
}

vo5c_bootstrap_verify_sha256_file() {
  local path=$1
  local expected=$2
  local actual
  [[ -f "$path" ]] || return 1
  actual="$(sha256sum "$path" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')"
  [[ "$actual" == "$(echo "$expected" | tr '[:upper:]' '[:lower:]')" ]]
}

vo5c_bootstrap_verify_apply_default_paths() {
  VO5C_CLOUD_AGENT_BOOTSTRAP_PATH="${VO5C_CLOUD_AGENT_BOOTSTRAP_PATH:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh}"
  VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST="${VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env}"
  VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB="${VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB:-/opt/synqdrive/shared/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh}"
  VO5C_CLOUD_AGENT_PIN_ENV="${VO5C_CLOUD_AGENT_PIN_ENV:-/opt/synqdrive/shared/vo5c-pinned-executor.env}"
}

vo5c_bootstrap_verify_parse_manifest() {
  local manifest_file=$1
  VO5C_MANIFEST_SHA256=''
  VO5C_MANIFEST_VERIFY_LIB_SHA256=''
  VO5C_MANIFEST_INSTALLED_FROM_COMMIT=''
  VO5C_MANIFEST_PINNED_IMPL_SHA256=''
  VO5C_MANIFEST_PINNED_SESSION_SHA256=''
  VO5C_MANIFEST_VERSION=''

  [[ -L "$manifest_file" ]] && return 1
  [[ -f "$manifest_file" ]] || return 1
  local mode owner
  mode="$(stat -c '%a' "$manifest_file")"
  owner="$(stat -c '%u' "$manifest_file")"
  [[ "$mode" == "600" ]] || return 1
  if [[ "${VO5C_CLOUD_AGENT_BOOTSTRAP_TEST_SKIP_OWNER:-0}" != "1" ]] && [[ "$owner" != "0" ]]; then
    return 1
  fi

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue
    [[ "$line" == *'='* ]] || return 1
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      VO5C_CLOUD_AGENT_BOOTSTRAP_SHA256)
        [[ "$value" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
        VO5C_MANIFEST_SHA256="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
        ;;
      VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB_SHA256)
        [[ "$value" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
        VO5C_MANIFEST_VERIFY_LIB_SHA256="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
        ;;
      VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALLED_FROM_COMMIT)
        [[ "$value" =~ ^[0-9a-fA-F]{40}$ ]] || return 1
        VO5C_MANIFEST_INSTALLED_FROM_COMMIT="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
        ;;
      VO5C_CLOUD_AGENT_PINNED_IMPL_SHA256)
        [[ "$value" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
        VO5C_MANIFEST_PINNED_IMPL_SHA256="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
        ;;
      VO5C_CLOUD_AGENT_PINNED_SESSION_LIB_SHA256)
        [[ "$value" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
        VO5C_MANIFEST_PINNED_SESSION_SHA256="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
        ;;
      VO5C_CLOUD_AGENT_BOOTSTRAP_VERSION)
        [[ "$value" =~ ^[0-9]+$ ]] || return 1
        VO5C_MANIFEST_VERSION="$value"
        ;;
      *)
        return 1
        ;;
    esac
  done <"$manifest_file"

  [[ -n "$VO5C_MANIFEST_SHA256" && -n "$VO5C_MANIFEST_VERIFY_LIB_SHA256" && -n "$VO5C_MANIFEST_INSTALLED_FROM_COMMIT" \
    && -n "$VO5C_MANIFEST_PINNED_IMPL_SHA256" && -n "$VO5C_MANIFEST_PINNED_SESSION_SHA256" && -n "$VO5C_MANIFEST_VERSION" ]]
}

vo5c_bootstrap_verify_root_owned_no_world_access() {
  local path=$1
  local expected_mode=$2
  [[ -L "$path" ]] && return 1
  [[ -f "$path" ]] || return 1
  local mode owner group other_bits
  mode="$(stat -c '%a' "$path")"
  owner="$(stat -c '%u' "$path")"
  group="$(stat -c '%G' "$path")"
  [[ "$mode" == "$expected_mode" ]] || return 1
  if [[ "${VO5C_CLOUD_AGENT_BOOTSTRAP_TEST_SKIP_OWNER:-0}" != "1" ]] && [[ "$owner" != "0" ]]; then
    return 1
  fi
  other_bits=$((mode % 10))
  [[ "$other_bits" -eq 0 ]] || return 1
  if [[ "$group" != "root" ]]; then
    return 1
  fi
  return 0
}

vo5c_cloud_agent_bootstrap_verify_shared_installation() {
  vo5c_bootstrap_verify_apply_default_paths
  local bootstrap_path="${VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH:-$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH}"
  vo5c_bootstrap_verify_root_owned_no_world_access "$bootstrap_path" "750" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  vo5c_bootstrap_verify_root_owned_no_world_access "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB" "600" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  vo5c_bootstrap_verify_parse_manifest "$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  vo5c_bootstrap_verify_sha256_file "$bootstrap_path" "$VO5C_MANIFEST_SHA256" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  vo5c_bootstrap_verify_sha256_file "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB" "$VO5C_MANIFEST_VERIFY_LIB_SHA256" || return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  return 0
}

# Fail-closed git/worktree integrity for the pinned executor — no pin-tree library may be sourced before this passes.
vo5c_bootstrap_verify_pinned_executor_tree_trusted() {
  local executor_root=$1
  local expected_sha=$2
  local rel_path status_line tracked

  expected_sha="$(echo "$expected_sha" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "$executor_root" || ! -d "$executor_root" ]]; then
    echo "ABORT: bootstrap_trusted_integrity_root_missing" >&2
    return 1
  fi
  if ! vo5c_bootstrap_is_full_sha "$expected_sha"; then
    echo "ABORT: bootstrap_trusted_integrity_expected_sha_invalid" >&2
    return 1
  fi
  if ! git -C "$executor_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ABORT: bootstrap_trusted_integrity_not_git_checkout" >&2
    return 1
  fi

  local head_sha
  head_sha="$(git -C "$executor_root" rev-parse HEAD 2>/dev/null || true)"
  head_sha="$(echo "$head_sha" | tr '[:upper:]' '[:lower:]')"
  if [[ "$head_sha" != "$expected_sha" ]]; then
    echo "ABORT: bootstrap_trusted_integrity_head_mismatch expected=${expected_sha} actual=${head_sha:-unknown}" >&2
    return 1
  fi

  if [[ -n "$(git -C "$executor_root" status --porcelain -- backend/scripts/ops 2>/dev/null)" ]]; then
    echo "ABORT: bootstrap_trusted_integrity_dirty_ops_tree" >&2
    return 1
  fi

  while IFS= read -r status_line; do
    [[ -z "$status_line" ]] && continue
    rel_path="${status_line:3}"
    if [[ -L "${executor_root}/${rel_path}" ]]; then
      echo "ABORT: bootstrap_trusted_integrity_unsafe_symlink path=${rel_path}" >&2
      return 1
    fi
    if [[ -x "${executor_root}/${rel_path}" ]]; then
      echo "ABORT: bootstrap_trusted_integrity_untracked_executable path=${rel_path}" >&2
      return 1
    fi
  done < <(git -C "$executor_root" ls-files --others --exclude-standard -- backend/scripts/ops 2>/dev/null || true)

  for tracked in "${_VO5C_BOOTSTRAP_TRUSTED_INTEGRITY_PATHS[@]}"; do
    if [[ -L "${executor_root}/${tracked}" ]]; then
      echo "ABORT: bootstrap_trusted_integrity_symlink_replacement path=${tracked}" >&2
      return 1
    fi
    if ! git -C "$executor_root" cat-file -e "HEAD:${tracked}" 2>/dev/null; then
      if [[ -e "${executor_root}/${tracked}" ]]; then
        echo "ABORT: bootstrap_trusted_integrity_untracked_replacement path=${tracked}" >&2
        return 1
      fi
      echo "ABORT: bootstrap_trusted_integrity_required_path_missing_in_head path=${tracked}" >&2
      return 1
    fi
    if [[ ! -f "${executor_root}/${tracked}" ]]; then
      echo "ABORT: bootstrap_trusted_integrity_tracked_file_missing path=${tracked}" >&2
      return 1
    fi
    if ! git -C "$executor_root" diff --quiet HEAD -- "$tracked" 2>/dev/null; then
      echo "ABORT: bootstrap_trusted_integrity_tracked_file_modified path=${tracked}" >&2
      return 1
    fi
    if ! git -C "$executor_root" diff --cached --quiet HEAD -- "$tracked" 2>/dev/null; then
      echo "ABORT: bootstrap_trusted_integrity_tracked_file_staged path=${tracked}" >&2
      return 1
    fi
    if ! cmp -s "${executor_root}/${tracked}" <(git -C "$executor_root" show "HEAD:${tracked}" 2>/dev/null); then
      echo "ABORT: bootstrap_trusted_integrity_worktree_differs_from_head path=${tracked}" >&2
      return 1
    fi
  done

  return 0
}

vo5c_cloud_agent_bootstrap_verify_pinned_libraries() {
  local pin_root=$1
  local pin_sha=$2
  local impl="${pin_root}/backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh"
  local session="${pin_root}/backend/scripts/ops/lib/vo5c-operator-deploy-session.lib.sh"
  local floor="${pin_root}/backend/scripts/ops/lib/vps-vo5c-security-floor.lib.sh"
  local admission="${pin_root}/backend/scripts/ops/lib/vps-vo5c-deploy-admission.lib.sh"

  pin_sha="$(echo "$pin_sha" | tr '[:upper:]' '[:lower:]')"
  if [[ "$pin_sha" != "$VO5C_MANIFEST_INSTALLED_FROM_COMMIT" ]]; then
    echo "ABORT: pin executor SHA does not match bootstrap manifest INSTALLED_FROM_COMMIT" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  fi
  [[ -f "$impl" && -f "$session" && -f "$floor" && -f "$admission" ]] || {
    echo "ABORT: pinned bootstrap dependencies missing under executor tree" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  }

  if ! vo5c_bootstrap_verify_pinned_executor_tree_trusted "$pin_root" "$pin_sha"; then
    echo "ABORT: pinned executor trusted pre-source integrity check failed" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  fi

  vo5c_bootstrap_verify_sha256_file "$impl" "$VO5C_MANIFEST_PINNED_IMPL_SHA256" || {
    echo "ABORT: pinned implementation library SHA256 mismatch" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  }
  vo5c_bootstrap_verify_sha256_file "$session" "$VO5C_MANIFEST_PINNED_SESSION_SHA256" || {
    echo "ABORT: pinned session library SHA256 mismatch" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  }

  # shellcheck source=/dev/null
  source "${pin_root}/backend/scripts/ops/lib/vps-vo5c-security-floor.lib.sh"
  source "${pin_root}/backend/scripts/ops/lib/vps-vo5c-deploy-admission.lib.sh"
  if ! vps_vo5c_verify_executor_tree_integrity "$pin_root" "$pin_sha"; then
    echo "ABORT: pinned executor tree integrity check failed" >&2
    return "$VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY"
  fi
  return 0
}

vo5c_cloud_agent_bootstrap_preflight_only() {
  vo5c_cloud_agent_bootstrap_verify_shared_installation
}
