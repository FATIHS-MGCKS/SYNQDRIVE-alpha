#!/usr/bin/env bash
#
# vps-configure-redis-persistence.sh — Enable RDB + AOF for native Redis (VPS).
#
# Writes /opt/synqdrive/shared/redis/synqdrive-persistence.conf and ensures
# it is included from the system redis.conf. Requires redis-server restart.
#
# Does NOT change Docker containers (production Redis is native systemd).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/redis-backup-lib.sh
source "${SCRIPT_DIR}/lib/redis-backup-lib.sh"

redis_backup_defaults
redis_backup_load_env_file
redis_backup_defaults

REDIS_MAIN_CONF="${REDIS_MAIN_CONF:-/etc/redis/redis.conf}"
REDIS_INCLUDE_MARKER="# synqdrive-persistence-2c4"
MAXMEMORY_MB="${REDIS_PERSISTENCE_MAXMEMORY_MB:-0}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    *) redis_backup_die "unknown argument: $1" ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  redis_backup_die "run as root"
fi

mkdir -p "$(dirname "${REDIS_BACKUP_PERSISTENCE_CONF}")"

PERSISTENCE_BODY="# SynqDrive 2C.4 — BullMQ queue buffer persistence
# PostgreSQL remains System of Record; Redis is async work buffer.

# RDB snapshots
save 900 1
save 300 10
save 60 10000

# AOF — fsync every second (balance durability / throughput)
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite yes
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# BullMQ job keys are typically non-volatile — keep noeviction to avoid silent job loss
maxmemory-policy noeviction
"

if [[ "${MAXMEMORY_MB}" -gt 0 ]]; then
  PERSISTENCE_BODY+="
maxmemory ${MAXMEMORY_MB}mb
"
else
  PERSISTENCE_BODY+="
# maxmemory not set — configure REDIS_PERSISTENCE_MAXMEMORY_MB to cap RAM (recommended)
"
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '%s\n' "${PERSISTENCE_BODY}"
  exit 0
fi

printf '%s\n' "${PERSISTENCE_BODY}" > "${REDIS_BACKUP_PERSISTENCE_CONF}"
chmod 644 "${REDIS_BACKUP_PERSISTENCE_CONF}"

if [[ -f "${REDIS_MAIN_CONF}" ]] && ! grep -q "${REDIS_INCLUDE_MARKER}" "${REDIS_MAIN_CONF}"; then
  {
    echo ""
    echo "${REDIS_INCLUDE_MARKER}"
    echo "include ${REDIS_BACKUP_PERSISTENCE_CONF}"
  } >> "${REDIS_MAIN_CONF}"
  redis_backup_log "appended include to ${REDIS_MAIN_CONF}"
elif [[ ! -f "${REDIS_MAIN_CONF}" ]]; then
  redis_backup_log "WARN: ${REDIS_MAIN_CONF} not found — copy include manually:"
  redis_backup_log "  include ${REDIS_BACKUP_PERSISTENCE_CONF}"
fi

redis_backup_log "restarting redis-server"
systemctl restart redis-server
sleep 2

if redis_backup_cli INFO persistence | grep -q 'aof_enabled:1'; then
  redis_backup_log "AOF enabled OK"
else
  redis_backup_log "WARN: AOF may not be enabled — verify redis config"
fi

redis_backup_log "persistence config: ${REDIS_BACKUP_PERSISTENCE_CONF}"
