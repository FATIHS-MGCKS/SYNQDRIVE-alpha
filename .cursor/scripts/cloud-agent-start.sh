#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${HOME}/.cursor-tailscale"
SOCKET="${STATE_DIR}/tailscaled.sock"
PROXY_ENV="${HOME}/.cursor-cloud-proxy.env"
VPS_HOST="${CLOUD_AGENT_VPS_HOST:-mein-vps.internal}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"

mkdir -p "$STATE_DIR"

ensure_tailscaled() {
  if [[ -S "$SOCKET" ]] && pgrep -f "tailscaled.*${STATE_DIR}/tailscaled.sock" >/dev/null 2>&1; then
    return 0
  fi
  echo "[cloud-agent] Starting tailscaled (userspace networking)..."
  nohup bash "$(dirname "${BASH_SOURCE[0]}")/tailscale-daemon.sh" \
    > "${STATE_DIR}/tailscaled.log" 2>&1 &
  for _ in $(seq 1 45); do
    if [[ -S "$SOCKET" ]]; then
      return 0
    fi
    sleep 1
  done
  echo "[cloud-agent] tailscaled socket not ready: $SOCKET" >&2
  return 1
}

if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
  echo "[cloud-agent] Connecting to Tailscale tailnet..."
  ensure_tailscaled
  tailscale --socket="$SOCKET" up \
    --auth-key="$TAILSCALE_AUTH_KEY" \
    --hostname="${TAILSCALE_HOSTNAME:-synqdrive-cursor-cloud}" \
    --accept-routes \
    --reset
else
  echo "[cloud-agent] TAILSCALE_AUTH_KEY not set — skipping Tailscale (configure in Cursor Dashboard → Secrets)." >&2
fi

cat > "$PROXY_ENV" <<'EOF'
# Sourced by Cloud Agent shells for HTTP(S) egress via Tailscale userspace networking.
export ALL_PROXY=socks5h://localhost:1055/
export HTTP_PROXY=http://localhost:1054/
export HTTPS_PROXY=http://localhost:1054/
export NO_PROXY=localhost,127.0.0.1
EOF

if cloud_agent_materialize_ssh_key "${HOME}/.ssh/id_ed25519"; then
  ssh-keyscan -H "$VPS_HOST" >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
  echo "[cloud-agent] SSH key materialized for ${VPS_HOST}."
fi

if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
  bash "$(dirname "${BASH_SOURCE[0]}")/cloud-agent-verify-vps.sh" || true
fi

if [[ ! -f "${SCRIPT_DIR}/../mcp.json" ]]; then
  echo "[cloud-agent] MCP config missing — generating from template..."
  CLOUD_AGENT_REGENERATE_MCP=1 bash "${SCRIPT_DIR}/cloud-agent-mcp-setup.sh" || true
else
  echo "[cloud-agent] Refreshing MCP runtime configs (env → mcp.json)..."
  bash "${SCRIPT_DIR}/cloud-agent-mcp-dimo-ensure.sh" 2>/dev/null || true
  node "${SCRIPT_DIR}/mcp-resolve-env.js" 2>/dev/null || true
fi

echo "[cloud-agent] Start complete. Source ${PROXY_ENV} in shells if HTTP proxy is needed."
