#!/usr/bin/env bash
#
# vps-setup-backup-gpg.sh — Import SynqDrive backup recovery PUBLIC key on VPS.
#
# Production backup encryption uses public-key recipient model only.
# Private recovery key must be stored offline (password manager / HSM).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_KEY="${SCRIPT_DIR}/keys/synqdrive-backup-recovery.pub.asc"
GPG_HOME="${GPG_BACKUP_HOME:-/opt/synqdrive/shared/gpg-backup}"
ENV_FILE="${GPG_BACKUP_ENV_FILE:-/opt/synqdrive/shared/backup-gpg.env}"
ENV_EXAMPLE="${SCRIPT_DIR}/backup-gpg.env.example"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)" >&2
  exit 1
fi

if ! command -v gpg >/dev/null 2>&1; then
  echo "ERROR: gpg not installed (apt-get install -y gpg)" >&2
  exit 1
fi

[[ -f "${PUBLIC_KEY}" ]] || { echo "ERROR: public key not found: ${PUBLIC_KEY}" >&2; exit 1; }

mkdir -p "${GPG_HOME}"
chmod 700 "${GPG_HOME}"
export GNUPGHOME="${GPG_HOME}"

gpg --batch --import "${PUBLIC_KEY}"

FINGERPRINT="$(gpg --with-colons --list-keys backup@synqdrive.eu 2>/dev/null | awk -F: '/^fpr:/ {print $10; exit}')"
FINGERPRINT="$(printf '%s' "${FINGERPRINT}" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')"
[[ -n "${FINGERPRINT}" ]] || { echo "ERROR: could not read imported key fingerprint" >&2; exit 1; }

KEY_COUNT="$(gpg --list-keys --with-fingerprint backup@synqdrive.eu 2>/dev/null | grep -c '^      ' || true)"
if [[ "${KEY_COUNT}" -ne 1 ]]; then
  echo "ERROR: expected exactly one public key after import, found ${KEY_COUNT}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
fi
chmod 600 "${ENV_FILE}"

if grep -q '^SYNQDRIVE_BACKUP_GPG_FINGERPRINT=' "${ENV_FILE}"; then
  sed -i "s/^SYNQDRIVE_BACKUP_GPG_FINGERPRINT=.*/SYNQDRIVE_BACKUP_GPG_FINGERPRINT=${FINGERPRINT}/" "${ENV_FILE}"
else
  printf '\nSYNQDRIVE_BACKUP_GPG_FINGERPRINT=%s\n' "${FINGERPRINT}" >> "${ENV_FILE}"
fi

if ! grep -q '^GPG_BACKUP_HOME=' "${ENV_FILE}"; then
  printf 'GPG_BACKUP_HOME=%s\n' "${GPG_HOME}" >> "${ENV_FILE}"
fi

echo "GPG backup keyring ready:"
echo "  GNUPGHOME=${GPG_HOME}"
echo "  fingerprint=${FINGERPRINT}"
echo "  env=${ENV_FILE}"
echo "No secret keys imported (public key only)."
