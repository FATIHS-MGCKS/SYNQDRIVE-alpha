#!/usr/bin/env bash
#
# vps-sync-offsite-backups.sh — Central encrypted offsite sync for all backup tiers.
#
# Scans local shared archives (PostgreSQL, ClickHouse, Redis, env) and uploads
# encrypted artifacts with checksum verification. Applies remote retention.
# Sends email alert on failure via Resend.
#
# No production backup may exist only on VPS when OFFSITE_REQUIRED=true.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/offsite-backup-lib.sh
source "${SCRIPT_DIR}/lib/offsite-backup-lib.sh"

offsite_defaults
offsite_load_env
offsite_defaults
offsite_ensure_dirs

DRY_RUN=false
VERIFY_ONLY=false

usage() {
  cat <<'EOF'
Usage: vps-sync-offsite-backups.sh [--dry-run] [--verify-only]

Syncs encrypted local backup archives to offsite storage (rclone or S3).
Config: /opt/synqdrive/shared/offsite-backup.env
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --verify-only) VERIFY_ONLY=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) offsite_die "unknown argument: $1" ;;
  esac
done

if [[ "${DRY_RUN}" != "true" && "${VERIFY_ONLY}" != "true" ]]; then
  offsite_validate_config
fi

FAILURES=0
SYNCED=0
SKIPPED=0

sync_tier() {
  local spec="$1"
  offsite_parse_tier "${spec}"
  [[ -d "${TIER_DIR}" ]] || {
    offsite_log "tier ${TIER_NAME}: dir missing ${TIER_DIR} (skip)"
    return 0
  }
  offsite_log "tier ${TIER_NAME}: scanning ${TIER_DIR}"
  local artifact
  while IFS= read -r artifact; do
    [[ -n "${artifact}" ]] || continue
    if [[ "${DRY_RUN}" == "true" ]]; then
      offsite_log "  would sync: $(basename "${artifact}")"
      continue
    fi
    if [[ "${VERIFY_ONLY}" == "true" ]]; then
      if offsite_verify_checksum_sidecar "${artifact}"; then
        offsite_log "  verify OK: $(basename "${artifact}")"
      else
        offsite_log "  verify FAIL: ${artifact}"
        FAILURES=$((FAILURES + 1))
      fi
      continue
    fi
    if offsite_sync_artifact "${artifact}" "${TIER_REMOTE}"; then
      SYNCED=$((SYNCED + 1))
    fi
  done < <(offsite_list_tier_artifacts "${TIER_DIR}")

  if [[ "${DRY_RUN}" != "true" && "${VERIFY_ONLY}" != "true" ]]; then
    offsite_rotate_remote_tier "${TIER_REMOTE}" "${TIER_RETENTION_DAYS}" "${TIER_MIN_GEN}"
  fi
}

if [[ "${DRY_RUN}" == "true" ]]; then
  offsite_log "DRY RUN mode=${OFFSITE_MODE} remote=${OFFSITE_RCLONE_REMOTE:-${OFFSITE_S3_URI:-none}}"
fi

while IFS= read -r tier_spec; do
  [[ -n "${tier_spec}" ]] || continue
  sync_tier "${tier_spec}" || FAILURES=$((FAILURES + 1))
done < <(offsite_tier_specs)

if [[ "${FAILURES}" -gt 0 ]]; then
  offsite_die "offsite sync completed with ${FAILURES} failure(s); synced=${SYNCED}"
fi

if [[ "${DRY_RUN}" == "true" || "${VERIFY_ONLY}" == "true" ]]; then
  offsite_log "done (no upload)"
  exit 0
fi

export OFFSITE_SYNC_COUNT="${SYNCED}"
offsite_write_last_success
offsite_write_resilience_json
offsite_notify_success
offsite_log "offsite sync SUCCESS synced=${SYNCED} skipped=${SKIPPED}"
