#!/usr/bin/env bash
#
# vps-clickhouse-migrate-storage-topology.sh — move the ClickHouse container off
# release-relative bind mounts (Phase 2D.7).
#
# The container was created with binds into a specific release directory. Once
# that release is pruned the bind sources vanish: the config overlays stop being
# backed by real files and, worse, /backups points at a deleted directory, so
# BACKUP DATABASE writes into a path nobody can reach. The storage topology
# audit reports this as P0.
#
# This repoints the binds at /opt/synqdrive/shared/clickhouse via
# docker-compose.vps-clickhouse.yml and persists COMPOSE_FILE so later
# `docker compose` calls keep the override.
#
# Data lives in the named volumes clickhouse_data / clickhouse_logs and is not
# touched; the script verifies row counts before and after and aborts if they
# do not match.
#
# Usage:
#   sudo bash vps-clickhouse-migrate-storage-topology.sh [--dry-run]
#
set -euo pipefail

CURRENT="${SYNQDRIVE_CURRENT:-/opt/synqdrive/current}"
SHARED="${SYNQDRIVE_SHARED:-/opt/synqdrive/shared}"
BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-${SHARED}/backend.env}"
CH_ENV="${SHARED}/clickhouse-backup.env"
CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"
# Volumes are named <project>_clickhouse_data; the project must stay identical
# or compose silently creates fresh, empty volumes.
PROJECT="${COMPOSE_PROJECT_NAME:-backend}"
COMPOSE_DIR="${CURRENT}/backend"
DRY_RUN=0

[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# The VPS ships compose v1 as a standalone binary; newer hosts have the v2
# plugin. v1 ignores the override's `deploy.resources` block.
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "neither 'docker compose' nor 'docker-compose' is available"
  fi
}

read_env_key() {
  local key="$1" line
  line="$(grep -m1 -E "^${key}=" "$BACKEND_ENV" 2>/dev/null || true)"
  [[ -z "$line" ]] && return 0
  local value="${line#*=}"
  if [[ ${#value} -ge 2 ]] && { [[ "$value" == \"*\" ]] || [[ "$value" == \'*\' ]]; }; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

CH_USER="$(read_env_key CLICKHOUSE_USER)"
CH_PASSWORD="$(read_env_key CLICKHOUSE_PASSWORD)"
CH_DATABASE="$(read_env_key CLICKHOUSE_DATABASE)"
CH_DATABASE="${CH_DATABASE:-synqdrive}"

ch_q() {
  docker exec "$CONTAINER" clickhouse-client \
    --user "$CH_USER" ${CH_PASSWORD:+--password "$CH_PASSWORD"} \
    --database "$CH_DATABASE" -q "$1"
}

# ── Preconditions ──────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker not found"
[[ -f "${COMPOSE_DIR}/docker-compose.yml" ]] || die "missing ${COMPOSE_DIR}/docker-compose.yml"
[[ -f "${COMPOSE_DIR}/docker-compose.vps-clickhouse.yml" ]] ||
  die "missing docker-compose.vps-clickhouse.yml — deploy a release that contains it"

for f in \
  config/config.d/backup_disk.xml \
  config/config.d/01_logger.xml \
  config/config.d/z_system_logs.xml \
  config/config.d/z_async_insert.xml \
  config/users.d/z_log_profiles.xml; do
  [[ -f "${SHARED}/clickhouse/${f}" ]] ||
    die "shared config missing: ${SHARED}/clickhouse/${f} (run vps-deploy-release.sh to sync)"
done
mkdir -p "${SHARED}/clickhouse/backups"

for vol in "${PROJECT}_clickhouse_data" "${PROJECT}_clickhouse_logs"; do
  docker volume inspect "$vol" >/dev/null 2>&1 || die "named volume missing: ${vol}"
done

log "container=${CONTAINER} project=${PROJECT} database=${CH_DATABASE}"

# ── Baseline: row counts must survive the recreate ─────────────────────────
COUNT_SQL="SELECT sum(rows) FROM system.parts WHERE database='${CH_DATABASE}' AND active"
ROWS_BEFORE=""
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  ROWS_BEFORE="$(ch_q "$COUNT_SQL" 2>/dev/null || echo "")"
  [[ -z "$ROWS_BEFORE" ]] && die "container is up but the row count query failed — refusing to recreate"
  log "baseline active rows=${ROWS_BEFORE}"
else
  # Resuming after an interrupted recreate: there is nothing to compare
  # against, so the post-start check just has to prove the volume carries data.
  log "container not running — no baseline; will require a non-empty database after start"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY-RUN: would recreate ${CONTAINER} with shared binds and persist COMPOSE_FILE"
  docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Type "bind"}}  bind {{.Source}} -> {{.Destination}}{{println}}{{end}}{{end}}'
  exit 0
fi

# ── Persist the override so later compose calls keep it ────────────────────
COMPOSE_FILE_VALUE="${COMPOSE_DIR}/docker-compose.yml:${COMPOSE_DIR}/docker-compose.vps-clickhouse.yml"
touch "$CH_ENV"
if grep -qE '^COMPOSE_FILE=' "$CH_ENV"; then
  sed -i -E "s#^COMPOSE_FILE=.*#COMPOSE_FILE=${COMPOSE_FILE_VALUE}#" "$CH_ENV"
else
  printf '\n# Phase 2D.7 — keep ClickHouse binds on shared paths, not release paths.\nCOMPOSE_FILE=%s\n' \
    "$COMPOSE_FILE_VALUE" >> "$CH_ENV"
fi
log "COMPOSE_FILE persisted in ${CH_ENV}"

# ── Recreate ───────────────────────────────────────────────────────────────
log "recreating container (named volumes are preserved)"
cd "$COMPOSE_DIR"
COMPOSE_FILE="$COMPOSE_FILE_VALUE" \
  CLICKHOUSE_USER="$CH_USER" \
  CLICKHOUSE_PASSWORD="$CH_PASSWORD" \
  CLICKHOUSE_DATABASE="$CH_DATABASE" \
  compose -p "$PROJECT" up -d --force-recreate clickhouse

log "waiting for health"
HEALTHY=0
for _ in $(seq 1 60); do
  state="$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo starting)"
  if [[ "$state" == "healthy" ]]; then HEALTHY=1; break; fi
  sleep 2
done
[[ "$HEALTHY" -eq 1 ]] || die "container did not become healthy — inspect: docker logs ${CONTAINER}"

# ── Verify ─────────────────────────────────────────────────────────────────
ROWS_AFTER="$(ch_q "$COUNT_SQL")"
if [[ -n "$ROWS_BEFORE" ]]; then
  log "active rows after=${ROWS_AFTER} (before=${ROWS_BEFORE})"
  [[ "$ROWS_AFTER" == "$ROWS_BEFORE" ]] ||
    die "row count changed (${ROWS_BEFORE} -> ${ROWS_AFTER}) — check volume binding immediately"
else
  log "active rows after=${ROWS_AFTER}"
  [[ -n "$ROWS_AFTER" && "$ROWS_AFTER" != "0" ]] ||
    die "database is empty — the named volume is probably not attached"
fi

STALE="$(docker inspect "$CONTAINER" \
  --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{println}}{{end}}{{end}}' |
  grep -c '/opt/synqdrive/releases/' || true)"
[[ "$STALE" == "0" ]] || die "${STALE} bind(s) still point at a release path"

log "all binds now resolve under ${SHARED}/clickhouse:"
docker inspect "$CONTAINER" \
  --format '{{range .Mounts}}{{if eq .Type "bind"}}  {{.Source}} -> {{.Destination}}{{println}}{{end}}{{end}}'

log "storage topology migration complete"
