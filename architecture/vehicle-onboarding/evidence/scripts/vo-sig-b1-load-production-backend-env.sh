#!/usr/bin/env bash
# Read-only production DATABASE_URL loader — does not source full backend.env (avoids nounset / unbound vars).
vo_sig_b1_load_production_database_url() {
  local env_path="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
  if [[ ! -r "${env_path}" ]]; then
    echo "BLOCKER: backend env not readable at ${env_path}" >&2
    return 1
  fi
  local line
  line="$(grep -m1 '^DATABASE_URL=' "${env_path}" || true)"
  if [[ -z "${line}" ]]; then
    echo "BLOCKER: DATABASE_URL not found in ${env_path}" >&2
    return 1
  fi
  # Export only DATABASE_URL — never print value.
  export "${line?}"
}
