#!/usr/bin/env bash
set -euo pipefail
# ops/ -> backend root (not backend/scripts — guard lives at scripts/ops/lib)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "${ROOT}/scripts/ops/lib/prisma-cli-guard.mjs" "$@"
