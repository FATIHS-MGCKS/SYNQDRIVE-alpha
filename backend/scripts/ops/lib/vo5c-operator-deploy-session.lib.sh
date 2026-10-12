#!/usr/bin/env bash
# Canonical VPS operator session parser (pinned ops tree). Parse-only — never source session files.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

VO5C_OPERATOR_SESSION_MAX_TTL_SEC="${VO5C_OPERATOR_SESSION_MAX_TTL_SEC:-1800}"

vo5c_operator_session_is_full_sha() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]
}

vo5c_operator_session_normalize_sha() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

vo5c_operator_session_shared_path_root() {
  if [[ "${VO5C_OPERATOR_SESSION_TEST_SKIP_PATH_ROOT:-0}" == "1" ]]; then
    printf '%s' "${VO5C_OPERATOR_SESSION_TEST_PATH_ROOT:-/tmp/synqdrive-vo5c-test}"
  else
    printf '%s' '/opt/synqdrive'
  fi
}

vo5c_operator_session_path_has_forbidden_dot_segments() {
  local path=$1
  local seg
  local IFS='/'
  for seg in $path; do
    [[ "$seg" == "." || "$seg" == ".." ]] && return 0
  done
  return 1
}

vo5c_operator_session_validate_shared_path() {
  local path=$1
  [[ -n "$path" ]] || return 1
  [[ "$path" == /* ]] || return 1
  [[ "$path" != *$'\n'* ]] || return 1
  case "$path" in
    *';'*|*'|'*|*'`'*|*'$('*|*'>'*|*'<'*|*'&'*|*'('*|*')'*|*'#'*|*'!'*) return 1 ;;
  esac
  if vo5c_operator_session_path_has_forbidden_dot_segments "$path"; then
    return 1
  fi
  if ! command -v realpath >/dev/null 2>&1; then
    echo "ABORT: realpath required for VO5C shared path validation" >&2
    return 1
  fi
  local root root_prefix
  root="$(vo5c_operator_session_shared_path_root)"
  root_prefix="${root}/"
  if [[ "$path" != "$root" && "$path" != "${root_prefix}"* ]]; then
    return 1
  fi
  local canon
  canon="$(realpath -m "$path")"
  if [[ "$canon" != "$root" && "$canon" != "${root_prefix}"* ]]; then
    return 1
  fi
  local rel="${path#${root}/}"
  if [[ "$path" == "$root" ]]; then
    rel=""
  fi
  local current="$root"
  if [[ -n "$rel" ]]; then
    local seg
    local IFS='/'
    for seg in $rel; do
      [[ -z "$seg" ]] && continue
      current="${current}/${seg}"
      if [[ -L "$current" ]]; then
        local link_phys
        link_phys="$(realpath -P "$current")"
        if [[ "$link_phys" != "$root" && "$link_phys" != "${root_prefix}"* ]]; then
          return 1
        fi
      fi
    done
  fi
  if [[ -e "$path" || -L "$path" ]]; then
    local phys
    phys="$(realpath -P "$path")"
    if [[ "$phys" != "$root" && "$phys" != "${root_prefix}"* ]]; then
      return 1
    fi
  fi
  return 0
}

vo5c_operator_session_canonical_shared_path() {
  local path=$1
  vo5c_operator_session_validate_shared_path "$path" || return 1
  realpath -m "$path"
}

vo5c_operator_session_validate_file_metadata() {
  local session_file=$1
  if [[ -L "$session_file" ]]; then
    echo "ABORT: operator session must not be a symlink" >&2
    return 1
  fi
  if [[ ! -f "$session_file" ]]; then
    return 1
  fi
  local mode owner
  mode="$(stat -c '%a' "$session_file" 2>/dev/null || echo "")"
  owner="$(stat -c '%u' "$session_file" 2>/dev/null || echo "")"
  if [[ "$mode" != "600" ]]; then
    echo "ABORT: operator session permissions must be 600 (got ${mode})" >&2
    return 1
  fi
  if [[ "${VO5C_OPERATOR_SESSION_TEST_SKIP_OWNER:-0}" != "1" ]] && [[ "$owner" != "0" ]]; then
    echo "ABORT: operator session must be root-owned (uid ${owner})" >&2
    return 1
  fi
  return 0
}

vo5c_operator_session_parse_file() {
  local session_file=$1
  local requested_sha=$2

  if ! vo5c_operator_session_validate_file_metadata "$session_file"; then
    return 1
  fi

  local line key value
  local saw_auth=0 saw_sha=0 saw_until=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue
    if [[ "$line" != *'='* ]]; then
      echo "ABORT: malformed operator session line (expected KEY=VALUE)" >&2
      return 1
    fi
    key="${line%%=*}"
    value="${line#*=}"
    key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    value="$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    case "$key" in
      SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED)
        [[ "$value" == "1" ]] || { echo "ABORT: SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED must be 1" >&2; return 1; }
        saw_auth=1
        ;;
      AUTHORIZED_REQUESTED_SHA)
        vo5c_operator_session_is_full_sha "$value" || { echo "ABORT: AUTHORIZED_REQUESTED_SHA must be 40-char hex" >&2; return 1; }
        saw_sha=1
        VO5C_PARSED_AUTH_SHA="$(vo5c_operator_session_normalize_sha "$value")"
        ;;
      AUTHORIZED_UNTIL_EPOCH)
        [[ "$value" =~ ^[0-9]+$ ]] || { echo "ABORT: AUTHORIZED_UNTIL_EPOCH must be numeric epoch seconds" >&2; return 1; }
        saw_until=1
        VO5C_PARSED_UNTIL_EPOCH="$value"
        ;;
      *)
        echo "ABORT: unknown operator session key: ${key}" >&2
        return 1
        ;;
    esac
  done <"$session_file"

  if [[ "$saw_auth" != "1" || "$saw_sha" != "1" || "$saw_until" != "1" ]]; then
    echo "ABORT: operator session missing required keys" >&2
    return 1
  fi

  local now_epoch max_until
  now_epoch="$(date -u +%s)"
  max_until=$((now_epoch + VO5C_OPERATOR_SESSION_MAX_TTL_SEC))
  if [[ "$VO5C_PARSED_UNTIL_EPOCH" -le "$now_epoch" ]]; then
    echo "ABORT: operator deploy session expired" >&2
    return 1
  fi
  if [[ "$VO5C_PARSED_UNTIL_EPOCH" -gt "$max_until" ]]; then
    echo "ABORT: operator session TTL exceeds maximum (${VO5C_OPERATOR_SESSION_MAX_TTL_SEC}s)" >&2
    return 1
  fi

  requested_sha="$(vo5c_operator_session_normalize_sha "$requested_sha")"
  if [[ "$VO5C_PARSED_AUTH_SHA" != "$requested_sha" ]]; then
    echo "ABORT: operator session SHA does not match REQUESTED_DEPLOY_SHA" >&2
    return 1
  fi
  return 0
}
