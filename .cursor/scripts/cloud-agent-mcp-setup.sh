#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE="${ROOT}/.cursor/mcp.json.example"
TARGET="${ROOT}/.cursor/mcp.json"
REGENERATE="${CLOUD_AGENT_REGENERATE_MCP:-1}"

write_template_copy() {
  if [[ ! -f "${EXAMPLE}" ]]; then
    echo "[mcp-setup] Missing template: ${EXAMPLE}" >&2
    return 1
  fi
  mkdir -p "${ROOT}/.cursor"
  cp "${EXAMPLE}" "${TARGET}"
  chmod 600 "${TARGET}"
  echo "[mcp-setup] Template copy at ${TARGET} (interpolated runtime config written separately)"
}

if [[ "${REGENERATE}" != "1" ]] && [[ -f "${TARGET}" ]]; then
  echo "[mcp-setup] ${TARGET} exists — set CLOUD_AGENT_REGENERATE_MCP=1 to refresh."
else
  write_template_copy
fi

echo "[mcp-setup] Ensuring DIMO MCP vendor build..."
bash "${SCRIPT_DIR}/cloud-agent-mcp-dimo-ensure.sh"

echo "[mcp-setup] Resolving env placeholders into runtime MCP configs..."
node "${SCRIPT_DIR}/mcp-resolve-env.js"
