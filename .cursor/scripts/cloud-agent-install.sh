#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

chmod +x .cursor/scripts/*.sh

ensure_uv() {
  if command -v uvx >/dev/null 2>&1; then
    return 0
  fi
  echo "[cloud-agent] uv/uvx not found — installing for ElevenLabs MCP..."
  local install_dir="${HOME}/.local/bin"
  if [[ -w /usr/local/bin ]]; then
    install_dir="/usr/local/bin"
  fi
  export UV_INSTALL_DIR="${install_dir}"
  mkdir -p "${install_dir}"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${install_dir}:${PATH}"
}

ensure_uv

echo "[cloud-agent] Installing backend dependencies..."
cd backend
npm ci
npx prisma generate

echo "[cloud-agent] Installing frontend dependencies..."
cd "$ROOT/frontend"
npm ci

echo "[cloud-agent] Configuring MCP servers..."
chmod +x "${ROOT}/.cursor/scripts/cloud-agent-mcp-setup.sh"
CLOUD_AGENT_REGENERATE_MCP=1 bash "${ROOT}/.cursor/scripts/cloud-agent-mcp-setup.sh"

echo "[cloud-agent] Install complete."
