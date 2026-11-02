#!/usr/bin/env bash
# Loads attestation secrets into the current shell from env and/or owner secrets file.
# Does not print secret values.
set -euo pipefail

secrets_file="${SYNQDRIVE_ONEAUTO_ATTESTATION_SECRETS_FILE:-${HOME}/.config/synqdrive/oneauto-attestation.env}"

if [[ -f "${secrets_file}" ]]; then
  perms="$(stat -c '%a' "${secrets_file}" 2>/dev/null || echo '')"
  if [[ "${perms}" != "600" && -n "${perms}" ]]; then
    echo "WARN: secrets file mode is ${perms}, expected 600" >&2
  fi
  set -a
  # shellcheck disable=SC1090
  source "${secrets_file}"
  set +a
fi

bash "$(dirname "$0")/oneauto-p25e-attestation-secrets-status.sh"
