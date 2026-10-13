#!/usr/bin/env bash
# EXP021 PR #2001 — read-only production discovery posture audit.
# Loads org/vehicle/NOT_BEFORE from shared backend.env; active pipeline from DB registry.
# Mirrors di-v0-s4b-discovery.service.ts selectCandidates() predicates (read-only).
set -euo pipefail

ENV_PATH="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${DI_V0_S4_NEAR_REALTIME_AUDIT_SQL:-${SCRIPT_DIR}/di-v0-s4-near-realtime-production-readonly-audit.sql}"
DISCOVERY_BATCH_LIMIT="${DI_V0_S4_DISCOVERY_BATCH_LIMIT:-50}"
QUIET_POLICY_SECONDS="${EXP021_AUDIT_QUIET_POLICY_SECONDS:-600}"
QUIET_LEGACY_SECONDS="${EXP021_AUDIT_QUIET_LEGACY_SECONDS:-86400}"

echo "EVIDENCE_SCOPE=PRODUCTION_READONLY_DB"
echo "AUDIT_BACKEND_ENV_PATH=${ENV_PATH}"
echo "DISCOVERY_BATCH_LIMIT=${DISCOVERY_BATCH_LIMIT}"

if [[ ! -r "${ENV_PATH}" ]]; then
  echo "CONFIG_FILE_STATE=UNREADABLE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source <(grep -E '^(DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE|DI_V0_S4_ORGANIZATION_ALLOWLIST|DI_V0_S4_VEHICLE_ALLOWLIST)=' "${ENV_PATH}" | sed 's/^/export /')
set +a

NOT_BEFORE="${DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE:-}"
ORG_ALLOW="${DI_V0_S4_ORGANIZATION_ALLOWLIST:-}"
VEH_ALLOW="${DI_V0_S4_VEHICLE_ALLOWLIST:-}"

if [[ -z "${NOT_BEFORE}" || -z "${ORG_ALLOW}" || -z "${VEH_ALLOW}" ]]; then
  echo "ALLOWLIST_CONFIG_INCOMPLETE=YES"
  exit 1
fi

echo "NOT_BEFORE_VALUE=${NOT_BEFORE}"
echo "ORG_ALLOWLIST=${ORG_ALLOW}"

IFS=',' read -r -a VEHICLES <<< "${VEH_ALLOW// /}"
echo "VEHICLE_ALLOWLIST_COUNT=${#VEHICLES[@]}"

if [[ "${#VEHICLES[@]}" -ne 5 ]]; then
  echo "VEHICLE_ALLOWLIST_EXPECTED_FIVE=FAIL count=${#VEHICLES[@]}"
  exit 1
fi

ORG_CSV="$(echo "${ORG_ALLOW}" | tr -d ' ' | tr ',' '|')"
VEH_CSV="$(echo "${VEH_ALLOW}" | tr -d ' ' | tr ',' '|')"

export PGPASSWORD="${PGPASSWORD:-}"
DB_URL="${DATABASE_URL:-}"
if [[ -z "${DB_URL}" && -r "${ENV_PATH}" ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' "${ENV_PATH}" | tail -1 | cut -d= -f2- || true)"
fi
if [[ -z "${DB_URL}" ]]; then
  echo "DATABASE_URL_MISSING=YES"
  exit 1
fi

# Prisma URLs may include ?schema=… which libpq rejects.
DB_URL_PSQL="${DB_URL//\?schema=public&/?}"
DB_URL_PSQL="${DB_URL_PSQL//\?schema=public/}"
DB_URL_PSQL="${DB_URL_PSQL//&schema=public//}"

psql "${DB_URL_PSQL}" -v ON_ERROR_STOP=1 <<PSQL
\\set not_before '${NOT_BEFORE}'
\\set org_csv '${ORG_CSV}'
\\set vehicle_csv '${VEH_CSV}'
\\set quiet_legacy ${QUIET_LEGACY_SECONDS}
\\set quiet_policy ${QUIET_POLICY_SECONDS}
\\set batch_limit ${DISCOVERY_BATCH_LIMIT}
\\i ${SQL_FILE}
PSQL
