#!/usr/bin/env bash
# Parse operator deploy session file without sourcing (fail-closed).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# Maximum session TTL from "now" when validating AUTHORIZED_UNTIL_EPOCH.
CLOUD_AGENT_VO5C_SESSION_MAX_TTL_SEC="${CLOUD_AGENT_VO5C_SESSION_MAX_TTL_SEC:-1800}"

cloud_agent_vo5c_is_full_sha() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]
}

cloud_agent_vo5c_normalize_sha() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

cloud_agent_vo5c_validate_shared_path() {
  local path=$1
  [[ -n "$path" ]] || return 1
  if [[ "${CLOUD_AGENT_VO5C_TEST_SKIP_PATH_ROOT:-0}" != "1" ]]; then
    [[ "$path" == /opt/synqdrive/* ]] || return 1
  else
    [[ "$path" == /* ]] || return 1
  fi
  [[ "$path" != *$'\n'* ]] || return 1
  case "$path" in
    *';'*|*'|'*|*'`'*|*'$('*|*'>'*|*'<'*|*'&'*|*'('*|*')'*|*'#'*|*'!'*) return 1 ;;
  esac
  return 0
}

cloud_agent_vo5c_validate_operator_session_file_metadata() {
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
  if [[ "${CLOUD_AGENT_VO5C_SESSION_TEST_SKIP_OWNER:-0}" != "1" ]] && [[ "$owner" != "0" ]]; then
    echo "ABORT: operator session must be root-owned (uid ${owner})" >&2
    return 1
  fi
  return 0
}

# Outputs: sets CLOUD_AGENT_PARSED_VO5C_AUTHORIZED, CLOUD_AGENT_PARSED_AUTH_SHA, CLOUD_AGENT_PARSED_UNTIL_EPOCH
cloud_agent_vo5c_parse_operator_session_file() {
  local session_file=$1
  local requested_sha=$2
  CLOUD_AGENT_PARSED_VO5C_AUTHORIZED=0
  CLOUD_AGENT_PARSED_AUTH_SHA=''
  CLOUD_AGENT_PARSED_UNTIL_EPOCH=''

  if ! cloud_agent_vo5c_validate_operator_session_file_metadata "$session_file"; then
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
        if [[ "$value" != "1" ]]; then
          echo "ABORT: SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED must be 1" >&2
          return 1
        fi
        saw_auth=1
        CLOUD_AGENT_PARSED_VO5C_AUTHORIZED=1
        ;;
      AUTHORIZED_REQUESTED_SHA)
        if ! cloud_agent_vo5c_is_full_sha "$value"; then
          echo "ABORT: AUTHORIZED_REQUESTED_SHA must be 40-char hex" >&2
          return 1
        fi
        saw_sha=1
        CLOUD_AGENT_PARSED_AUTH_SHA="$(cloud_agent_vo5c_normalize_sha "$value")"
        ;;
      AUTHORIZED_UNTIL_EPOCH)
        if [[ ! "$value" =~ ^[0-9]+$ ]]; then
          echo "ABORT: AUTHORIZED_UNTIL_EPOCH must be numeric epoch seconds" >&2
          return 1
        fi
        saw_until=1
        CLOUD_AGENT_PARSED_UNTIL_EPOCH="$value"
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
  max_until=$((now_epoch + CLOUD_AGENT_VO5C_SESSION_MAX_TTL_SEC))
  if [[ "$CLOUD_AGENT_PARSED_UNTIL_EPOCH" -le "$now_epoch" ]]; then
    echo "ABORT: operator deploy session expired" >&2
    return 1
  fi
  if [[ "$CLOUD_AGENT_PARSED_UNTIL_EPOCH" -gt "$max_until" ]]; then
    echo "ABORT: operator session TTL exceeds maximum (${CLOUD_AGENT_VO5C_SESSION_MAX_TTL_SEC}s)" >&2
    return 1
  fi

  requested_sha="$(cloud_agent_vo5c_normalize_sha "$requested_sha")"
  if [[ "$CLOUD_AGENT_PARSED_AUTH_SHA" != "$requested_sha" ]]; then
    echo "ABORT: operator session SHA does not match REQUESTED_DEPLOY_SHA" >&2
    return 1
  fi
  return 0
}

cloud_agent_vo5c_revoke_operator_session_file() {
  local session_file=$1
  if [[ -f "$session_file" ]] && [[ ! -L "$session_file" ]]; then
    rm -f "$session_file"
  fi
}
