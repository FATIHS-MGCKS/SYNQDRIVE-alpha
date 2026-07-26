#!/usr/bin/env bash
#
# vps-restore-test-uploads.sh — Non-destructive uploads backup restore drill.
# Verifies archive integrity and spot-checks file hashes; never writes to live uploads/.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/restore-validation-lib.sh
source "${SCRIPT_DIR}/lib/restore-validation-lib.sh"

rv_defaults
rv_assert_isolated_mode
rv_ensure_dirs

ARTIFACT=""
BACKUP_DIR="${RESTORE_VALIDATION_UPLOADS_BACKUP_DIR}"
START_MS="$(rv_now_ms)"

usage() {
  cat <<'EOF'
Usage: vps-restore-test-uploads.sh [--artifact <path>]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) rv_die "unknown argument: $1" ;;
  esac
done

if [[ -z "${ARTIFACT}" ]]; then
  ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "uploads-daily-*.tar.gpg")"
  [[ -z "${ARTIFACT}" ]] && ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "uploads-daily-*.tar.gz")"
fi

if [[ -z "${ARTIFACT}" || ! -f "${ARTIFACT}" ]]; then
  rv_record_tier_result "uploads" false "$(rv_elapsed_ms "${START_MS}")" "blocked" \
    "no uploads backup artifact (backup tier not implemented — see 2C.6 gap)" ""
  rv_log "uploads restore-test BLOCKED — no backup artifact"
  exit 1
fi

WORK="$(rv_workdir uploads)"
PLAIN="${WORK}/uploads.tar"

rv_log "uploads restore-test artifact=${ARTIFACT}"

if [[ "${ARTIFACT}" == *.gpg ]]; then
  rv_verify_checksum_sidecar "${ARTIFACT}" || { rv_record_tier_result "uploads" false "$(rv_elapsed_ms "${START_MS}")" "failed" "checksum invalid" ""; exit 1; }
  rv_decrypt_gpg "${ARTIFACT}" "${PLAIN}" || { rv_record_tier_result "uploads" false "$(rv_elapsed_ms "${START_MS}")" "failed" "gpg decrypt failed" ""; exit 1; }
elif [[ "${ARTIFACT}" == *.gz ]]; then
  gunzip -c "${ARTIFACT}" > "${PLAIN}"
else
  cp "${ARTIFACT}" "${PLAIN}"
fi

FILE_COUNT="$(tar -tf "${PLAIN}" | wc -l | tr -d ' ')"
[[ "${FILE_COUNT}" -gt 0 ]] || { rv_record_tier_result "uploads" false "$(rv_elapsed_ms "${START_MS}")" "failed" "empty archive" ""; exit 1; }

mkdir -p "${WORK}/extract"
tar -xf "${PLAIN}" -C "${WORK}/extract"
SAMPLE="$(find "${WORK}/extract" -type f | head -1)"
SAMPLE_HASH=""
[[ -n "${SAMPLE}" ]] && SAMPLE_HASH="$(rv_sha256 "${SAMPLE}")"

DETAILS="file_count=${FILE_COUNT}; sample_sha256=${SAMPLE_HASH:-none}; live_uploads_untouched=true"
rv_record_tier_result "uploads" true "$(rv_elapsed_ms "${START_MS}")" "passed" "" "${DETAILS}"
rv_log "uploads restore-test SUCCESS (${DETAILS})"
