#!/usr/bin/env bash
# SynqDrive — PostgreSQL backup shared library (Phase 2C.2 / 2C.7).

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

pg_backup_defaults() {
  PG_BACKUP_ROOT="${PG_BACKUP_ROOT:-/opt/synqdrive/shared/backups/postgresql}"
  PG_BACKUP_STAGING_DIR="${PG_BACKUP_STAGING_DIR:-${PG_BACKUP_ROOT}/staging}"
  PG_BACKUP_ARCHIVE_DIR="${PG_BACKUP_ARCHIVE_DIR:-${PG_BACKUP_ROOT}/daily}"
  PG_BACKUP_STATE_DIR="${PG_BACKUP_STATE_DIR:-${PG_BACKUP_ROOT}/state}"
  PG_BACKUP_ENV_FILE="${PG_BACKUP_ENV_FILE:-/opt/synqdrive/shared/postgresql-backup.env}"
  PG_BACKUP_BACKEND_ENV="${PG_BACKUP_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
  PG_BACKUP_LABEL="${PG_BACKUP_LABEL:-daily}"
  PG_BACKUP_MIN_GENERATIONS="${PG_BACKUP_MIN_GENERATIONS:-2}"
  PG_BACKUP_LOCAL_RETENTION_DAYS="${PG_BACKUP_LOCAL_RETENTION_DAYS:-7}"
  PG_BACKUP_GPG_RECIPIENT="${PG_BACKUP_GPG_RECIPIENT:-}"
  PG_BACKUP_GPG_PASSPHRASE_FILE="${PG_BACKUP_GPG_PASSPHRASE_FILE:-}"
  PG_BACKUP_ALLOW_UNENCRYPTED="${PG_BACKUP_ALLOW_UNENCRYPTED:-false}"
  PG_BACKUP_SKIP_OFFSITE="${PG_BACKUP_SKIP_OFFSITE:-true}"
  DATABASE_URL="${DATABASE_URL:-}"
}

pg_backup_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

pg_backup_die() {
  pg_backup_log "ERROR: $*"
  exit 1
}

pg_backup_load_env() {
  if [[ -f "${PG_BACKUP_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a; source "${PG_BACKUP_ENV_FILE}"; set +a
  fi
  if [[ -z "${DATABASE_URL}" && -f "${PG_BACKUP_BACKEND_ENV}" ]]; then
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "${PG_BACKUP_BACKEND_ENV}" | head -1 | cut -d= -f2- | tr -d '"')"
  fi
  [[ -n "${DATABASE_URL}" ]] || pg_backup_die "DATABASE_URL not set"
}

pg_backup_ensure_dirs() {
  mkdir -p "${PG_BACKUP_STAGING_DIR}" "${PG_BACKUP_ARCHIVE_DIR}" "${PG_BACKUP_STATE_DIR}"
  chmod 700 "${PG_BACKUP_ROOT}" "${PG_BACKUP_STAGING_DIR}" 2>/dev/null || true
}

pg_backup_sha256() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${f}" | awk '{print $1}'
  else
    shasum -a 256 "${f}" | awk '{print $1}'
  fi
}

pg_backup_write_checksum() {
  local artifact="$1"
  local checksum
  checksum="$(pg_backup_sha256 "${artifact}")"
  printf '%s  %s\n' "${checksum}" "$(basename "${artifact}")" > "${artifact}.sha256"
  printf '%s' "${checksum}"
}

pg_backup_encrypt() {
  local plain="$1" encrypted="$2"
  if [[ -n "${PG_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --trust-model always --encrypt --recipient "${PG_BACKUP_GPG_RECIPIENT}" \
      --output "${encrypted}" "${plain}"
  elif [[ -f "${PG_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${PG_BACKUP_GPG_PASSPHRASE_FILE}" \
      --output "${encrypted}" "${plain}"
  elif [[ "${PG_BACKUP_ALLOW_UNENCRYPTED}" == "true" ]]; then
    cp "${plain}" "${encrypted}"
  else
    pg_backup_die "GPG not configured"
  fi
}

pg_backup_promote() {
  local staging="$1"
  local dest="${PG_BACKUP_ARCHIVE_DIR}/$(basename "${staging}")"
  [[ -e "${dest}" ]] && pg_backup_die "refusing to overwrite ${dest}"
  mv "${staging}" "${dest}"
  mv "${staging}.sha256" "${dest}.sha256" 2>/dev/null || true
  printf '%s' "${dest}"
}

pg_backup_rotate() {
  local f count
  count="$(find "${PG_BACKUP_ARCHIVE_DIR}" -maxdepth 1 -name '*.dump.gpg' -o -name '*.dump' 2>/dev/null | wc -l | tr -d ' ')"
  [[ "${count}" -le "${PG_BACKUP_MIN_GENERATIONS}" ]] && return 0
  find "${PG_BACKUP_ARCHIVE_DIR}" -maxdepth 1 \( -name '*.dump.gpg' -o -name '*.dump' \) -mtime "+${PG_BACKUP_LOCAL_RETENTION_DAYS}" -print -delete | while read -r f; do
    rm -f "${f}.sha256" "${f}.meta.json"
  done
}
