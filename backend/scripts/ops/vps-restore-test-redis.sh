#!/usr/bin/env bash
#
# vps-restore-test-redis.sh — Non-destructive RDB integrity drill.
#
# Runs redis-check-rdb on a shared archive (decrypt if needed).
# Does NOT restore into the live Redis instance.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/redis-backup-lib.sh
source "${SCRIPT_DIR}/lib/redis-backup-lib.sh"

redis_backup_defaults
redis_backup_load_env_file
redis_backup_load_backend_credentials
redis_backup_defaults

ARTIFACT=""

usage() {
  cat <<'EOF'
Usage: vps-restore-test-redis.sh [--artifact <path>]

Default artifact: latest valid archive in daily/
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) redis_backup_die "unknown argument: $1" ;;
  esac
done

redis_backup_ensure_dirs

if [[ -z "${ARTIFACT}" ]]; then
  ARTIFACT="$(redis_backup_list_valid_archives "${REDIS_BACKUP_ARCHIVE_DIR}" | tail -1)"
fi
[[ -n "${ARTIFACT}" && -f "${ARTIFACT}" ]] || redis_backup_die "no valid archive found"

redis_backup_log "restore-test (integrity only): ${ARTIFACT}"
redis_backup_verify_artifact "${ARTIFACT}"

cat > "${REDIS_BACKUP_STATE_DIR}/last-restore-test.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "artifact": "${ARTIFACT}",
  "mode": "integrity-only",
  "live_redis_restore": false
}
EOF

redis_backup_log "restore-test SUCCESS (redis-check-rdb passed; live Redis untouched)"
