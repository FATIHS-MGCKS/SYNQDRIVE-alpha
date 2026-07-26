#!/usr/bin/env bash
#
# vps-clickhouse-storage-topology-audit.sh — Read-only ClickHouse storage topology audit.
#
# Phase 2D.2: Detect orphaned mounts, stale release paths, missing directories,
# inconsistent backup paths, and unattached ClickHouse volumes.
#
# Usage (on VPS):
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-storage-topology-audit.sh
#
# Exit codes:
#   0 — all P0 checks passed
#   1 — one or more P0 failures (do not migrate until resolved)
#   2 — usage / prerequisite error
#
set -euo pipefail

CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"
BACKEND_DIR="${BACKEND_DIR:-/opt/synqdrive/current/backend}"
SHARED_BACKUPS="${CLICKHOUSE_SHARED_BACKUPS:-/opt/synqdrive/shared/clickhouse/backups}"
SHARED_CONFIG="${CLICKHOUSE_SHARED_CONFIG:-/opt/synqdrive/shared/clickhouse/config}"
CURRENT_BACKEND="${CURRENT_BACKEND:-/opt/synqdrive/current/backend}"

FAILURES=0
WARNINGS=0

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
p0_fail() { log "P0 FAIL: $*"; FAILURES=$((FAILURES + 1)); }
warn() { log "WARN: $*"; WARNINGS=$((WARNINGS + 1)); }
pass() { log "OK: $*"; }

section() {
  echo ""
  echo "================================================================================"
  echo "== $*"
  echo "================================================================================"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found" >&2
  exit 2
fi

section "Host context"
log "hostname=$(hostname)"
log "backend_dir=${BACKEND_DIR}"
log "current_backend=${CURRENT_BACKEND}"
df -h / | tail -1 || true

section "Container state"
if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  p0_fail "container ${CONTAINER} not found"
else
  docker ps -a --filter "name=^${CONTAINER}$" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  health="$(docker inspect "$CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' 2>/dev/null || echo unknown)"
  log "health=${health}"
  if [[ "$health" != "healthy" && "$health" != "no-healthcheck" ]]; then
    warn "container health is ${health}"
  else
    pass "container health acceptable (${health})"
  fi
fi

section "Bind mounts — existence and staleness"
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  while IFS=$'\t' read -r dest source typ; do
  [[ "$typ" == "bind" ]] || continue
  log "bind ${dest} <- ${source}"
  if [[ ! -e "$source" ]]; then
    p0_fail "bind source missing: ${source} -> ${dest}"
  else
    pass "bind source exists: ${source}"
  fi
  case "$source" in
    /tmp/synqdrive*|/tmp/synqdrive-ch-fix*)
      p0_fail "stale tmp mount path: ${source}"
      ;;
  esac
  if [[ "$source" == *"/opt/synqdrive/releases/"* ]] && [[ "$source" != "${CURRENT_BACKEND}"* ]]; then
    p0_fail "bind points to non-current release path: ${source}"
  fi
  done < <(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{.Destination}}{{"\t"}}{{.Source}}{{"\t"}}{{.Type}}{{"\n"}}{{end}}' 2>/dev/null || true)
fi

section "Backup path consistency"
release_backups="${CURRENT_BACKEND}/storage/clickhouse/backups"
for dir in "$SHARED_BACKUPS" "$release_backups"; do
  if [[ -d "$dir" ]]; then
    count="$(find "$dir" -maxdepth 1 -type f -name '*.zip' 2>/dev/null | wc -l | tr -d ' ')"
    log "backup_dir=${dir} zip_count=${count}"
  else
    warn "backup directory missing: ${dir}"
  fi
done

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  backups_mount="$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
  log "container_/backups_host=${backups_mount:-<not mounted>}"
  if [[ -n "$backups_mount" && "$backups_mount" != "$SHARED_BACKUPS" ]]; then
    warn "/backups is not shared path (expected ${SHARED_BACKUPS}, got ${backups_mount})"
  elif [[ -n "$backups_mount" ]]; then
    pass "/backups uses shared path"
  fi
fi

section "Shared config tree (target topology)"
if [[ -d "$SHARED_CONFIG/config.d" ]]; then
  pass "shared config.d exists"
  ls -la "$SHARED_CONFIG/config.d/" 2>/dev/null || true
else
  warn "shared config not provisioned yet (${SHARED_CONFIG}/config.d) — expected before M1 complete"
fi

section "Docker volumes (clickhouse)"
docker volume ls | grep -i clickhouse || log "(no clickhouse volumes found)"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  while read -r vname; do
    [[ -n "$vname" ]] || continue
    mountpoint="$(docker volume inspect "$vname" --format '{{.Mountpoint}}' 2>/dev/null || echo unknown)"
    used_by="$(docker ps -a --filter "volume=${vname}" --format '{{.Names}}' | tr '\n' ',' | sed 's/,$//')"
    log "volume=${vname} mountpoint=${mountpoint} used_by=${used_by:-<none>}"
    if [[ "$vname" == *clickhouse_data* && "$used_by" != *"$CONTAINER"* ]]; then
      warn "clickhouse_data volume not attached to ${CONTAINER}: ${vname}"
    fi
  done < <(docker volume ls --format '{{.Name}}' | grep -i clickhouse || true)
fi

section "Disk usage"
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec "$CONTAINER" du -sh /var/lib/clickhouse /backups /var/log/clickhouse-server 2>/dev/null || warn "du inside container failed"
  docker exec "$CONTAINER" clickhouse-client -q "
    SELECT formatReadableSize(sum(bytes_on_disk)) AS synqdrive_on_disk, sum(rows) AS rows
    FROM system.parts WHERE database='synqdrive' AND active
  " 2>/dev/null || warn "clickhouse-client query failed"
fi

section "Compose file reference"
if [[ -f "${BACKEND_DIR}/docker-compose.yml" ]]; then
  grep -A20 '^  clickhouse:' "${BACKEND_DIR}/docker-compose.yml" | head -25 || true
else
  warn "docker-compose.yml not found at ${BACKEND_DIR}"
fi

section "Summary"
log "p0_failures=${FAILURES} warnings=${WARNINGS}"
if [[ "$FAILURES" -gt 0 ]]; then
  log "RESULT: FAIL — resolve P0 issues before storage topology migration"
  exit 1
fi
log "RESULT: PASS — safe to proceed to backup validation (Gate G1)"
exit 0
