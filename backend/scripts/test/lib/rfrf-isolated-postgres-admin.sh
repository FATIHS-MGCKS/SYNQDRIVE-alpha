#!/usr/bin/env bash
# RFRF isolated PostgreSQL admin helpers — VPS (su postgres) or CI (superuser URL).
set -euo pipefail

rfrf_test_psql_superuser() {
  local sql="$1"
  if [[ -n "${RFRF_CI_POSTGRES_SUPERUSER_URL:-}" ]]; then
    psql "${RFRF_CI_POSTGRES_SUPERUSER_URL}" -v ON_ERROR_STOP=1 -c "${sql}"
  else
    su - postgres -c "psql -v ON_ERROR_STOP=1 -c $(printf '%q' "${sql}")"
  fi
}

rfrf_test_psql_superuser_quiet() {
  local sql="$1"
  if [[ -n "${RFRF_CI_POSTGRES_SUPERUSER_URL:-}" ]]; then
    psql "${RFRF_CI_POSTGRES_SUPERUSER_URL}" -v ON_ERROR_STOP=1 -c "${sql}" >/dev/null 2>&1 || true
  else
    su - postgres -c "psql -v ON_ERROR_STOP=1 -c $(printf '%q' "${sql}")" >/dev/null 2>&1 || true
  fi
}
