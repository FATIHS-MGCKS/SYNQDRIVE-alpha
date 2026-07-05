#!/usr/bin/env bash
# Remove historical duplicate OBD device connection events on production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export DATABASE_URL="$(grep '^DATABASE_URL=' /opt/synqdrive/shared/backend.env | cut -d= -f2- | sed 's/?.*$//')"

MODE="${1:---dry-run}"
if [[ "$MODE" != "--dry-run" && "$MODE" != "--execute" ]]; then
  echo "Usage: $0 [--dry-run|--execute] [--vehicle-id=UUID]" >&2
  exit 1
fi

shift || true
EXTRA_ARGS=("$@")

echo "==> DIMO device connection duplicate cleanup ($MODE)"
npx ts-node scripts/ops/cleanup-dimo-device-connection-duplicates.ts "$MODE" "${EXTRA_ARGS[@]}"
