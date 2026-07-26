#!/usr/bin/env bash
#
# vps-backup-env-snapshot.sh — Encrypted snapshot of backend.env + frontend.env (Tier 0).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/offsite-backup-lib.sh
source "${SCRIPT_DIR}/lib/offsite-backup-lib.sh"

offsite_defaults
offsite_load_env
offsite_defaults

BACKEND_ENV="${OFFSITE_BACKEND_ENV}"
FRONTEND_ENV="${FRONTEND_ENV_PATH:-/opt/synqdrive/shared/frontend.env}"
ARCHIVE_ROOT="${OFFSITE_ENV_LOCAL_ROOT:-/opt/synqdrive/shared/backups/env}"
ARCHIVE_DIR="${ARCHIVE_ROOT}/daily"
STAGING_DIR="${ARCHIVE_ROOT}/staging"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
TARBALL="${STAGING_DIR}/env-daily-${TS}.tar"
ARTIFACT="${STAGING_DIR}/env-daily-${TS}.tar.gpg"

mkdir -p "${ARCHIVE_DIR}" "${STAGING_DIR}"
chmod 700 "${ARCHIVE_ROOT}" "${STAGING_DIR}" 2>/dev/null || true

[[ -f "${BACKEND_ENV}" ]] || offsite_die "missing ${BACKEND_ENV}"
[[ -f "${FRONTEND_ENV}" ]] || offsite_die "missing ${FRONTEND_ENV}"

tar -cf "${TARBALL}" -C "$(dirname "${BACKEND_ENV}")" "$(basename "${BACKEND_ENV}")" \
  -C "$(dirname "${FRONTEND_ENV}")" "$(basename "${FRONTEND_ENV}")"

offsite_gpg_encrypt_file "${TARBALL}" "${ARTIFACT}"
rm -f "${TARBALL}"

checksum="$(offsite_sha256 "${ARTIFACT}")"
printf '%s  %s\n' "${checksum}" "$(basename "${ARTIFACT}")" > "${ARTIFACT}.sha256"

cat > "${ARTIFACT}.meta.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "label": "env-daily",
  "encrypted": true,
  "sha256": "${checksum}",
  "files": ["backend.env", "frontend.env"]
}
EOF

DEST="${ARCHIVE_DIR}/$(basename "${ARTIFACT}")"
[[ -e "${DEST}" ]] && offsite_die "refusing to overwrite ${DEST}"
mv "${ARTIFACT}" "${DEST}"
mv "${ARTIFACT}.sha256" "${DEST}.sha256"
mv "${ARTIFACT}.meta.json" "${DEST}.meta.json"

offsite_log "env snapshot: ${DEST}"
