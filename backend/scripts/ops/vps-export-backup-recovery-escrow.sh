#!/usr/bin/env bash
#
# vps-export-backup-recovery-escrow.sh — Export GPG recovery private key to encrypted escrow bundle.
#
# NEVER run on the production VPS. Use on a secure operator workstation or Cloud Agent
# with access to the recovery keyring only.
#
# Requires:
#   BACKUP_RECOVERY_ESCROW_PASSPHRASE — operator-controlled passphrase (env, not logged)
#   GNUPGHOME — keyring containing the secret key (default: not production path)
#
# Output: encrypted .gpg bundle (no plaintext key material in stdout/logs)
#
set -euo pipefail

FINGERPRINT="${BACKUP_RECOVERY_FINGERPRINT:-D50BCE8EB4A747F582B9D9C37439FE8C4034183A}"
OUTPUT="${BACKUP_RECOVERY_ESCROW_OUTPUT:-./backup-recovery-private-key-escrow.gpg}"
PRODUCTION_GNUPGHOME="/opt/synqdrive/shared/gpg-backup"

if [[ -z "${BACKUP_RECOVERY_ESCROW_PASSPHRASE:-}" ]]; then
  echo "ERROR: set BACKUP_RECOVERY_ESCROW_PASSPHRASE (operator password manager / secure secret store)" >&2
  exit 1
fi

if [[ "${GNUPGHOME:-}" == "${PRODUCTION_GNUPGHOME}" ]]; then
  echo "ERROR: refuse to export secret key from production GNUPGHOME" >&2
  exit 1
fi

if ! command -v gpg >/dev/null 2>&1; then
  echo "ERROR: gpg not found" >&2
  exit 1
fi

if ! gpg --list-secret-keys "${FINGERPRINT}" 2>/dev/null | grep -q '^sec'; then
  echo "ERROR: no secret key for fingerprint ${FINGERPRINT} in GNUPGHOME=${GNUPGHOME:-~/.gnupg}" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

gpg --batch --yes --pinentry-mode loopback \
  --passphrase "${BACKUP_RECOVERY_ESCROW_PASSPHRASE}" \
  --symmetric --cipher-algo AES256 \
  --output "${OUTPUT}" \
  < <(gpg --batch --yes --armor --export-secret-keys "${FINGERPRINT}")

chmod 600 "${OUTPUT}"
echo "Escrow bundle written: ${OUTPUT}"
echo "Fingerprint: ${FINGERPRINT}"
echo "Store passphrase in operator password manager — never commit or log it."
