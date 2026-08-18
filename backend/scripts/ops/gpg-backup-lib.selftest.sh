#!/usr/bin/env bash
# CI-safe self-test for gpg-backup-lib (recipient validation + encryption).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
GPG_TEST_HOME="${ROOT}/gpg-home"
trap 'rm -rf "${ROOT}"' EXIT

export GNUPGHOME="${GPG_TEST_HOME}"
mkdir -p "${GPG_TEST_HOME}"
chmod 700 "${GPG_TEST_HOME}"

# shellcheck source=lib/gpg-backup-lib.sh
source "${SCRIPT_DIR}/lib/gpg-backup-lib.sh"

PUBLIC_KEY="${SCRIPT_DIR}/keys/synqdrive-backup-recovery.pub.asc"
[[ -f "${PUBLIC_KEY}" ]] || { echo "FAIL: missing ${PUBLIC_KEY}" >&2; exit 1; }

gpg --batch --import "${PUBLIC_KEY}" >/dev/null 2>&1
FINGERPRINT="$(gpg --with-colons --list-keys backup@synqdrive.eu | awk -F: '/^fpr:/ {print $10; exit}')"
FINGERPRINT="$(gpg_backup_normalize_fingerprint "${FINGERPRINT}")"

PLAIN="${ROOT}/plain.txt"
ENC="${ROOT}/plain.txt.gpg"
printf 'synqdrive-backup-selftest' > "${PLAIN}"

# missing recipient should fail
if ( gpg_backup_encrypt_file "${PLAIN}" "${ENC}" "" "" "" ); then
  echo "FAIL: encrypt without recipient should fail" >&2
  exit 1
fi

# wrong fingerprint should fail
if ( gpg_backup_encrypt_file "${PLAIN}" "${ENC}" "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF" "backup@synqdrive.eu" "" ); then
  echo "FAIL: wrong fingerprint should fail" >&2
  exit 1
fi

# successful encryption
gpg_backup_encrypt_file "${PLAIN}" "${ENC}" "${FINGERPRINT}" "backup@synqdrive.eu" ""
[[ -s "${ENC}" ]] || { echo "FAIL: encrypted artifact empty" >&2; exit 1; }

# packet verify without secret key
if ! gpg_backup_verify_encrypted_packets "${ENC}" "${FINGERPRINT}" "backup@synqdrive.eu"; then
  echo "FAIL: packet verify" >&2
  exit 1
fi

# gpg unavailable simulation
PATH_SAVE="${PATH}"
export PATH="${ROOT}/empty-bin"
if ( gpg_backup_encrypt_file "${PLAIN}" "${ENC}" "${FINGERPRINT}" "backup@synqdrive.eu" "" ); then
  echo "FAIL: gpg missing should fail" >&2
  exit 1
fi
export PATH="${PATH_SAVE}"

# output not writable
if ( gpg_backup_encrypt_file "${PLAIN}" "${ROOT}/missing/dir/out.gpg" "${FINGERPRINT}" "backup@synqdrive.eu" "" ); then
  echo "FAIL: unwritable output should fail" >&2
  exit 1
fi

echo "gpg-backup-lib selftest: OK"
