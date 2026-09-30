#!/usr/bin/env bash
# Read-only Tiny Activation evidence: DIMO_GLOBAL_BUDGET_ENABLED explicit definition only.
# Does not print secrets or unrelated environment variables.
set -euo pipefail

ENV_PATH="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

echo "AUDIT_BACKEND_ENV_PATH=${ENV_PATH}"
if [[ ! -f "${ENV_PATH}" ]]; then
  echo "DIMO_GLOBAL_BUDGET_ENV_EXPLICITLY_DEFINED=NO"
  echo "DIMO_GLOBAL_BUDGET_ENV_NORMALIZED_VALUE=UNKNOWN"
  echo "PROVIDER_GLOBAL_BUDGET_EVIDENCE_SOURCE=backend_env_file_missing"
  exit 0
fi

if grep -q '^DIMO_GLOBAL_BUDGET_ENABLED=' "${ENV_PATH}"; then
  echo "DIMO_GLOBAL_BUDGET_ENV_EXPLICITLY_DEFINED=YES"
  # Classify without echoing the raw value (ops may log locally).
  RAW="$(grep '^DIMO_GLOBAL_BUDGET_ENABLED=' "${ENV_PATH}" | tail -1 | cut -d= -f2-)"
  case "$(echo "${RAW}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')" in
    true | 1 | yes | on) echo "DIMO_GLOBAL_BUDGET_ENV_NORMALIZED_VALUE=ENABLED" ;;
    false | 0 | no | off) echo "DIMO_GLOBAL_BUDGET_ENV_NORMALIZED_VALUE=DISABLED" ;;
    *) echo "DIMO_GLOBAL_BUDGET_ENV_NORMALIZED_VALUE=UNKNOWN" ;;
  esac
  echo "PROVIDER_GLOBAL_BUDGET_EVIDENCE_SOURCE=shared_backend_env_file"
else
  echo "DIMO_GLOBAL_BUDGET_ENV_EXPLICITLY_DEFINED=NO"
  echo "DIMO_GLOBAL_BUDGET_ENV_NORMALIZED_VALUE=UNKNOWN"
  echo "PROVIDER_GLOBAL_BUDGET_EVIDENCE_SOURCE=shared_backend_env_file"
fi

echo "GENERIC_DIMO_CONFIG_DEFAULT_TRUE_IS_NOT_TINY_ACTIVATION_EVIDENCE=YES"
