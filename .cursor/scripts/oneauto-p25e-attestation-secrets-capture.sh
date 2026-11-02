#!/usr/bin/env bash
# Interactive masked capture for owner-operated shells with a TTY only.
# Never logs values. Writes outside the repository (mode 600). Not for Cloud Agent chat paste.
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo "ERROR: No TTY — use Cursor Cloud Agents Dashboard → Secrets (Runtime Secret), not this script." >&2
  echo "See architecture/oneauto-provider/evidence/P25E_C3_PRODUCTION_ONE_SHOT_RUNBOOK.de.md" >&2
  exit 1
fi

config_dir="${HOME}/.config/synqdrive"
secrets_file="${SYNQDRIVE_ONEAUTO_ATTESTATION_SECRETS_FILE:-${config_dir}/oneauto-attestation.env}"
umask 077
mkdir -p "${config_dir}"
chmod 700 "${config_dir}"

tmp="$(mktemp "${config_dir}/.oneauto-attestation.XXXXXX")"
chmod 600 "${tmp}"
trap 'rm -f "${tmp}"' EXIT

read -rs -p "One Auto production API key: " api_key
echo
read -rs -p "Authorized production VIN (17 chars): " vin
echo

if [[ -z "${api_key}" || -z "${vin}" ]]; then
  echo "ERROR: Empty key or VIN — nothing written." >&2
  exit 1
fi

printf '%s\n' \
  "ONEAUTO_PRODUCTION_ATTESTATION_API_KEY=${api_key}" \
  "ONEAUTO_PRODUCTION_ATTESTATION_VIN=${vin}" >"${tmp}"
mv -f "${tmp}" "${secrets_file}"
chmod 600 "${secrets_file}"
trap - EXIT

echo "OK: secrets file written (values not shown): ${secrets_file}"
echo "Next: export owner flags (non-secret) or use oneauto-p25e-attestation-secrets-load.sh"
