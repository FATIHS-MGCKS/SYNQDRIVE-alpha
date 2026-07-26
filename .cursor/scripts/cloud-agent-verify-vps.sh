#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-mein-vps.internal}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"
SSH_USER="$(cloud_agent_ssh_user)"
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

if [[ -n "${CLOUD_AGENT_SSH_PRIVATE_KEY:-}" ]]; then
  cloud_agent_materialize_ssh_key "${HOME}/.ssh/id_ed25519" || true
  ssh_ok=0
  for _ in 1 2 3 4 5; do
    if timeout 15 ssh -p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=8 \
      "${SSH_USER}@${VPS_HOST}" 'echo ok' >/dev/null 2>&1; then
      ssh_ok=1
      break
    fi
    sleep 2
  done
  if [[ "$ssh_ok" -eq 1 ]]; then
    echo "[cloud-agent] SSH auth OK for ${SSH_USER}@${VPS_HOST}."
    # Self-heal UFW SSH allowlist for dynamic Cloud Agent egress IPs
    fw_allow="/opt/synqdrive/current/backend/scripts/ops/vps-firewall-allow-ssh.sh"
    timeout 20 ssh -p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=8 \
      "${SSH_USER}@${VPS_HOST}" "test -x ${fw_allow} && sudo ${fw_allow} || true" 2>/dev/null || true
  else
    echo "[cloud-agent] WARN: SSH auth failed for ${SSH_USER}@${VPS_HOST} (check firewall allowlist)." >&2
  fi
fi
