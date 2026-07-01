#!/usr/bin/env bash

# Shared SSH key materialization for Cursor Cloud Agents.
# Cursor Secrets may deliver OPENSSH keys as bare base64 (without PEM headers).

cloud_agent_trim() {
  printf '%s' "${1:-}" | tr -d '\r\n\t '
}

cloud_agent_ssh_user() {
  local user
  user="$(cloud_agent_trim "${CLOUD_AGENT_SSH_USER:-root}")"
  printf '%s' "${user:-root}"
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
    printf '%s\n' "$raw" > "$key_file"
  else
    trimmed="$(cloud_agent_trim "$raw")"
    {
      echo "-----BEGIN OPENSSH PRIVATE KEY-----"
      printf '%s\n' "$trimmed" | fold -w 70
      echo "-----END OPENSSH PRIVATE KEY-----"
    } > "$key_file"
  fi

  chmod 600 "$key_file"
}
