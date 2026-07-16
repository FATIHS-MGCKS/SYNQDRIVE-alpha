#!/usr/bin/env bash
# Battery Health V2 — guard against new duplicate Prisma migration timestamps (B-09).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT/prisma/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Missing migrations directory: $MIGRATIONS_DIR" >&2
  exit 1
fi

mapfile -t BATTERY_MIGRATIONS < <(
  find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
    | grep -E 'battery|hv_snapshot|hv_capacity|battery_v2' || true
)

if ((${#BATTERY_MIGRATIONS[@]} == 0)); then
  echo "No Battery Health V2 migrations found — guard skipped."
  exit 0
fi

declare -A TS_COUNTS=()
for dir in "${BATTERY_MIGRATIONS[@]}"; do
  ts="${dir%%_*}"
  TS_COUNTS["$ts"]=$(( ${TS_COUNTS[$ts]:-0} + 1 ))
done

failed=false
for ts in "${!TS_COUNTS[@]}"; do
  count="${TS_COUNTS[$ts]}"
  if (( count > 1 )); then
    case "$ts" in
      20260716170000|20260717120000)
        if (( count == 2 )); then
          echo "WARN: known legacy duplicate timestamp $ts (B-09 — do not rename applied migrations):" >&2
          find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -name "${ts}_*" -printf '  %f\n' >&2
          continue
        fi
        ;;
    esac
    echo "Duplicate Battery Health V2 migration timestamp $ts ($count folders):" >&2
    find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -name "${ts}_*" \
      | grep -E 'battery|hv_snapshot|hv_capacity|battery_v2' \
      | sed 's|.*/||' | sed 's/^/  /' >&2
    failed=true
  fi
done

if [[ "$failed" == true ]]; then
  exit 1
fi

echo "Battery Health V2 migration timestamp guard passed."
