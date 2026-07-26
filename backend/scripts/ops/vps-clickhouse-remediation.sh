#!/usr/bin/env bash
#
# vps-clickhouse-remediation.sh — Gated ClickHouse remediation orchestrator (Phase 2D.7).
#
# Executes approved steps from 2D.1–2D.6 analyses with backup, integrity checks,
# health checks, and rollback metadata after each step.
#
# Usage:
#   bash vps-clickhouse-remediation.sh --dry-run          # plan only
#   bash vps-clickhouse-remediation.sh --execute          # G1 + M1 + audits
#   bash vps-clickhouse-remediation.sh --execute --recreate  # + M3 container recreate
#
# Abort on any P0 integrity failure. No data-destructive operations.
#
set -euo pipefail

EXECUTE=0
RECREATE=0
BACKFILL_ORG=0
DRY_RUN=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=1; DRY_RUN=0 ;;
    --recreate) RECREATE=1 ;;
    --backfill-org) BACKFILL_ORG=1 ;;
    --dry-run) DRY_RUN=1; EXECUTE=0 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${BACKEND_DIR:-/opt/synqdrive/current/backend}"
SHARED="/opt/synqdrive/shared/clickhouse"
RELEASE="${BACKEND_DIR}"
STATE_DIR="${SHARED}/remediation-state"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
STATE_FILE="${STATE_DIR}/remediation_${TS}.log"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$STATE_FILE"; }
run_step() {
  local name="$1"
  shift
  log "── STEP: ${name} ──"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would run: $*"
    return 0
  fi
  if ! "$@"; then
    log "ABORT: step failed: ${name}"
    log "ROLLBACK: see docs/remediation/clickhouse-remediation.md §8"
    exit 1
  fi
}

mkdir -p "$STATE_DIR" "${SHARED}/backups" "${SHARED}/config/config.d" "${SHARED}/config/users.d"

log "ClickHouse remediation started (execute=${EXECUTE} recreate=${RECREATE} backfill_org=${BACKFILL_ORG})"
log "state_file=${STATE_FILE}"

# ── G1: Backup ────────────────────────────────────────────────────────────────
run_step "G1 backup" bash "${SCRIPT_DIR}/vps-clickhouse-backup.sh" --label "remediation_${TS}"

if [[ "$EXECUTE" -eq 1 ]]; then
  run_step "G1 integrity baseline" bash "${SCRIPT_DIR}/vps-clickhouse-data-integrity-audit.sh"
  run_step "G1 health check" bash "${SCRIPT_DIR}/vps-clickhouse-health-check.sh"
fi

# ── M1: Shared tree (non-destructive) ─────────────────────────────────────────
m1_shared_tree() {
  SHARED="$SHARED" RELEASE="$RELEASE" bash -c '
    set -euo pipefail
    mkdir -p "$SHARED/backups" "$SHARED/config/config.d" "$SHARED/config/users.d"
    chmod 700 "$SHARED" "$SHARED/backups"
    install -m 644 "$RELEASE/docker/clickhouse/config.d/"*.xml "$SHARED/config/config.d/"
    install -m 644 "$RELEASE/docker/clickhouse/users.d/"*.xml "$SHARED/config/users.d/"
    if [[ -d "$RELEASE/storage/clickhouse/backups" ]]; then
      shopt -s nullglob
      for f in "$RELEASE/storage/clickhouse/backups/"*.zip; do
        mv -n "$f" "$SHARED/backups/" || true
      done
    fi
  '
}
run_step "M1 shared tree" m1_shared_tree

if [[ "$EXECUTE" -eq 1 ]]; then
  run_step "M1 topology audit" bash "${SCRIPT_DIR}/vps-clickhouse-storage-topology-audit.sh"
fi

# ── M2: Compose override (repo artifact — verify present) ───────────────────
m2_verify_override() {
  if [[ ! -f "${BACKEND_DIR}/docker-compose.vps-clickhouse.yml" ]]; then
    log "ERROR: docker-compose.vps-clickhouse.yml missing — deploy latest release first"
    return 1
  fi
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/vps-clickhouse-compose-env.sh"
  cd "$BACKEND_DIR"
  if docker compose version >/dev/null 2>&1; then
    docker compose config >/dev/null
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose config >/dev/null
  fi
  log "COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}"
}
run_step "M2 verify compose override" m2_verify_override

# ── M3: Recreate container (optional — brief analytics outage) ───────────────
if [[ "$RECREATE" -eq 1 ]]; then
  recreate_clickhouse() {
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/vps-clickhouse-compose-env.sh"
    cd "$BACKEND_DIR"
    if docker compose version >/dev/null 2>&1; then
      docker compose up -d --force-recreate clickhouse
    else
      docker-compose up -d --force-recreate clickhouse
    fi
    for _ in $(seq 1 30); do
      st="$(docker inspect synqdrive-clickhouse --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
      [[ "$st" == "healthy" ]] && break
      sleep 2
    done
  }
  run_step "M3 recreate clickhouse" recreate_clickhouse

  if [[ "$EXECUTE" -eq 1 ]]; then
    run_step "M3 health check" bash "${SCRIPT_DIR}/vps-clickhouse-health-check.sh"
    run_step "M3 integrity audit" bash "${SCRIPT_DIR}/vps-clickhouse-data-integrity-audit.sh"
    run_step "M3 topology audit" bash "${SCRIPT_DIR}/vps-clickhouse-storage-topology-audit.sh"
    run_step "M3 pipeline audit" bash "${SCRIPT_DIR}/vps-clickhouse-pipeline-audit.sh"
  fi
fi

# ── Schema migration 007 + app deploy ─────────────────────────────────────────
log "── STEP: Migration 007 + org_id writes ──"
log "Applied automatically on backend bootstrap (ClickHouseSchemaService)."
log "Deploy latest release + pm2 restart to apply application org_id mirror writes."
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY-RUN: would deploy release and restart PM2"
fi

# ── Optional org_id backfill ──────────────────────────────────────────────────
if [[ "$BACKFILL_ORG" -eq 1 ]]; then
  export CLICKHOUSE_ORG_BACKFILL_ENABLED=true
  run_step "org_id backfill" bash "${SCRIPT_DIR}/vps-clickhouse-backfill-org-id.sh"
  if [[ "$EXECUTE" -eq 1 ]]; then
    run_step "post-backfill tenant audit" bash "${SCRIPT_DIR}/vps-clickhouse-tenant-isolation-audit.sh"
  fi
fi

# ── Final validation ──────────────────────────────────────────────────────────
if [[ "$EXECUTE" -eq 1 ]]; then
  run_step "final health check" bash "${SCRIPT_DIR}/vps-clickhouse-health-check.sh"
  run_step "final integrity audit" bash "${SCRIPT_DIR}/vps-clickhouse-data-integrity-audit.sh"
fi

log "Remediation ${DRY_RUN:+dry-run }complete."
log "Next: enable mirrors if desired — bash ${SCRIPT_DIR}/vps-enable-clickhouse-mirrors.sh"
exit 0
