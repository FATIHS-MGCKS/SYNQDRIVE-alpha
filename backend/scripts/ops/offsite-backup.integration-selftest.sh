#!/usr/bin/env bash
# Integration selftest: offsite sync/verify/failure semantics using rclone local backend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
LOCAL_BACKUP="${ROOT}/local"
REMOTE_ROOT="${ROOT}/remote"
STATE="${ROOT}/state"
ENV_FILE="${ROOT}/offsite-backup.env"
RCLONE_CONF="${ROOT}/rclone.conf"
RESILIENCE="${ROOT}/resilience-status.json"
PROM="${ROOT}/synqdrive_backup.prom"

trap 'rm -rf "${ROOT}"' EXIT

mkdir -p "${LOCAL_BACKUP}/postgresql/daily" "${REMOTE_ROOT}" "${STATE}"

# shellcheck source=lib/offsite-backup-lib.sh
source "${SCRIPT_DIR}/lib/offsite-backup-lib.sh"

cat > "${RCLONE_CONF}" <<EOF
[testoffsite]
type = local
nounc = true
EOF

ARTIFACT="${LOCAL_BACKUP}/postgresql/daily/synqdrive-daily-test.dump.gpg"
printf 'encrypted-payload-test' > "${ARTIFACT}"
printf '%s  %s\n' "$(offsite_sha256 "${ARTIFACT}")" "$(basename "${ARTIFACT}")" > "${ARTIFACT}.sha256"

PLAIN="${LOCAL_BACKUP}/postgresql/daily/leak.dump"
printf 'must-not-upload' > "${PLAIN}"

export OFFSITE_ENV_FILE="${ENV_FILE}"
export OFFSITE_STATE_DIR="${STATE}"
export OFFSITE_MANIFEST="${STATE}/manifest.jsonl"
export OFFSITE_RESILIENCE_JSON="${RESILIENCE}"
export OFFSITE_PROM_TEXTFILE="${PROM}"
export OFFSITE_RCLONE_CONF="${RCLONE_CONF}"
export OFFSITE_MODE=rclone
export OFFSITE_REQUIRED=true
export OFFSITE_REQUIRE_ENCRYPTION=true
export OFFSITE_PATH_PREFIX=production
export OFFSITE_RCLONE_REMOTE="testoffsite:${REMOTE_ROOT}"
export OFFSITE_TIER_POSTGRESQL="postgresql:${LOCAL_BACKUP}/postgresql/daily:postgresql:90:2"
export OFFSITE_TIER_CLICKHOUSE="clickhouse:${LOCAL_BACKUP}/clickhouse/daily:clickhouse:30:2"
export OFFSITE_TIER_REDIS="redis:${LOCAL_BACKUP}/redis/daily:redis:30:2"
export OFFSITE_TIER_ENV="env:${LOCAL_BACKUP}/env/daily:env:90:2"

offsite_defaults
offsite_load_env
offsite_defaults
offsite_ensure_dirs
offsite_validate_config

# Plaintext must fail closed (guard function — sync uses offsite_die/exit)
offsite_artifact_allowed "${PLAIN}" && { echo "FAIL: plaintext guard"; exit 1; }

# Successful sync
offsite_parse_tier "${OFFSITE_TIER_POSTGRESQL}"
TIER_NAME=postgresql
offsite_sync_artifact "${ARTIFACT}" "${TIER_REMOTE}"

REMOTE_FILE="${REMOTE_ROOT}/production/postgresql/$(basename "${ARTIFACT}")"
[[ -f "${REMOTE_FILE}" ]] || { echo "FAIL: remote artifact missing"; exit 1; }

export OFFSITE_SYNC_COUNT=1
offsite_write_last_success
offsite_write_resilience_json
[[ -f "${RESILIENCE}" ]] || { echo "FAIL: resilience json"; exit 1; }
grep -q synqdrive_offsite_last_success_timestamp "${PROM}" || { echo "FAIL: prom metrics"; exit 1; }

# Verify script path
bash "${SCRIPT_DIR}/vps-verify-offsite-backups.sh"

# Auth failure simulation: wrong remote
export OFFSITE_RCLONE_REMOTE="testoffsite:${ROOT}/nonexistent-bucket"
if bash "${SCRIPT_DIR}/vps-verify-offsite-backups.sh" 2>/dev/null; then
  echo "FAIL: verify should fail on missing remote"
  exit 1
fi

# Local backup preserved after failure
[[ -f "${ARTIFACT}" ]] || { echo "FAIL: local artifact removed"; exit 1; }

echo "offsite-backup integration selftest: OK"
