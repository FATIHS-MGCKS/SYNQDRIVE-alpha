#!/usr/bin/env bash
# Fail-closed SSH identity + auth preflight for Cloud Agents (production path A).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
SSH_USER="$(cloud_agent_ssh_user "$VPS_HOST")"
KEY_FILE="$(cloud_agent_ssh_key_path)"

echo "CLOUD_AGENT_SSH_PREFLIGHT=START"
echo "CLOUD_AGENT_VPS_HOST=${VPS_HOST}"
echo "CLOUD_AGENT_SSH_USER=${SSH_USER}"
echo "CLOUD_AGENT_SSH_KEY_FILE_PRESENT=$([[ -f "$KEY_FILE" ]] && echo yes || echo no)"
echo "CLOUD_AGENT_SSH_RUNTIME_SECRET_PRESENT=$([[ -n "${CLOUD_AGENT_SSH_PRIVATE_KEY:-}" ]] && echo yes || echo no)"

if ! cloud_agent_require_ssh_identity; then
  echo "CLOUD_AGENT_SSH_PREFLIGHT=FAIL identity_missing"
  exit 1
fi

if [[ -f "$KEY_FILE" ]]; then
  fp="$(ssh-keygen -lf "$KEY_FILE" 2>/dev/null | awk '{print $2}')" || fp="unknown"
  echo "CLOUD_AGENT_SSH_PUBLIC_FINGERPRINT=${fp}"
fi

if ! cloud_agent_ssh_auth_preflight "$VPS_HOST"; then
  echo "CLOUD_AGENT_SSH_PREFLIGHT=FAIL auth"
  exit 1
fi

echo "CLOUD_AGENT_SSH_PREFLIGHT=PASS"
echo "CLOUD_AGENT_SSH_PRINCIPAL=${SSH_USER}@${VPS_HOST}"
