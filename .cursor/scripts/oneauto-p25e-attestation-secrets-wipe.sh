#!/usr/bin/env bash
# Removes local attestation secrets file and unsets variables in this shell.
set -euo pipefail

secrets_file="${SYNQDRIVE_ONEAUTO_ATTESTATION_SECRETS_FILE:-${HOME}/.config/synqdrive/oneauto-attestation.env}"

vars=(
  ONEAUTO_PRODUCTION_ATTESTATION_API_KEY
  ONEAUTO_PRODUCTION_ATTESTATION_VIN
  ONEAUTO_PRODUCTION_ATTESTATION_OWNER_AUTHORIZED
  ONEAUTO_PRODUCTION_ATTESTATION_VIN_USE_AUTHORIZED
  ONEAUTO_PRODUCTION_ATTESTATION_BILLING_ACK
  ONEAUTO_PRODUCTION_ATTESTATION_ONE_GET_CONFIRMED
)

for name in "${vars[@]}"; do
  unset "${name}" 2>/dev/null || true
done

if [[ -f "${secrets_file}" ]]; then
  rm -f "${secrets_file}"
  echo "Removed ${secrets_file}"
else
  echo "No secrets file at ${secrets_file}"
fi

echo "Unset attestation env vars in this shell."
