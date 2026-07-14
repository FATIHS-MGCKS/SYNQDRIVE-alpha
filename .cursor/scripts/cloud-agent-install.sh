#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

chmod +x .cursor/scripts/*.sh

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
