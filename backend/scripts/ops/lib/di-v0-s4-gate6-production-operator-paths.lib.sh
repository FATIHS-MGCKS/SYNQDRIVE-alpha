#!/usr/bin/env bash
# Pinned Production operator paths — must match sudoers / deploy layout.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7AS_PINNED_PRODUCTION_WRAPPER="/opt/synqdrive/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh"
S4F7AS_PINNED_ROOT_HELPER="/opt/synqdrive/current/backend/scripts/ops/di-v0-s4-gate6-live-open-as-root.sh"
S4F7AS_PINNED_INTENT_DIR="/opt/synqdrive/shared/gate6-live-open-intent"

s4f7as_operator_paths_require_production_pins() {
  if [[ "${DI_S4_GATE6_FORCE_PRODUCTION_OPERATOR_PINS:-}" == "YES" ]]; then
    return 0
  fi
  if declare -F s4f7as_is_production_backend_env_path >/dev/null 2>&1; then
    if s4f7as_is_production_backend_env_path; then
      return 0
    fi
  fi
  return 1
}

s4f7as_resolve_pinned_wrapper_path() {
  if s4f7as_operator_paths_require_production_pins; then
    echo "$S4F7AS_PINNED_PRODUCTION_WRAPPER"
    return 0
  fi
  local script_dir="${S4F7AS_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" ]]; then
    echo "${script_dir}/di-v0-s4-gate6-open-rekill-production.sh"
    return 0
  fi
  return 1
}

s4f7as_resolve_pinned_root_helper_path() {
  if s4f7as_operator_paths_require_production_pins; then
    echo "$S4F7AS_PINNED_ROOT_HELPER"
    return 0
  fi
  local script_dir="${S4F7AS_SCRIPT_DIR:-}"
  if [[ -n "$script_dir" ]]; then
    echo "${script_dir}/di-v0-s4-gate6-live-open-as-root.sh"
    return 0
  fi
  return 1
}

# Reject symlinked script, wrong canonical path, world-writable parent chain, non-root-owned deploy tree.
s4f7as_assert_pinned_script_executable() {
  local expected="$1"
  local label="${2:-SCRIPT}"

  if [[ -z "$expected" || "$expected" != /* ]]; then
    echo "${label}_PATH_NOT_ABSOLUTE=YES"
    return 1
  fi
  if [[ ! -e "$expected" ]]; then
    echo "${label}_PATH_MISSING=YES"
    return 1
  fi
  if [[ -L "$expected" ]]; then
    echo "${label}_SYMLINK_FORBIDDEN=YES"
    return 1
  fi
  local real expected_real
  real="$(readlink -f "$expected")" || {
    echo "${label}_REALPATH_FAILED=YES"
    return 1
  }
  expected_real="$(readlink -f "$expected")"
  if [[ "$real" != "$expected_real" ]]; then
    echo "${label}_PATH_CANONICAL_MISMATCH=YES"
    return 1
  fi
  if [[ ! -f "$real" || ! -x "$real" ]]; then
    echo "${label}_NOT_EXECUTABLE=YES"
    return 1
  fi

  local dir perm owner
  dir="$(dirname "$real")"
  while [[ "$dir" != "/" ]]; do
    perm="$(stat -c '%a' "$dir" 2>/dev/null || echo "")"
    owner="$(stat -c '%u' "$dir" 2>/dev/null || echo "")"
    if [[ -z "$perm" ]]; then
      echo "${label}_PARENT_STAT_FAILED=YES"
      return 1
    fi
    if [[ "$((10#${perm} % 2))" -eq 1 ]]; then
      echo "${label}_PARENT_WORLD_WRITABLE=YES"
      return 1
    fi
    if [[ "$owner" != "0" ]]; then
      echo "${label}_PARENT_NOT_ROOT_OWNED=YES"
      return 1
    fi
    dir="$(dirname "$dir")"
  done
  echo "${label}_PINNED_OK=YES"
  return 0
}

s4f7as_validate_root_reexec_intent_file() {
  local intent="$1"
  if [[ -z "$intent" || ! -e "$intent" ]]; then
    echo "INTENT_FILE_MISSING=YES"
    return 1
  fi
  if [[ -L "$intent" ]]; then
    echo "INTENT_SYMLINK_FORBIDDEN=YES"
    return 1
  fi
  if [[ ! -f "$intent" ]]; then
    echo "INTENT_NOT_REGULAR_FILE=YES"
    return 1
  fi
  local mode owner intent_real
  mode="$(stat -c '%a' "$intent")"
  owner="$(stat -c '%u' "$intent")"
  if [[ "$mode" != "600" ]]; then
    echo "INTENT_MODE_INVALID=YES"
    return 1
  fi
  if [[ -n "${SUDO_UID:-}" ]]; then
    if [[ "$owner" != "$SUDO_UID" && "$owner" != "0" ]]; then
      echo "INTENT_OWNER_INVALID=YES"
      return 1
    fi
  fi
  intent_real="$(readlink -f "$intent")" || {
    echo "INTENT_REALPATH_FAILED=YES"
    return 1
  }
  if [[ "$intent_real" != "$intent" ]]; then
    echo "INTENT_PATH_NOT_CANONICAL=YES"
    return 1
  fi
  case "$intent_real" in
    "${S4F7AS_PINNED_INTENT_DIR}"/*) ;;
    *)
      echo "INTENT_PATH_NOT_PINNED_DIR=YES"
      return 1
      ;;
  esac
  local dir_perm dir_owner
  dir_perm="$(stat -c '%a' "$S4F7AS_PINNED_INTENT_DIR" 2>/dev/null || echo "")"
  dir_owner="$(stat -c '%u' "$S4F7AS_PINNED_INTENT_DIR" 2>/dev/null || echo "")"
  if [[ "$dir_perm" != "700" && "$dir_perm" != "750" ]]; then
    echo "INTENT_DIR_MODE_INVALID=YES"
    return 1
  fi
  if [[ "$dir_owner" != "0" ]]; then
    echo "INTENT_DIR_OWNER_INVALID=YES"
    return 1
  fi
  echo "INTENT_FILE_VALIDATED=YES"
  return 0
}

s4f7as_create_pinned_intent_file() {
  local intent
  if ! s4f7as_operator_paths_require_production_pins; then
    intent="$(mktemp)"
    chmod 600 "$intent"
    echo "$intent"
    return 0
  fi
  if [[ ! -d "$S4F7AS_PINNED_INTENT_DIR" ]]; then
    echo "INTENT_DIR_MISSING=YES" >&2
    return 1
  fi
  intent="$(mktemp "${S4F7AS_PINNED_INTENT_DIR}/gate6-live-open.XXXXXX")"
  chmod 600 "$intent"
  echo "$intent"
}
