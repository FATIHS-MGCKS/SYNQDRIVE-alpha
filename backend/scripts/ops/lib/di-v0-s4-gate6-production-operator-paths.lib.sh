#!/usr/bin/env bash
# Pinned Production operator paths — must match sudoers / deploy layout.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

S4F7AS_PINNED_PRODUCTION_WRAPPER="/opt/synqdrive/current/backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh"
S4F7AS_PINNED_ROOT_HELPER="/opt/synqdrive/current/backend/scripts/ops/di-v0-s4-gate6-live-open-as-root.sh"
S4F7AS_ADMIN_INTENT_REL=".synqdrive/gate6-live-open-intent"
S4F7AS_PINNED_RELEASE_ROOT="/opt/synqdrive"

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

s4f7as_mode_has_group_or_other_write() {
  local mode="$1"
  local g o
  g=$(( (10#$mode / 10) % 10 ))
  o=$(( 10#$mode % 10 ))
  [[ $(( g & 2 )) -ne 0 || $(( o & 2 )) -ne 0 ]]
}

s4f7as_resolve_admin_home_for_uid() {
  local uid="$1"
  if [[ -n "${DI_S4_GATE6_TEST_ADMIN_HOME:-}" && "${uid}" == "$(id -u)" ]]; then
    echo "${DI_S4_GATE6_TEST_ADMIN_HOME}"
    return 0
  fi
  if [[ -n "${DI_S4_GATE6_TEST_SUDO_HOME:-}" && "${uid}" == "${SUDO_UID:-}" ]]; then
    echo "${DI_S4_GATE6_TEST_SUDO_HOME}"
    return 0
  fi
  if [[ -z "$uid" ]]; then
    return 1
  fi
  local home
  home="$(getent passwd "$uid" 2>/dev/null | awk -F: '{print $6}')" || return 1
  [[ -n "$home" && "$home" == /* ]] || return 1
  echo "$home"
}

s4f7as_admin_intent_directory_for_uid() {
  local uid="$1"
  local home
  home="$(s4f7as_resolve_admin_home_for_uid "$uid")" || return 1
  echo "${home}/${S4F7AS_ADMIN_INTENT_REL}"
}

s4f7as_assert_admin_intent_directory_for_uid() {
  local uid="$1"
  local base
  base="$(s4f7as_admin_intent_directory_for_uid "$uid")" || {
    echo "INTENT_ADMIN_HOME_UNRESOLVED=YES"
    return 1
  }
  if [[ ! -d "$base" ]]; then
    echo "INTENT_DIR_MISSING=YES"
    return 1
  fi
  if [[ -L "$base" ]]; then
    echo "INTENT_DIR_SYMLINK_FORBIDDEN=YES"
    return 1
  fi
  local base_real
  base_real="$(readlink -f "$base")" || {
    echo "INTENT_DIR_REALPATH_FAILED=YES"
    return 1
  }
  if [[ "$base_real" != "$base" ]]; then
    echo "INTENT_DIR_NOT_CANONICAL=YES"
    return 1
  fi
  local dir_perm dir_owner
  dir_perm="$(stat -c '%a' "$base")"
  dir_owner="$(stat -c '%u' "$base")"
  if [[ "$dir_perm" != "700" ]]; then
    echo "INTENT_DIR_MODE_INVALID=YES"
    return 1
  fi
  if [[ "$dir_owner" != "$uid" ]]; then
    echo "INTENT_DIR_OWNER_INVALID=YES"
    return 1
  fi
  if s4f7as_mode_has_group_or_other_write "$dir_perm"; then
    echo "INTENT_DIR_GROUP_OR_OTHER_WRITABLE=YES"
    return 1
  fi
  echo "INTENT_DIR_VALIDATED=YES"
  return 0
}

s4f7as_create_admin_intent_file() {
  local uid base intent
  uid="$(id -u)"
  base="$(s4f7as_admin_intent_directory_for_uid "$uid")" || {
    echo "INTENT_ADMIN_HOME_UNRESOLVED=YES" >&2
    return 1
  }
  if [[ ! -d "$base" ]]; then
    mkdir -p "$base" || return 1
    chmod 700 "$base"
  fi
  if ! s4f7as_assert_admin_intent_directory_for_uid "$uid"; then
    return 1
  fi
  intent="$(mktemp "${base}/gate6-live-open.XXXXXX")"
  chmod 600 "$intent"
  echo "$intent"
}

# Legacy alias
s4f7as_create_pinned_intent_file() {
  s4f7as_create_admin_intent_file
}

s4f7as_path_under_synqdrive_release_tree() {
  local real="$1"
  case "$real" in
    "${S4F7AS_PINNED_RELEASE_ROOT}/current"/*) return 0 ;;
    "${S4F7AS_PINNED_RELEASE_ROOT}/releases"/*) return 0 ;;
    *)
      if [[ -n "${DI_S4_GATE6_TEST_RELEASE_ROOT:-}" ]]; then
        case "$real" in
          "${DI_S4_GATE6_TEST_RELEASE_ROOT}"/*) return 0 ;;
        esac
      fi
      return 1
      ;;
  esac
}

# Reject symlinked operator entry script, wrong canonical path, world-writable parent chain.
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

  local file_owner file_mode
  file_owner="$(stat -c '%u' "$real")"
  file_mode="$(stat -c '%a' "$real")"
  if [[ "$file_owner" != "0" ]]; then
    echo "${label}_NOT_ROOT_OWNED=YES"
    return 1
  fi
  if s4f7as_mode_has_group_or_other_write "$file_mode"; then
    echo "${label}_GROUP_OR_OTHER_WRITABLE=YES"
    return 1
  fi

  if ! s4f7as_path_under_synqdrive_release_tree "$real"; then
    echo "${label}_OUTSIDE_RELEASE_TREE=YES"
    return 1
  fi
  local release_root="$S4F7AS_PINNED_RELEASE_ROOT"
  if [[ -n "${DI_S4_GATE6_TEST_RELEASE_ROOT:-}" && "$real" == "${DI_S4_GATE6_TEST_RELEASE_ROOT}"/* ]]; then
    release_root="${DI_S4_GATE6_TEST_RELEASE_ROOT}"
  fi
  local dir perm owner
  dir="$(dirname "$real")"
  while true; do
    perm="$(stat -c '%a' "$dir" 2>/dev/null || echo "")"
    owner="$(stat -c '%u' "$dir" 2>/dev/null || echo "")"
    if [[ -z "$perm" ]]; then
      echo "${label}_PARENT_STAT_FAILED=YES"
      return 1
    fi
    if s4f7as_mode_has_group_or_other_write "$perm"; then
      echo "${label}_PARENT_GROUP_OR_OTHER_WRITABLE=YES"
      return 1
    fi
    if [[ "$owner" != "0" ]]; then
      echo "${label}_PARENT_NOT_ROOT_OWNED=YES"
      return 1
    fi
    if [[ "$dir" == "$release_root" ]]; then
      break
    fi
    if [[ "$dir" == "/" ]]; then
      echo "${label}_PARENT_OUTSIDE_RELEASE=YES"
      return 1
    fi
    dir="$(dirname "$dir")"
  done
  echo "${label}_PINNED_OK=YES"
  return 0
}

s4f7as_assert_root_immutable_release_path() {
  local path="$1"
  local label="$2"
  local real
  if [[ -z "$path" || ! -e "$path" ]]; then
    echo "${label}_PATH_MISSING=YES"
    return 1
  fi
  real="$(readlink -f "$path")" || {
    echo "${label}_REALPATH_FAILED=YES"
    return 1
  }
  if ! s4f7as_path_under_synqdrive_release_tree "$real"; then
    echo "${label}_OUTSIDE_RELEASE_TREE=YES"
    return 1
  fi
  local owner mode
  owner="$(stat -c '%u' "$real")"
  mode="$(stat -c '%a' "$real")"
  if [[ "$owner" != "0" ]]; then
    echo "${label}_NOT_ROOT_OWNED=YES"
    return 1
  fi
  if s4f7as_mode_has_group_or_other_write "$mode"; then
    echo "${label}_GROUP_OR_OTHER_WRITABLE=YES"
    return 1
  fi
  echo "${label}_INTEGRITY_OK=YES"
  return 0
}

s4f7as_assert_production_execution_integrity() {
  local backend_root="${S4F7AS_PINNED_RELEASE_ROOT}/current/backend"
  local ts_node="${backend_root}/node_modules/.bin/ts-node"
  local cli_ts="${backend_root}/scripts/ops/di-v0-s4-gate6-open-rekill-production/di-v0-s4-gate6-open-rekill-production-cli.ts"
  local lib_sh="${backend_root}/scripts/ops/lib/di-v0-s4-gate6-open-rekill-production.lib.sh"

  s4f7as_assert_pinned_script_executable "$S4F7AS_PINNED_ROOT_HELPER" "ROOT_HELPER" || return 1
  s4f7as_assert_pinned_script_executable "$S4F7AS_PINNED_PRODUCTION_WRAPPER" "ROOT_WRAPPER" || return 1
  s4f7as_assert_root_immutable_release_path "$ts_node" "PINNED_TS_NODE" || return 1
  s4f7as_assert_root_immutable_release_path "$cli_ts" "PINNED_GATE6_CLI" || return 1
  s4f7as_assert_root_immutable_release_path "$lib_sh" "PINNED_GATE6_LIB" || return 1
  echo "PRODUCTION_EXECUTION_INTEGRITY_OK=YES"
  return 0
}

s4f7as_validate_root_reexec_intent_file() {
  local intent="$1"
  if [[ -z "$intent" || ! -e "$intent" ]]; then
    echo "INTENT_FILE_MISSING=YES"
    return 1
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "INTENT_VALIDATION_REQUIRES_ROOT=YES"
    return 1
  fi
  if [[ -z "${SUDO_UID:-}" ]]; then
    echo "INTENT_SUDO_UID_MISSING=YES"
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
  local mode owner intent_real expected_base
  mode="$(stat -c '%a' "$intent")"
  owner="$(stat -c '%u' "$intent")"
  if [[ "$mode" != "600" ]]; then
    echo "INTENT_MODE_INVALID=YES"
    return 1
  fi
  if [[ "$owner" != "$SUDO_UID" ]]; then
    echo "INTENT_OWNER_INVALID=YES"
    return 1
  fi
  if s4f7as_mode_has_group_or_other_write "$mode"; then
    echo "INTENT_GROUP_OR_OTHER_WRITABLE=YES"
    return 1
  fi
  intent_real="$(readlink -f "$intent")" || {
    echo "INTENT_REALPATH_FAILED=YES"
    return 1
  }
  if [[ "$intent_real" != "$intent" ]]; then
    echo "INTENT_PATH_NOT_CANONICAL=YES"
    return 1
  fi
  expected_base="$(s4f7as_admin_intent_directory_for_uid "$SUDO_UID")" || {
    echo "INTENT_ADMIN_HOME_UNRESOLVED=YES"
    return 1
  }
  case "$intent_real" in
    "${expected_base}/gate6-live-open."*) ;;
    *)
      echo "INTENT_PATH_NOT_ADMIN_PRIVATE=YES"
      return 1
      ;;
  esac
  s4f7as_assert_admin_intent_directory_for_uid "$SUDO_UID" || return 1
  echo "INTENT_FILE_VALIDATED=YES"
  return 0
}
