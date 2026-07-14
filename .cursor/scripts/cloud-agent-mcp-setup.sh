#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXAMPLE="${ROOT}/.cursor/mcp.json.example"
TARGET="${ROOT}/.cursor/mcp.json"
REGENERATE="${CLOUD_AGENT_REGENERATE_MCP:-1}"

write_mcp_json() {
  if [[ ! -f "${EXAMPLE}" ]]; then
    echo "[mcp-setup] Missing template: ${EXAMPLE}" >&2
    return 1
  fi

  mkdir -p "${ROOT}/.cursor"
  cp "${EXAMPLE}" "${TARGET}"
  chmod 600 "${TARGET}"
  echo "[mcp-setup] Wrote ${TARGET}"
}

if [[ ! -f "${TARGET}" ]] || [[ "${REGENERATE}" == "1" ]]; then
  write_mcp_json
else
  echo "[mcp-setup] ${TARGET} exists — set CLOUD_AGENT_REGENERATE_MCP=1 to refresh."
fi
