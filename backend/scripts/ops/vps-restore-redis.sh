#!/usr/bin/env bash
#
# vps-restore-redis.sh — Restore Redis from archived RDB (MAINTENANCE WINDOW).
#
# DESTRUCTIVE: replaces live Redis data. PostgreSQL remains authoritative for
# business state — run Postgres recovery schedulers after restore if needed.
#
# Requires: REDIS_RESTORE_CONFIRM=I_UNDERSTAND_DATA_LOSS
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/redis-backup-lib.sh
source "${SCRIPT_DIR}/lib/redis-backup-lib.sh"

redis_backup_defaults
redis_backup_load_env_file
redis_backup_load_backend_credentials
redis_backup_defaults

ARTIFACT=""
SKIP_PM2_STOP=false

usage() {
  cat <<'EOF'
Usage: vps-restore-redis.sh --artifact <archive.rdb|.rdb.gpg> [options]

Options:
  --skip-pm2-stop   Do not stop/start PM2 synqdrive (manual operator control)

Environment:
  REDIS_RESTORE_CONFIRM=I_UNDERSTAND_DATA_LOSS   Required safety gate

After restore, verify BullMQ queues and run Postgres-backed recovery schedulers.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    --skip-pm2-stop) SKIP_PM2_STOP=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) redis_backup_die "unknown argument: $1" ;;
  esac
done

[[ -n "${ARTIFACT}" && -f "${ARTIFACT}" ]] || redis_backup_die "--artifact required"
[[ "${REDIS_RESTORE_CONFIRM:-}" == "I_UNDERSTAND_DATA_LOSS" ]] || \
  redis_backup_die "set REDIS_RESTORE_CONFIRM=I_UNDERSTAND_DATA_LOSS"

redis_backup_validate_config
redis_backup_verify_artifact "${ARTIFACT}"

REDIS_DIR="$(redis_backup_cli CONFIG GET dir | tail -1)"
REDIS_DBFILE="$(redis_backup_cli CONFIG GET dbfilename | tail -1)"
TARGET="${REDIS_DIR}/${REDIS_DBFILE}"
TEMP_RDB="$(mktemp "${REDIS_BACKUP_STAGING_DIR}/restore.XXXXXX.rdb")"

cleanup() {
  rm -f "${TEMP_RDB}"
}
trap cleanup EXIT

if [[ "${ARTIFACT}" == *.gpg ]]; then
  if [[ -n "${REDIS_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --decrypt --output "${TEMP_RDB}" "${ARTIFACT}"
  elif [[ -f "${REDIS_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --passphrase-file "${REDIS_BACKUP_GPG_PASSPHRASE_FILE}" \
      --decrypt --output "${TEMP_RDB}" "${ARTIFACT}"
  else
    redis_backup_die "cannot decrypt artifact"
  fi
else
  cp "${ARTIFACT}" "${TEMP_RDB}"
fi

redis_backup_verify_rdb "${TEMP_RDB}"

redis_backup_log "restoring to ${TARGET} (maintenance window)"

if [[ "${SKIP_PM2_STOP}" != "true" ]] && command -v pm2 >/dev/null 2>&1; then
  pm2 stop synqdrive || true
fi

redis_backup_cli SHUTDOWN NOSAVE || systemctl stop redis-server || true
sleep 2

cp "${TEMP_RDB}" "${TARGET}"
chown redis:redis "${TARGET}" 2>/dev/null || chown redis-server:redis-server "${TARGET}" 2>/dev/null || true
chmod 640 "${TARGET}" 2>/dev/null || true

systemctl start redis-server
sleep 2
redis_backup_cli PING | grep -q PONG || redis_backup_die "redis did not start"

if [[ "${SKIP_PM2_STOP}" != "true" ]] && command -v pm2 >/dev/null 2>&1; then
  pm2 start synqdrive || pm2 restart synqdrive
fi

redis_backup_log "restore complete — dbsize=$(redis_backup_cli DBSIZE)"
redis_backup_bullmq_inspect
