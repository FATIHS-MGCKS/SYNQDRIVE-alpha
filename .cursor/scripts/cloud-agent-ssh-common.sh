#!/usr/bin/env bash

# Shared SSH key materialization for Cursor Cloud Agents.
# Cursor Secrets may deliver OPENSSH keys as:
#   - bare base64 (no PEM headers)
#   - single-line PEM (BEGIN + body + END on one line)
#   - multi-line PEM (correct format)

cloud_agent_trim() {
  printf '%s' "${1:-}" | tr -d '\r\n\t '
}

# Hostinger production VPS (path A): root SSH is disabled; synqdrive-admin is canonical.
cloud_agent_production_hostinger_host() {
  local host="${1:-}"
  [[ "$host" == *"hstgr.cloud"* ]]
}

cloud_agent_ssh_user() {
  local host="${1:-${CLOUD_AGENT_VPS_HOST:-}}"
  local user
  user="$(cloud_agent_trim "${CLOUD_AGENT_SSH_USER:-}")"
  if [[ -z "$user" ]]; then
    user="root"
  fi
  if cloud_agent_production_hostinger_host "$host" && [[ "$user" == "root" ]]; then
    user="synqdrive-admin"
  fi
  printf '%s' "$user"
}

cloud_agent_ssh_key_path() {
  printf '%s' "${CLOUD_AGENT_SSH_KEY_PATH:-${HOME}/.ssh/id_ed25519}"
}

cloud_agent_ssh_default_host() {
  printf '%s' "${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
}

# Production Hostinger: require a pre-verified host key (no blind ssh-keyscan).
cloud_agent_ssh_strict_host_key_required() {
  local host="${1:-}"
  if [[ "${CLOUD_AGENT_SSH_STRICT_HOST_KEY:-1}" == "0" ]]; then
    return 1
  fi
  cloud_agent_production_hostinger_host "$host"
}

cloud_agent_ssh_known_hosts_candidates() {
  local host_file="${CLOUD_AGENT_SSH_KNOWN_HOSTS_FILE:-}"
  if [[ -n "$host_file" && -f "$host_file" && ! -L "$host_file" ]]; then
    printf '%s\n' "$host_file"
  fi
  if [[ -f "${HOME}/.ssh/known_hosts" && ! -L "${HOME}/.ssh/known_hosts" ]]; then
    printf '%s\n' "${HOME}/.ssh/known_hosts"
  fi
}

cloud_agent_ssh_host_key_present_in_file() {
  local host=$1
  local port=$2
  local kh_file=$3
  ssh-keygen -F "[${host}]:${port}" -f "$kh_file" >/dev/null 2>&1 \
    || ssh-keygen -F "$host" -f "$kh_file" >/dev/null 2>&1
}

cloud_agent_ssh_resolve_known_hosts_file() {
  local host=$1
  local port=$2
  local kh
  while IFS= read -r kh; do
    [[ -z "$kh" ]] && continue
    if cloud_agent_ssh_host_key_present_in_file "$host" "$port" "$kh"; then
      printf '%s' "$kh"
      return 0
    fi
  done < <(cloud_agent_ssh_known_hosts_candidates)
  return 1
}

# Fail closed when production host has no trusted host-key entry (never auto keyscan).
cloud_agent_ssh_require_trusted_host_key() {
  local host="${1:-$(cloud_agent_ssh_default_host)}"
  local port="${2:-${CLOUD_AGENT_VPS_SSH_PORT:-22}}"
  if ! cloud_agent_ssh_strict_host_key_required "$host"; then
    return 0
  fi
  if cloud_agent_ssh_resolve_known_hosts_file "$host" "$port"; then
    return 0
  fi
  echo "[cloud-agent] ERROR: no trusted SSH host key for ${host}:${port}." >&2
  echo "[cloud-agent] HINT: Verify the host key out-of-band, then record it in CLOUD_AGENT_SSH_KNOWN_HOSTS_FILE or ~/.ssh/known_hosts." >&2
  echo "[cloud-agent] HINT: Blind ssh-keyscan without verification is blocked for Hostinger production." >&2
  return 1
}

# Append OpenSSH host-key + identity options to the named bash array (nameref).
cloud_agent_ssh_append_openssh_opts() {
  local -n _out=$1
  local host=$2
  local port=$3
  local key_file
  key_file="$(cloud_agent_ssh_key_path)"
  _out+=( -p "$port" -i "$key_file" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 )
  if cloud_agent_ssh_strict_host_key_required "$host"; then
    local kh
    kh="$(cloud_agent_ssh_resolve_known_hosts_file "$host" "$port")" || return 1
    _out+=( -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$kh" )
  else
    _out+=( -o StrictHostKeyChecking=accept-new )
  fi
  return 0
}

# Ensure ~/.ssh/id_ed25519 exists (baked image or CLOUD_AGENT_SSH_PRIVATE_KEY). Fail closed.
cloud_agent_require_ssh_identity() {
  local key_file
  key_file="$(cloud_agent_ssh_key_path)"
  if [[ -f "$key_file" ]]; then
    return 0
  fi
  if cloud_agent_materialize_ssh_key "$key_file"; then
    return 0
  fi
  echo "[cloud-agent] ERROR: SSH private key missing at ${key_file}." >&2
  echo "[cloud-agent] HINT: Production path A often works with the image-baked key; fresh agents need CLOUD_AGENT_SSH_PRIVATE_KEY in Cursor Dashboard → Secrets." >&2
  echo "[cloud-agent] HINT: Use synqdrive-admin@${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud} — root SSH is disabled on Hostinger." >&2
  return 1
}

# BatchMode SSH auth check (no remote command output).
cloud_agent_ssh_auth_preflight() {
  local host="${1:-$(cloud_agent_ssh_default_host)}"
  local user port
  local -a ssh_opts=()
  user="$(cloud_agent_ssh_user "$host")"
  port="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
  cloud_agent_require_ssh_identity || return 1
  cloud_agent_ssh_require_trusted_host_key "$host" "$port" || return 1
  cloud_agent_ssh_append_openssh_opts ssh_opts "$host" "$port" || return 1
  ssh_opts+=( -o ConnectTimeout=8 )
  if timeout 15 ssh "${ssh_opts[@]}" "${user}@${host}" 'echo ok' >/dev/null 2>&1; then
    return 0
  fi
  echo "[cloud-agent] ERROR: SSH auth failed for ${user}@${host}:${port}." >&2
  if [[ "$user" == "root" ]] && cloud_agent_production_hostinger_host "$host"; then
    echo "[cloud-agent] HINT: Hostinger requires synqdrive-admin (unset CLOUD_AGENT_SSH_USER or set synqdrive-admin)." >&2
  fi
  if [[ ! -f "$key_file" ]]; then
    echo "[cloud-agent] HINT: Provision CLOUD_AGENT_SSH_PRIVATE_KEY or restore baked ~/.ssh/id_ed25519." >&2
  fi
  return 1
}

# Extract base64 body from any OPENSSH PEM variant (single-line or multi-line).
cloud_agent_openssh_pem_body() {
  local raw="${1:-}"
  printf '%s' "$raw" \
    | sed 's/-----BEGIN OPENSSH PRIVATE KEY-----//g' \
    | sed 's/-----END OPENSSH PRIVATE KEY-----//g' \
    | tr -d '\r\n\t '
}

cloud_agent_write_openssh_pem_file() {
  local key_file="$1"
  local body="$2"

  if [[ -z "$body" ]]; then
    return 1
  fi

  {
    echo "-----BEGIN OPENSSH PRIVATE KEY-----"
    printf '%s\n' "$body" | fold -w 70
    echo "-----END OPENSSH PRIVATE KEY-----"
  } > "$key_file"
}

cloud_agent_materialize_ssh_key() {
  local key_file="${1:-${HOME}/.ssh/id_ed25519}"
  local raw trimmed

  if [[ -z "${CLOUD_AGENT_SSH_PRIVATE_KEY:-}" ]]; then
    return 1
  fi

  mkdir -p "${HOME}/.ssh"
  chmod 700 "${HOME}/.ssh"

  raw="$(printf '%s' "$CLOUD_AGENT_SSH_PRIVATE_KEY")"
  if [[ "$raw" == *"BEGIN OPENSSH PRIVATE KEY"* ]]; then
    trimmed="$(cloud_agent_openssh_pem_body "$raw")"
    if [[ -z "$trimmed" ]]; then
      return 1
    fi
    cloud_agent_write_openssh_pem_file "$key_file" "$trimmed"
  else
    trimmed="$(cloud_agent_trim "$raw")"
    if [[ -z "$trimmed" ]]; then
      return 1
    fi
    cloud_agent_write_openssh_pem_file "$key_file" "$trimmed"
  fi

  chmod 600 "$key_file"
}
