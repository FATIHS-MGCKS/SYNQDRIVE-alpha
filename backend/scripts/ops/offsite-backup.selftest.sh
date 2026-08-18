#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

# shellcheck source=lib/offsite-backup-lib.sh
source "${SCRIPT_DIR}/lib/offsite-backup-lib.sh"

export OFFSITE_MODE=none
export OFFSITE_REQUIRED=false
export OFFSITE_REQUIRE_ENCRYPTION=true
export OFFSITE_PATH_PREFIX=production

TIER_DIR="${ROOT}/tier"
mkdir -p "${TIER_DIR}"
ARTIFACT="${TIER_DIR}/redis-daily-test.rdb.gpg"
printf 'cipher' > "${ARTIFACT}"
printf '%s  %s\n' "$(offsite_sha256 "${ARTIFACT}")" "$(basename "${ARTIFACT}")" > "${ARTIFACT}.sha256"

list="$(offsite_list_tier_artifacts "${TIER_DIR}")"
[[ "${list}" == "${ARTIFACT}" ]] || { echo "FAIL list"; exit 1; }

offsite_parse_tier "test:${TIER_DIR}:postgresql:7:2"
[[ "${TIER_NAME}" == "test" && "${TIER_DIR}" == "${ROOT}/tier" ]] || { echo "FAIL parse"; exit 1; }

[[ "$(offsite_remote_subpath "postgresql")" == "production/postgresql" ]] || { echo "FAIL path prefix"; exit 1; }

PLAIN="${TIER_DIR}/leak.dump"
printf 'plaintext' > "${PLAIN}"
if offsite_artifact_allowed "${PLAIN}"; then
  echo "FAIL plaintext guard"
  exit 1
fi

if ! offsite_artifact_allowed "${ARTIFACT}"; then
  echo "FAIL gpg allowed"
  exit 1
fi

export OFFSITE_MODE=rclone
export OFFSITE_RCLONE_REMOTE=testremote:bucket
uri="$(offsite_remote_uri "postgresql" "synqdrive-daily.dump.gpg")"
[[ "${uri}" == "testremote:bucket/production/postgresql/synqdrive-daily.dump.gpg" ]] || {
  echo "FAIL remote uri: ${uri}"
  exit 1
}

echo "offsite-backup selftest: OK"
