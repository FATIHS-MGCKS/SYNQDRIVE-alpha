#!/usr/bin/env bash
#
# vps-restore-test-documents.sh — Non-destructive document object restore drill.
# Verifies object archive + optional metadata cross-check from isolated PG drill.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/restore-validation-lib.sh
source "${SCRIPT_DIR}/lib/restore-validation-lib.sh"

rv_defaults
rv_assert_isolated_mode
rv_ensure_dirs

ARTIFACT=""
BACKUP_DIR="${RESTORE_VALIDATION_DOCUMENTS_BACKUP_DIR}"
START_MS="$(rv_now_ms)"
PG_DRILL_DB="${RESTORE_VALIDATION_PG_DRILL_DB:-}"

usage() {
  cat <<'EOF'
Usage: vps-restore-test-documents.sh [--artifact <path>] [--pg-drill-db <name>]

Optional --pg-drill-db: isolated DB from postgresql restore-test for metadata cross-check.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    --pg-drill-db) PG_DRILL_DB="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) rv_die "unknown argument: $1" ;;
  esac
done

if [[ -z "${ARTIFACT}" ]]; then
  ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "documents-daily-*.tar.gpg")"
  [[ -z "${ARTIFACT}" ]] && ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "documents-daily-*.tar.gz")"
fi

if [[ -z "${ARTIFACT}" || ! -f "${ARTIFACT}" ]]; then
  rv_record_tier_result "documents" false "$(rv_elapsed_ms "${START_MS}")" "blocked" \
    "no documents backup artifact (DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS=false)" ""
  rv_log "documents restore-test BLOCKED — no object backup tier"
  exit 1
fi

WORK="$(rv_workdir documents)"
PLAIN="${WORK}/documents.tar"

rv_log "documents restore-test artifact=${ARTIFACT}"

if [[ "${ARTIFACT}" == *.gpg ]]; then
  rv_verify_checksum_sidecar "${ARTIFACT}" || { rv_record_tier_result "documents" false "$(rv_elapsed_ms "${START_MS}")" "failed" "checksum invalid" ""; exit 1; }
  rv_decrypt_gpg "${ARTIFACT}" "${PLAIN}" || { rv_record_tier_result "documents" false "$(rv_elapsed_ms "${START_MS}")" "failed" "gpg decrypt failed" ""; exit 1; }
elif [[ "${ARTIFACT}" == *.gz ]]; then
  gunzip -c "${ARTIFACT}" > "${PLAIN}"
else
  cp "${ARTIFACT}" "${PLAIN}"
fi

FILE_COUNT="$(tar -tf "${PLAIN}" | wc -l | tr -d ' ')"
mkdir -p "${WORK}/extract"
tar -xf "${PLAIN}" -C "${WORK}/extract"

META_CHECK="skipped"
if [[ -n "${PG_DRILL_DB}" ]]; then
  rv_require_safe_db_name "${PG_DRILL_DB}"
  DOC_COUNT="$(PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" psql \
    -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
    -U "${RESTORE_VALIDATION_PG_USER}" -d "${PG_DRILL_DB}" -tAc \
    "SELECT COUNT(*) FROM \"Document\" WHERE \"objectKey\" IS NOT NULL;" 2>/dev/null || echo "")"
  if [[ -n "${DOC_COUNT}" && "${DOC_COUNT}" -gt 0 ]]; then
    SAMPLE_KEY="$(PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" psql \
      -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
      -U "${RESTORE_VALIDATION_PG_USER}" -d "${PG_DRILL_DB}" -tAc \
      "SELECT \"objectKey\" FROM \"Document\" WHERE \"objectKey\" IS NOT NULL LIMIT 1;" 2>/dev/null || echo "")"
    if [[ -n "${SAMPLE_KEY}" && -f "${WORK}/extract/${SAMPLE_KEY}" ]]; then
      META_CHECK="object_key_match"
    else
      META_CHECK="object_key_missing_in_archive"
    fi
  else
    META_CHECK="no_documents_in_drill_db"
  fi
fi

DETAILS="file_count=${FILE_COUNT}; metadata_cross_check=${META_CHECK}; live_documents_untouched=true"
if [[ "${META_CHECK}" == "object_key_missing_in_archive" ]]; then
  rv_record_tier_result "documents" false "$(rv_elapsed_ms "${START_MS}")" "failed" \
    "metadata objectKey not found in restored archive" "${DETAILS}"
  exit 1
fi

rv_record_tier_result "documents" true "$(rv_elapsed_ms "${START_MS}")" "passed" "" "${DETAILS}"
rv_log "documents restore-test SUCCESS (${DETAILS})"
