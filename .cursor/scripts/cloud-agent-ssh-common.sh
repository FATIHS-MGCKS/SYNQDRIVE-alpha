#!/usr/bin/env bash

# Shared SSH key materialization for Cursor Cloud Agents.
# Cursor Secrets may deliver OPENSSH keys as:
#   - bare base64 (no PEM headers)
#   - single-line PEM (BEGIN + body + END on one line)
#   - multi-line PEM (correct format)

cloud_agent_trim() {
  printf '%s' "${1:-}" | tr -d '\r\n\t '
}

cloud_agent_ssh_user() {
  local user
  user="$(cloud_agent_trim "${CLOUD_AGENT_SSH_USER:-root}")"
  printf '%s' "${user:-root}"
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
