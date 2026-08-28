#!/usr/bin/env bash
# Runs an E3A energy-events ops script inside the VPS operational checkout with
# production env loaded from the shared env file (never from the repo).
# Usage: run-e3a-ops.sh <script-path-relative-to-backend> [args...]
set -eo pipefail

REPO_BACKEND="${E3A_REPO_BACKEND:-/tmp/e3a-gate-final/repo/backend}"
SHARED_ENV="${E3A_SHARED_ENV:-/opt/synqdrive/shared/backend.env}"
SCRIPT_PATH="$1"
shift || true

if [ -z "$SCRIPT_PATH" ]; then
  echo "usage: run-e3a-ops.sh <script-path-relative-to-backend> [args...]" >&2
  exit 2
fi

cd "$REPO_BACKEND"

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '#'*) continue ;;
    '') continue ;;
    *=*) export "$line" ;;
  esac
done < "$SHARED_ENV"

export ENERGY_EVENTS_RECOVERY_PLAN_PATH="${ENERGY_EVENTS_RECOVERY_PLAN_PATH:-/tmp/e3a-manual-review/recovery-plan-private.json}"
export ENERGY_EVENTS_WRITE_BACKFILL_OUTPUT_DIR="${ENERGY_EVENTS_WRITE_BACKFILL_OUTPUT_DIR:-/tmp/e3a-write-backfill}"

exec npx ts-node -r tsconfig-paths/register "$SCRIPT_PATH" "$@"
