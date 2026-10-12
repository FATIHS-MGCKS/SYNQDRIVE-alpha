#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"
SSH_USER="$(cloud_agent_ssh_user "$VPS_HOST")"
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
PG_PORT="${CLOUD_AGENT_VPS_PG_PORT:-5432}"

echo "[cloud-agent] Verifying VPS reachability (${VPS_HOST})..."

if command -v tailscale >/dev/null 2>&1; then
  SOCKET="${HOME}/.cursor-tailscale/tailscaled.sock"
  if [[ -S "$SOCKET" ]]; then
    tailscale --socket="$SOCKET" status || true
  fi
fi

if getent hosts "$VPS_HOST" >/dev/null 2>&1; then
  echo "[cloud-agent] DNS: ${VPS_HOST} resolves."
else
  echo "[cloud-agent] WARN: ${VPS_HOST} did not resolve via getent." >&2
fi

if timeout 5 bash -c "echo >/dev/tcp/${VPS_HOST}/${SSH_PORT}" 2>/dev/null; then
  echo "[cloud-agent] TCP ${VPS_HOST}:${SSH_PORT} (SSH) reachable."
else
  echo "[cloud-agent] WARN: TCP ${VPS_HOST}:${SSH_PORT} (SSH) not reachable." >&2
fi

if timeout 5 bash -c "echo >/dev/tcp/${VPS_HOST}/${PG_PORT}" 2>/dev/null; then
  echo "[cloud-agent] TCP ${VPS_HOST}:${PG_PORT} (PostgreSQL) reachable."
else
  echo "[cloud-agent] WARN: TCP ${VPS_HOST}:${PG_PORT} (PostgreSQL) not reachable." >&2
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if timeout 10 psql "$DATABASE_URL" -c 'SELECT 1' >/dev/null 2>&1; then
    echo "[cloud-agent] PostgreSQL auth/query OK via DATABASE_URL."
  else
    echo "[cloud-agent] WARN: psql against DATABASE_URL failed (check credentials / SSL)." >&2
  fi
fi

if cloud_agent_require_ssh_identity 2>/dev/null; then
  if cloud_agent_ssh_auth_preflight "$VPS_HOST"; then
    echo "[cloud-agent] SSH auth OK for ${SSH_USER}@${VPS_HOST}."
  else
    echo "[cloud-agent] WARN: SSH auth failed for ${SSH_USER}@${VPS_HOST}." >&2
  fi
else
  echo "[cloud-agent] WARN: SSH identity not available (no key file and CLOUD_AGENT_SSH_PRIVATE_KEY unset)." >&2
fi
