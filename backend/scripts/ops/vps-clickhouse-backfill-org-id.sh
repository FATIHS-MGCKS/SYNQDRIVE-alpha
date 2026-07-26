#!/usr/bin/env bash
#
# vps-clickhouse-backfill-org-id.sh — Backfill org_id on legacy CH tables (Phase 2D.7).
#
# Requires migration 007 applied. Non-destructive mutations per organization batch.
# Run AFTER vps-clickhouse-backup.sh (G1).
#
# Usage:
#   DATABASE_URL=... bash vps-clickhouse-backfill-org-id.sh [--dry-run]
#
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"
PG_URL="${DATABASE_URL:-}"
BATCH_SIZE="${CH_ORG_BACKFILL_BATCH_SIZE:-50}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/synqdrive/shared/clickhouse-backup.env; set +a
fi

ch_exec() {
  docker exec "$CONTAINER" clickhouse-client \
    --user "${CLICKHOUSE_USER:-synqdrive}" \
    ${CLICKHOUSE_PASSWORD:+--password "$CLICKHOUSE_PASSWORD"} "$@"
}

if [[ -z "$PG_URL" ]]; then
  log "ERROR: DATABASE_URL required for vehicle→org mapping"
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  log "ERROR: psql not found"
  exit 2
fi

# DATABASE_URL is a Prisma connection string; libpq rejects Prisma-only query
# parameters ("invalid URI query parameter: schema"). Keep the params libpq
# understands and translate a non-default schema into a search_path option.
pg_url_for_psql() {
  local url="$1" base="${1%%\?*}" query="" kept=() schema=""
  [[ "$url" == *\?* ]] && query="${url#*\?}"
  [[ -z "$query" ]] && { printf '%s' "$base"; return; }

  local pair key value
  local IFS='&'
  for pair in $query; do
    key="${pair%%=*}"
    value="${pair#*=}"
    case "$key" in
      schema) schema="$value" ;;
      connection_limit | pool_timeout | pgbouncer | socket_timeout | \
        statement_cache_size | connect_timeout_ms) ;;
      '') ;;
      *) kept+=("$pair") ;;
    esac
  done

  if [[ -n "$schema" && "$schema" != "public" ]]; then
    kept+=("options=-c%20search_path%3D${schema}")
  fi

  if [[ ${#kept[@]} -eq 0 ]]; then
    printf '%s' "$base"
  else
    printf '%s?%s' "$base" "$(IFS='&'; printf '%s' "${kept[*]}")"
  fi
}

PG_URL="$(pg_url_for_psql "$PG_URL")"

# Verify migration 007 column exists
HAS_COL="$(ch_exec --query "
  SELECT count()
  FROM system.columns
  WHERE database='${DATABASE}' AND table='telemetry_snapshots' AND name='org_id'
" 2>/dev/null || echo "0")"
if [[ "${HAS_COL}" != "1" ]]; then
  log "ERROR: org_id column missing — deploy migration 007 first (backend restart)"
  exit 2
fi

log "Exporting vehicle → organization_id from PostgreSQL"
TMP_MAP="$(mktemp)"
trap 'rm -f "$TMP_MAP"' EXIT

psql "$PG_URL" -tAc "
  SELECT id || E'\t' || organization_id
  FROM vehicles
  WHERE organization_id IS NOT NULL
" > "$TMP_MAP"

TOTAL_VEHICLES="$(wc -l < "$TMP_MAP" | tr -d ' ')"
log "vehicles=${TOTAL_VEHICLES}"

TABLES=(
  telemetry_snapshots
  telemetry_state_changes
  trip_segment_candidates
)

for table in "${TABLES[@]}"; do
  EMPTY_BEFORE="$(ch_exec --query "
    SELECT count() FROM ${DATABASE}.${table} WHERE org_id = ''
  " 2>/dev/null || echo "0")"
  log "${table}: rows with empty org_id before=${EMPTY_BEFORE}"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would mutate ${table} for ${TOTAL_VEHICLES} vehicles"
    continue
  fi

  # Group vehicles by org for fewer mutations
  while IFS=$'\t' read -r vehicle_id org_id; do
    [[ -z "$vehicle_id" || -z "$org_id" ]] && continue
    ch_exec --query "
      ALTER TABLE ${DATABASE}.${table}
      UPDATE org_id = '${org_id}'
      WHERE vehicle_id = '${vehicle_id}' AND org_id = ''
      SETTINGS mutations_sync = 1
    " >/dev/null 2>&1 || log "WARN: mutation failed vehicle=${vehicle_id} table=${table}"
  done < "$TMP_MAP"

  EMPTY_AFTER="$(ch_exec --query "
    SELECT count() FROM ${DATABASE}.${table} WHERE org_id = ''
  " 2>/dev/null || echo "?")"
  log "${table}: rows with empty org_id after=${EMPTY_AFTER}"
done

log "Backfill complete (dry_run=${DRY_RUN})"
exit 0
