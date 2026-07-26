#!/usr/bin/env bash
#
# vps-verify-offsite-backups.sh — Integrity audit: local archives + offsite presence.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/offsite-backup-lib.sh
source "${SCRIPT_DIR}/lib/offsite-backup-lib.sh"

offsite_defaults
offsite_load_env
offsite_defaults
offsite_ensure_dirs
offsite_validate_config

FAILURES=0

verify_tier() {
  local spec="$1"
  offsite_parse_tier "${spec}"
  [[ -d "${TIER_DIR}" ]] || return 0
  local artifact basename size
  local count=0
  while IFS= read -r artifact; do
    [[ -n "${artifact}" ]] || continue
    count=$((count + 1))
    if ! offsite_verify_checksum_sidecar "${artifact}"; then
      offsite_log "LOCAL FAIL: ${artifact}"
      FAILURES=$((FAILURES + 1))
      continue
    fi
    basename="$(basename "${artifact}")"
    size="$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")"
    if ! offsite_remote_exists_with_size "${TIER_REMOTE}" "${basename}" "${size}"; then
      offsite_log "OFFSITE MISSING: ${TIER_REMOTE}/${basename}"
      FAILURES=$((FAILURES + 1))
    else
      offsite_log "OK: ${TIER_REMOTE}/${basename}"
    fi
  done < <(offsite_list_tier_artifacts "${TIER_DIR}")
  if [[ "${count}" -eq 0 ]]; then
    offsite_log "WARN: tier ${TIER_NAME} has no valid local archives"
    FAILURES=$((FAILURES + 1))
  fi
}

while IFS= read -r tier_spec; do
  verify_tier "${tier_spec}"
done < <(offsite_tier_specs)

if [[ "${FAILURES}" -gt 0 ]]; then
  offsite_die "offsite verify failed: ${FAILURES} issue(s)"
fi

offsite_log "offsite verify SUCCESS"
