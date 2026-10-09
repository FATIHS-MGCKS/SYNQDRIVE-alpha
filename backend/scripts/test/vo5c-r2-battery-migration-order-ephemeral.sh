#!/usr/bin/env bash
# VO5C R2 — reproduce production-like _prisma_migrations gap (APDS 15:00 applied, Battery R2 pending).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BATTERY_MIG_1="20261008120000_battery_hv_h4_a3_integrity_attestation_r2"
BATTERY_MIG_2="20261008143000_battery_hv_h4_a3_integrity_attestation_r2_h1_lock_authority"
APD_LATE="20261008150000_apd_shadow_epoch_activated_at_timestamptz"
TEMP_DB="vo5c_r2_batt_mig_${RANDOM}_$(date +%s)"
RESULT_FILE="${VO5C_R2_MIGRATION_RESULT_FILE:-/tmp/vo5c-r2-migration-order-result.env}"

log() { printf '[vo5c-r2-battery-migration-order-ephemeral] %s\n' "$*"; }

parse_database_url() {
  P25_HOST="${DATABASE_URL_HOST:-127.0.0.1}"
  P25_PORT="${DATABASE_URL_PORT:-5432}"
  P25_USER="${DATABASE_URL_USER:-synqdrive}"
  P25_PASSWORD="${DATABASE_URL_PASSWORD:-synqdrive}"
  if [[ -n "${DATABASE_URL:-}" ]]; then
    local base="${DATABASE_URL%%\?*}"
    local rest="${base#postgresql://}"
    local userpass="${rest%%@*}"
    local hostdb="${rest#*@}"
    local hostport="${hostdb%%/*}"
    P25_USER="${userpass%%:*}"
    P25_PASSWORD="${userpass#*:}"
    P25_HOST="${hostport%%:*}"
    P25_PORT="${hostport#*:}"
  fi
}

parse_database_url
export PGPASSWORD="${P25_PASSWORD}"
ADMIN_URL="postgresql://${P25_USER}:${P25_PASSWORD}@${P25_HOST}:${P25_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${P25_USER}:${P25_PASSWORD}@${P25_HOST}:${P25_PORT}/${TEMP_DB}?schema=public"
PSQL_URL="postgresql://${P25_USER}:${P25_PASSWORD}@${P25_HOST}:${P25_PORT}/${TEMP_DB}"

psql_atc() {
  psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -tAc "$1"
}

cleanup_ephemeral_db() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMP_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
}

trap cleanup_ephemeral_db EXIT

PRISMA_VERSION="$(node -e "console.log(require('./package.json').devDependencies.prisma.replace(/[^0-9.]/g,''))")"
log "prisma_version=${PRISMA_VERSION}"

log "Creating ephemeral database ${TEMP_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";"

log "Full prisma migrate deploy (baseline all migrations)"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

for name in "$BATTERY_MIG_1" "$BATTERY_MIG_2"; do
  applied="$(psql_atc "SELECT COUNT(*)::text FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NOT NULL;")"
  applied="$(echo "$applied" | tr -d '[:space:]')"
  if [[ "$applied" != "1" ]]; then
    echo "Expected ${name} applied after baseline, got ${applied}" >&2
    exit 1
  fi
done

log "Simulating production gap: remove Battery R2 rows while keeping ${APD_LATE}"
psql "${PSQL_URL}" -v ON_ERROR_STOP=1 <<SQL
DELETE FROM _prisma_migrations
WHERE migration_name IN ('${BATTERY_MIG_1}', '${BATTERY_MIG_2}');
SQL

apd_applied="$(psql_atc "SELECT COUNT(*)::text FROM _prisma_migrations WHERE migration_name='${APD_LATE}' AND finished_at IS NOT NULL;")"
apd_applied="$(echo "$apd_applied" | tr -d '[:space:]')"
if [[ "$apd_applied" != "1" ]]; then
  echo "Fixture fidelity failed: ${APD_LATE} not applied (got ${apd_applied})" >&2
  exit 1
fi

log "Second prisma migrate deploy (production-forward path)"
set +e
DEPLOY_OUTPUT="$(DATABASE_URL="${MIGRATION_DATABASE_URL}" npx prisma migrate deploy 2>&1)"
DEPLOY_RC=$?
set -e

PRISMA_ERROR_CODE="$(printf '%s' "$DEPLOY_OUTPUT" | grep -oE 'P[0-9]{4}' | head -1 || true)"
BATT1_RESULT="unknown"
BATT2_RESULT="unknown"

if [[ "$DEPLOY_RC" -eq 0 ]]; then
  BATT1_RESULT="$(psql_atc "SELECT CASE WHEN finished_at IS NOT NULL THEN 'applied' ELSE 'pending' END FROM _prisma_migrations WHERE migration_name='${BATTERY_MIG_1}';")"
  BATT2_RESULT="$(psql_atc "SELECT CASE WHEN finished_at IS NOT NULL THEN 'applied' ELSE 'pending' END FROM _prisma_migrations WHERE migration_name='${BATTERY_MIG_2}';")"
  OUT_OF_ORDER_REPRODUCED="NO"
  ACTUAL_PRISMA_ERROR_CODE="none"
else
  OUT_OF_ORDER_REPRODUCED="YES"
  ACTUAL_PRISMA_ERROR_CODE="${PRISMA_ERROR_CODE:-DEPLOY_RC_${DEPLOY_RC}}"
  BATT1_RESULT="$(psql_atc "SELECT COALESCE((SELECT CASE WHEN finished_at IS NOT NULL THEN 'applied' ELSE 'pending' END FROM _prisma_migrations WHERE migration_name='${BATTERY_MIG_1}'),'absent');")"
  BATT2_RESULT="$(psql_atc "SELECT COALESCE((SELECT CASE WHEN finished_at IS NOT NULL THEN 'applied' ELSE 'pending' END FROM _prisma_migrations WHERE migration_name='${BATTERY_MIG_2}'),'absent');")"
fi

log "deploy_rc=${DEPLOY_RC} prisma_error=${ACTUAL_PRISMA_ERROR_CODE}"
log "battery_mig_1=${BATT1_RESULT} battery_mig_2=${BATT2_RESULT}"
printf '%s\n' "$DEPLOY_OUTPUT" | tail -30

PRIV_CHECK="$(psql_atc "
  SELECT COUNT(*)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'm3_3_hv_h4_a3_invalidate_attestations_for_revision_v1',
      'm3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1'
    );
")"
PRIV_CHECK="$(echo "$PRIV_CHECK" | tr -d '[:space:]')"

cat >"$RESULT_FILE" <<EOF
PRISMA_VERSION=${PRISMA_VERSION}
MIGRATION_FIXTURE_FIDELITY=YES
OUT_OF_ORDER_REPRODUCED=${OUT_OF_ORDER_REPRODUCED}
ACTUAL_PRISMA_ERROR_CODE=${ACTUAL_PRISMA_ERROR_CODE}
BATTERY_MIGRATION_1_FIXTURE_RESULT=${BATT1_RESULT}
BATTERY_MIGRATION_2_FIXTURE_RESULT=${BATT2_RESULT}
SECURITY_DEFINER_PRIVILEGES=function_count_${PRIV_CHECK}
DEPLOY_RC=${DEPLOY_RC}
EOF

log "Wrote ${RESULT_FILE}"

if [[ "$DEPLOY_RC" -ne 0 ]]; then
  log "Observed deploy failure (documented — no migration surgery in R2)"
  exit 0
fi

log "Observed deploy success for pending Battery migrations after APD 15:00 gap simulation"
exit 0
