#!/usr/bin/env bash
#
# vps-offsite-restore-drill.sh — Download remote backup and validate decrypt (isolated).
#
# Does NOT restore into production databases.
#
# Usage:
#   GNUPGHOME=/path/to/recovery-keyring bash vps-offsite-restore-drill.sh --tier postgresql [--artifact basename]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/offsite-backup-lib.sh
source "${SCRIPT_DIR}/lib/offsite-backup-lib.sh"

TIER="postgresql"
ARTIFACT_BASENAME=""
WORK_DIR=""

usage() {
  cat <<'EOF'
Usage: vps-offsite-restore-drill.sh --tier <postgresql|clickhouse|redis> [--artifact <basename.gpg>]

Requires GNUPGHOME with recovery private key (NOT production gpg-backup keyring).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier) TIER="${2:-}"; shift 2 ;;
    --artifact) ARTIFACT_BASENAME="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown: $1" >&2; exit 1 ;;
  esac
done

offsite_defaults
offsite_load_env
offsite_defaults
offsite_validate_config

if [[ "${GNUPGHOME:-}" == "/opt/synqdrive/shared/gpg-backup" ]]; then
  echo "ERROR: use recovery keyring GNUPGHOME, not production public-only keyring" >&2
  exit 1
fi

case "${TIER}" in
  postgresql) TIER_SPEC="${OFFSITE_TIER_POSTGRESQL}" ;;
  clickhouse) TIER_SPEC="${OFFSITE_TIER_CLICKHOUSE}" ;;
  redis) TIER_SPEC="${OFFSITE_TIER_REDIS}" ;;
  *) echo "invalid tier: ${TIER}" >&2; exit 1 ;;
esac

offsite_parse_tier "${TIER_SPEC}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

if [[ -z "${ARTIFACT_BASENAME}" ]]; then
  ARTIFACT_BASENAME="$(basename "$(ls -1t "${TIER_DIR}"/*.gpg 2>/dev/null | head -1)")"
fi
[[ -n "${ARTIFACT_BASENAME}" ]] || { echo "no local artifact to derive basename"; exit 1; }

REMOTE_URI="$(offsite_remote_uri "${TIER_REMOTE}" "${ARTIFACT_BASENAME}")"
LOCAL_GPG="${WORK_DIR}/${ARTIFACT_BASENAME}"
LOCAL_SHA="${LOCAL_GPG}.sha256"

offsite_log "download: ${REMOTE_URI}"
offsite_download_file "${TIER_REMOTE}" "${ARTIFACT_BASENAME}" "${LOCAL_GPG}"
offsite_download_file "${TIER_REMOTE}" "${ARTIFACT_BASENAME}.sha256" "${LOCAL_SHA}"

( cd "${WORK_DIR}" && sha256sum -c "$(basename "${LOCAL_SHA}")" )

PLAIN="${WORK_DIR}/plain"
gpg --batch --yes --decrypt --output "${PLAIN}" "${LOCAL_GPG}"

case "${TIER}" in
  postgresql)
    pg_restore --list "${PLAIN}" | head -5
    ;;
  clickhouse)
    unzip -t "${PLAIN}" | head -3
    ;;
  redis)
    redis-check-rdb "${PLAIN}"
    ;;
esac

offsite_log "offsite restore drill SUCCESS tier=${TIER} artifact=${ARTIFACT_BASENAME}"
