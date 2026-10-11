#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"
node "${SCRIPT_DIR}/validate-module-registry.mjs" --repo-root "${REPO_ROOT}" "$@"

if [[ -f "${REPO_ROOT}/architecture/dsrg/scripts/validate-graph.sh" ]]; then
  bash "${REPO_ROOT}/architecture/dsrg/scripts/validate-graph.sh"
fi
