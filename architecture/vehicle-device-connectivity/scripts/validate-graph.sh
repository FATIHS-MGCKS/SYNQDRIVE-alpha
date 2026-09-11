#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec node "$ROOT/architecture/vehicle-device-connectivity/scripts/validate-graph.mjs" "$@"
