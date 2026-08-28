#!/usr/bin/env bash
# Thin wrapper kept for the documented E3A write-backfill entrypoint.
set -eo pipefail
exec "$(dirname "$0")/run-e3a-ops.sh" scripts/ops/energy-events-recovery-write-backfill.ts "$@"
