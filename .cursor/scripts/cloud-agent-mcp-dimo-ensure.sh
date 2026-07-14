#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENDOR="${ROOT}/.cursor/vendor/mcp-dimo"
REPO="https://github.com/DIMO-Network/mcp-dimo.git"
REF="${MCP_DIMO_REF:-main}"

if [[ -f "${VENDOR}/dist/index.js" ]]; then
  echo "[mcp-dimo] Using cached build at ${VENDOR}/dist/index.js"
  exit 0
fi

echo "[mcp-dimo] Building DIMO MCP into ${VENDOR} (ref: ${REF})..."
rm -rf "${VENDOR}"
git clone --depth 1 --branch "${REF}" "${REPO}" "${VENDOR}" 2>/dev/null \
  || git clone --depth 1 "${REPO}" "${VENDOR}"

cd "${VENDOR}"
npm ci 2>/dev/null || npm install
npm run build

if [[ ! -f "${VENDOR}/dist/index.js" ]]; then
  echo "[mcp-dimo] Build failed — dist/index.js missing" >&2
  exit 1
fi

echo "[mcp-dimo] Ready: ${VENDOR}/dist/index.js"
