#!/usr/bin/env bash
# Reports which One Auto production attestation env vars are set — never prints values.
set -euo pipefail

vars=(
  ONEAUTO_PRODUCTION_ATTESTATION_API_KEY
  ONEAUTO_PRODUCTION_ATTESTATION_VIN
  ONEAUTO_PRODUCTION_ATTESTATION_OWNER_AUTHORIZED
  ONEAUTO_PRODUCTION_ATTESTATION_VIN_USE_AUTHORIZED
  ONEAUTO_PRODUCTION_ATTESTATION_BILLING_ACK
  ONEAUTO_PRODUCTION_ATTESTATION_ONE_GET_CONFIRMED
)

for name in "${vars[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    echo "${name}=SET"
  else
    echo "${name}=MISSING"
  fi
done

secrets_file="${SYNQDRIVE_ONEAUTO_ATTESTATION_SECRETS_FILE:-${HOME}/.config/synqdrive/oneauto-attestation.env}"
if [[ -f "${secrets_file}" ]]; then
  perms="$(stat -c '%a' "${secrets_file}" 2>/dev/null || stat -f '%OLp' "${secrets_file}" 2>/dev/null || echo '?')"
  echo "SYNQDRIVE_ONEAUTO_ATTESTATION_SECRETS_FILE=SET path=${secrets_file} mode=${perms}"
else
  echo "SYNQDRIVE_ONEAUTO_ATTESTATION_SECRETS_FILE=MISSING"
fi
