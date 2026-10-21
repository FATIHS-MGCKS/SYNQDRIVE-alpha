#!/usr/bin/env bash
# Validate DSRG knowledge graph — docs only. Fail-closed; no backend npm ci.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPTS_DIR="${ROOT}/architecture/dsrg/scripts"
DEPS_MARKER="${SCRIPTS_DIR}/node_modules/js-yaml/package.json"

if [[ ! -f "${DEPS_MARKER}" ]]; then
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "==> DSRG graph validator CI bootstrap: npm ci --prefix architecture/dsrg/scripts"
    npm ci --ignore-scripts --prefix "${SCRIPTS_DIR}"
  else
    echo "==> DSRG graph validator: missing js-yaml (architecture/dsrg/scripts/node_modules)"
    echo "    Install: npm ci --ignore-scripts --prefix architecture/dsrg/scripts"
    echo "    This validator does not install backend dependencies."
    exit 2
  fi
fi

exec node "${SCRIPTS_DIR}/validate-graph.mjs" "$@"
