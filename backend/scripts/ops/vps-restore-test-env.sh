#!/usr/bin/env bash
#
# vps-restore-test-env.sh — Non-destructive env snapshot restore drill.
# Decrypts and validates tarball contents; never overwrites live env files.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/restore-validation-lib.sh
source "${SCRIPT_DIR}/lib/restore-validation-lib.sh"

rv_defaults
rv_assert_isolated_mode
rv_ensure_dirs

ARTIFACT=""
BACKUP_DIR="${RESTORE_VALIDATION_ENV_BACKUP_DIR}"
START_MS="$(rv_now_ms)"

usage() {
  cat <<'EOF'
Usage: vps-restore-test-env.sh [--artifact <path>]
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
  ARTIFACT="$(rv_latest_artifact "${BACKUP_DIR}" "env-daily-*.tar.gpg")"
fi

WORK="$(rv_workdir env)"
PLAIN="${WORK}/env.tar"

if [[ -z "${ARTIFACT}" || ! -f "${ARTIFACT}" ]]; then
  rv_record_tier_result "configuration" false "$(rv_elapsed_ms "${START_MS}")" "blocked" \
    "no env snapshot in ${BACKUP_DIR}" ""
  rv_die "no env snapshot found"
fi

rv_log "env restore-test artifact=${ARTIFACT}"
rv_verify_checksum_sidecar "${ARTIFACT}" || {
  rv_record_tier_result "configuration" false "$(rv_elapsed_ms "${START_MS}")" "failed" "checksum invalid" ""
  exit 1
}

rv_decrypt_gpg "${ARTIFACT}" "${PLAIN}" || {
  rv_record_tier_result "configuration" false "$(rv_elapsed_ms "${START_MS}")" "failed" "gpg decrypt failed" ""
  exit 1
}

LISTING="$(tar -tf "${PLAIN}" 2>/dev/null | tr '\n' ',' | sed 's/,$//')"
HAS_BACKEND=0
HAS_FRONTEND=0
echo "${LISTING}" | grep -q 'backend\.env' && HAS_BACKEND=1
echo "${LISTING}" | grep -q 'frontend\.env' && HAS_FRONTEND=1

if [[ "${HAS_BACKEND}" -ne 1 || "${HAS_FRONTEND}" -ne 1 ]]; then
  rv_record_tier_result "configuration" false "$(rv_elapsed_ms "${START_MS}")" "failed" \
    "missing backend.env or frontend.env in archive" "listing=${LISTING}"
  exit 1
fi

mkdir -p "${WORK}/extract"
tar -xf "${PLAIN}" -C "${WORK}/extract"

REQUIRED_KEYS=(DATABASE_URL REDIS_HOST CLERK_SECRET_KEY)
MISSING=""
for key in "${REQUIRED_KEYS[@]}"; do
  grep -q "^${key}=" "${WORK}/extract/backend.env" 2>/dev/null || MISSING="${MISSING}${key},"
done

if [[ -n "${MISSING}" ]]; then
  rv_record_tier_result "configuration" false "$(rv_elapsed_ms "${START_MS}")" "failed" \
    "required keys missing in backend.env: ${MISSING}" ""
  exit 1
fi

DETAILS="files=${LISTING}; required_keys_present=true; live_env_untouched=true"
rv_record_tier_result "configuration" true "$(rv_elapsed_ms "${START_MS}")" "passed" "" "${DETAILS}"
rv_log "env restore-test SUCCESS"
