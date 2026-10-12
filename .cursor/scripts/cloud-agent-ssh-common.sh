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
  local host="${1:-${CLOUD_AGENT_VPS_HOST:-}}"
  local user port key_file
  user="$(cloud_agent_ssh_user "$host")"
  port="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
  key_file="$(cloud_agent_ssh_key_path)"
  cloud_agent_require_ssh_identity || return 1
  if timeout 15 ssh -p "$port" -i "$key_file" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=8 \
    "${user}@${host}" 'echo ok' >/dev/null 2>&1; then
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
