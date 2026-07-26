#!/usr/bin/env bash
#
# vps-backup-database.sh — PostgreSQL logical backup (pg_dump -Fc, encrypted).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/postgresql-backup-lib.sh
source "${SCRIPT_DIR}/lib/postgresql-backup-lib.sh"

pg_backup_defaults
pg_backup_load_env
pg_backup_defaults
pg_backup_ensure_dirs

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="synqdrive-${PG_BACKUP_LABEL}-${TS}"
PLAIN="${PG_BACKUP_STAGING_DIR}/${BASE}.dump"
ARTIFACT="${PG_BACKUP_STAGING_DIR}/${BASE}.dump.gpg"

pg_backup_log "starting PostgreSQL backup"
pg_dump "${DATABASE_URL}" -Fc -f "${PLAIN}" --no-owner --no-acl
[[ -s "${PLAIN}" ]] || pg_backup_die "empty dump"

pg_backup_encrypt "${PLAIN}" "${ARTIFACT}"
rm -f "${PLAIN}"
CHECKSUM="$(pg_backup_write_checksum "${ARTIFACT}")"

ARCHIVE="$(pg_backup_promote "${ARTIFACT}")"
cat > "${ARCHIVE}.meta.json" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","label":"${PG_BACKUP_LABEL}","sha256":"${CHECKSUM}","format":"pg_dump_fc"}
EOF

pg_backup_rotate
pg_backup_log "backup SUCCESS: ${ARCHIVE}"
