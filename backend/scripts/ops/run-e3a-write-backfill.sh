#!/usr/bin/env bash
set -eo pipefail
cd /tmp/e3a-gate-final/repo/backend
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '#'*) continue ;;
    '') continue ;;
    *=*) export "$line" ;;
  esac
done < /opt/synqdrive/shared/backend.env
export ENERGY_EVENTS_RECOVERY_PLAN_PATH=/tmp/e3a-manual-review/recovery-plan-private.json
export ENERGY_EVENTS_WRITE_BACKFILL_OUTPUT_DIR=/tmp/e3a-write-backfill
exec npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-write-backfill.ts "$@"
