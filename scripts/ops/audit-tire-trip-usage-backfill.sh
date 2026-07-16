#!/usr/bin/env bash
# Delegates to backend ops script (read-only tire trip usage backfill dry-run audit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/backend"
exec npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts "$@"
