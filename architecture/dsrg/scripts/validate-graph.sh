#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if [[ ! -f "${ROOT}/backend/node_modules/js-yaml/package.json" ]]; then
  echo "==> Installing backend deps for js-yaml (CI/bootstrap)"
  npm ci --ignore-scripts --prefix "${ROOT}/backend"
fi
exec node "${ROOT}/architecture/dsrg/scripts/validate-graph.mjs" "$@"
