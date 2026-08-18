#!/usr/bin/env bash
# SynqDrive — shared GPG helpers for backup encryption (public-key recipient model).
# Sourced by tier backup libraries. Production runtime needs only the public key.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
GPG_BACKUP_LIB_VERSION="1.0.0"

gpg_backup_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

gpg_backup_die() {
  gpg_backup_log "ERROR: $*"
  exit 1
}

gpg_backup_load_shared_env() {
  local env_file="${GPG_BACKUP_ENV_FILE:-/opt/synqdrive/shared/backup-gpg.env}"
  if [[ -f "${env_file}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${env_file}"
    set +a
  fi
}

gpg_backup_ensure_homedir() {
  if [[ -z "${GNUPGHOME:-}" ]]; then
    export GNUPGHOME="${GPG_BACKUP_HOME:-/opt/synqdrive/shared/gpg-backup}"
  fi
  mkdir -p "${GNUPGHOME}"
  chmod 700 "${GNUPGHOME}" 2>/dev/null || true
}

gpg_backup_normalize_fingerprint() {
  printf '%s' "${1:-}" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]'
}

gpg_backup_resolve_context() {
  local fingerprint_var="$1"
  local recipient_var="$2"
  local passphrase_var="$3"

  gpg_backup_load_shared_env

  local -n fp_ref="${fingerprint_var}"
  local -n rcpt_ref="${recipient_var}"
  local -n pass_ref="${passphrase_var}"

  fp_ref="$(gpg_backup_normalize_fingerprint "${fp_ref:-${SYNQDRIVE_BACKUP_GPG_FINGERPRINT:-}}")"
  rcpt_ref="${rcpt_ref:-${SYNQDRIVE_BACKUP_GPG_RECIPIENT:-}}"
  pass_ref="${pass_ref:-${SYNQDRIVE_BACKUP_GPG_PASSPHRASE_FILE:-}}"
}

gpg_backup_encryption_enabled() {
  local fingerprint="$1"
  local recipient="$2"
  local passphrase_file="$3"
  [[ -n "${fingerprint}" || -n "${recipient}" || -f "${passphrase_file}" ]]
}

gpg_backup_count_public_keys() {
  local ref="$1"
  gpg --list-keys --with-fingerprint "${ref}" 2>/dev/null | grep -c '^      ' || true
}

gpg_backup_verify_recipient_keyring() {
  local fingerprint="$1"
  local recipient="$2"

  if ! command -v gpg >/dev/null 2>&1; then
    gpg_backup_die "gpg binary not found in PATH"
  fi

  gpg_backup_ensure_homedir

  local ref count
  if [[ -n "${fingerprint}" ]]; then
    ref="${fingerprint}"
    count="$(gpg_backup_count_public_keys "${ref}")"
    if [[ "${count}" -ne 1 ]]; then
      gpg_backup_die "expected exactly one public key for fingerprint ${fingerprint}, found ${count}"
    fi
    local actual_fp
    actual_fp="$(gpg --with-colons --list-keys "${fingerprint}" 2>/dev/null | awk -F: '/^fpr:/ {print $10; exit}')"
    actual_fp="$(gpg_backup_normalize_fingerprint "${actual_fp}")"
    if [[ "${actual_fp}" != "${fingerprint}" ]]; then
      gpg_backup_die "fingerprint mismatch — expected ${fingerprint}, keyring has ${actual_fp:-<none>}"
    fi
    return 0
  fi

  if [[ -n "${recipient}" ]]; then
    ref="${recipient}"
    count="$(gpg_backup_count_public_keys "${ref}")"
    if [[ "${count}" -ne 1 ]]; then
      gpg_backup_die "expected exactly one public key for recipient ${recipient}, found ${count}"
    fi
    return 0
  fi

  gpg_backup_die "GPG recipient fingerprint or email required"
}

gpg_backup_encrypt_recipient_ref() {
  local fingerprint="$1"
  local recipient="$2"
  if [[ -n "${fingerprint}" ]]; then
    printf '%s' "${fingerprint}"
  else
    printf '%s' "${recipient}"
  fi
}

gpg_backup_encrypt_file() {
  local plain="$1"
  local encrypted="$2"
  local fingerprint="$3"
  local recipient="$4"
  local passphrase_file="$5"

  [[ -s "${plain}" ]] || gpg_backup_die "plaintext artifact missing or empty: ${plain}"

  if [[ -f "${passphrase_file}" ]]; then
    gpg_backup_ensure_homedir
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "${passphrase_file}" \
      --output "${encrypted}" "${plain}"
    return 0
  fi

  local recipient_ref
  recipient_ref="$(gpg_backup_encrypt_recipient_ref "${fingerprint}" "${recipient}")"
  gpg_backup_verify_recipient_keyring "${fingerprint}" "${recipient}"
  gpg --batch --yes --trust-model always \
    --encrypt --recipient "${recipient_ref}" \
    --output "${encrypted}" "${plain}"
}

gpg_backup_has_secret_key() {
  local fingerprint="$1"
  local recipient="$2"
  local passphrase_file="$3"
  local ref

  if [[ -f "${passphrase_file}" ]]; then
    return 0
  fi

  gpg_backup_ensure_homedir
  ref="$(gpg_backup_encrypt_recipient_ref "${fingerprint}" "${recipient}")"
  [[ -n "${ref}" ]] || return 1
  gpg --list-secret-keys "${ref}" 2>/dev/null | grep -q '^sec'
}

gpg_backup_verify_encrypted_packets() {
  local artifact="$1"
  local fingerprint="$2"
  local recipient="$3"

  [[ -s "${artifact}" ]] || return 1
  gpg_backup_ensure_homedir
  local packet_dump
  packet_dump="$(gpg --batch --list-packets "${artifact}" 2>&1 | tr '[:upper:]' '[:lower:]' || true)"
  if [[ -z "${packet_dump}" ]] || ! grep -qi 'pubkey enc packet' <<< "${packet_dump}"; then
    gpg_backup_log "verify fail: not a valid gpg encrypted artifact"
    return 1
  fi

  if [[ -n "${fingerprint}" || -n "${recipient}" ]]; then
    local ref keyids packet_dump
    ref="$(gpg_backup_encrypt_recipient_ref "${fingerprint}" "${recipient}")"
    keyids="$(gpg --with-colons --list-keys "${ref}" 2>/dev/null | awk -F: '/^(pub|sub):/ {print $5}' | tr '[:upper:]' '[:lower:]')"
    local kid matched=false
    while IFS= read -r kid; do
      [[ -n "${kid}" ]] || continue
      if grep -qi "${kid}" <<< "${packet_dump}"; then
        matched=true
        break
      fi
    done <<< "${keyids}"
    if [[ "${matched}" != "true" ]]; then
      gpg_backup_log "verify fail: encrypted packets do not reference expected recipient keys"
      return 1
    fi
  fi
  return 0
}

gpg_backup_decrypt_file() {
  local artifact="$1"
  local output="$2"
  local fingerprint="$3"
  local recipient="$4"
  local passphrase_file="$5"

  gpg_backup_ensure_homedir
  if [[ -f "${passphrase_file}" ]]; then
    gpg --batch --yes --passphrase-file "${passphrase_file}" \
      --decrypt --output "${output}" "${artifact}"
    return 0
  fi

  if ! gpg_backup_has_secret_key "${fingerprint}" "${recipient}" "${passphrase_file}"; then
    gpg_backup_die "cannot decrypt ${artifact} — no secret key in keyring (use recovery environment)"
  fi

  gpg --batch --yes --decrypt --output "${output}" "${artifact}"
}
