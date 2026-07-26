#!/usr/bin/env bash
#
# vps-backup-clickhouse.sh — ClickHouse logical backup (BACKUP DATABASE → encrypted zip).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CH_BACKUP_ROOT="${CH_BACKUP_ROOT:-/opt/synqdrive/shared/backups/clickhouse}"
CH_BACKUP_STAGING="${CH_BACKUP_STAGING_DIR:-${CH_BACKUP_ROOT}/staging}"
CH_BACKUP_ARCHIVE="${CH_BACKUP_ARCHIVE_DIR:-${CH_BACKUP_ROOT}/daily}"
CH_BACKUP_ENV="${CH_BACKUP_ENV_FILE:-/opt/synqdrive/shared/clickhouse-backup.env}"
CH_DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CH_USER="${CLICKHOUSE_USER:-synqdrive}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
CH_HOST="${CLICKHOUSE_HOST:-127.0.0.1}"
CH_PORT="${CLICKHOUSE_PORT:-9000}"
CH_DISK_PATH="${CLICKHOUSE_BACKUP_DISK_PATH:-/opt/synqdrive/shared/clickhouse/backups}"
CH_GPG_RECIPIENT="${CH_BACKUP_GPG_RECIPIENT:-}"
CH_GPG_PASSPHRASE_FILE="${CH_BACKUP_GPG_PASSPHRASE_FILE:-}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

[[ -f "${CH_BACKUP_ENV}" ]] && { set -a; # shellcheck disable=SC1090
  source "${CH_BACKUP_ENV}"; set +a; }

mkdir -p "${CH_BACKUP_STAGING}" "${CH_BACKUP_ARCHIVE}" "${CH_DISK_PATH}"
chmod 700 "${CH_BACKUP_ROOT}" 2>/dev/null || true

TS="$(date -u +%Y%m%dT%H%M%SZ)"
ZIP_NAME="synqdrive-daily-${TS}.zip"
STAGING_ZIP="${CH_BACKUP_STAGING}/${ZIP_NAME}"
ARTIFACT="${CH_BACKUP_STAGING}/${ZIP_NAME}.gpg"

ch_client() {
  clickhouse-client --host "${CH_HOST}" --port "${CH_PORT}" \
    --user "${CH_USER}" ${CH_PASSWORD:+--password "${CH_PASSWORD}"} "$@"
}

log "starting ClickHouse backup database=${CH_DATABASE}"
ch_client --query "BACKUP DATABASE ${CH_DATABASE} TO Disk('backups', '${ZIP_NAME}')" \
  || die "BACKUP DATABASE failed — verify ClickHouse backups disk mount"

SRC="${CH_DISK_PATH}/${ZIP_NAME}"
[[ -f "${SRC}" ]] || die "backup file not found at ${SRC}"
cp "${SRC}" "${STAGING_ZIP}"

if [[ -n "${CH_GPG_RECIPIENT}" ]]; then
  gpg --batch --yes --trust-model always --encrypt --recipient "${CH_GPG_RECIPIENT}" \
    --output "${ARTIFACT}" "${STAGING_ZIP}"
elif [[ -f "${CH_GPG_PASSPHRASE_FILE}" ]]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${CH_GPG_PASSPHRASE_FILE}" \
    --output "${ARTIFACT}" "${STAGING_ZIP}"
else
  die "GPG not configured for ClickHouse backup"
fi
rm -f "${STAGING_ZIP}"

CHECKSUM="$(sha256sum "${ARTIFACT}" | awk '{print $1}')"
printf '%s  %s\n' "${CHECKSUM}" "$(basename "${ARTIFACT}")" > "${ARTIFACT}.sha256"
DEST="${CH_BACKUP_ARCHIVE}/$(basename "${ARTIFACT}")"
[[ -e "${DEST}" ]] && die "refusing to overwrite ${DEST}"
mv "${ARTIFACT}" "${DEST}"
mv "${ARTIFACT}.sha256" "${DEST}.sha256"

log "backup SUCCESS: ${DEST}"
