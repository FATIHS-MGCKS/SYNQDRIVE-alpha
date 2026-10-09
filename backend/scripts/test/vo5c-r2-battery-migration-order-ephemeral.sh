#!/usr/bin/env bash
# VO5C R2-H1 — production-faithful disposable fixture (Battery R2 pending, APDS 15:00 applied).
set -euo pipefail

export VO5C_EPHEMERAL_MIGRATION_TEST=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/vo5c-ephemeral-postgres-guard.sh
source "${ROOT}/scripts/test/lib/vo5c-ephemeral-postgres-guard.sh"

BATTERY_MIG_1="20261008120000_battery_hv_h4_a3_integrity_attestation_r2"
BATTERY_MIG_2="20261008143000_battery_hv_h4_a3_integrity_attestation_r2_h1_lock_authority"
LOCK_FN="m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1"
APD_LATE="20261008150000_apd_shadow_epoch_activated_at_timestamptz"
TEMP_DB="vo5c_r2_batt_mig_${RANDOM}_$(date +%s)"
RESULT_FILE="${VO5C_R2_MIGRATION_RESULT_FILE:-/tmp/vo5c-r2-migration-order-result.env}"

log() { printf '[vo5c-r2-battery-migration-order-ephemeral] %s\n' "$*"; }

P25_HOST="127.0.0.1"
P25_PORT="5432"
P25_USER="synqdrive"
P25_PASSWORD="synqdrive"

export PGPASSWORD="${P25_PASSWORD}"
ADMIN_URL="postgresql://${P25_USER}:${P25_PASSWORD}@${P25_HOST}:${P25_PORT}/postgres"
MIGRATION_DATABASE_URL="postgresql://${P25_USER}:${P25_PASSWORD}@${P25_HOST}:${P25_PORT}/${TEMP_DB}?schema=public"
PSQL_URL="postgresql://${P25_USER}:${P25_PASSWORD}@${P25_HOST}:${P25_PORT}/${TEMP_DB}"

vo5c_ephemeral_assert_isolated_target "$MIGRATION_DATABASE_URL" "$TEMP_DB"

psql_atc() {
  psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -tAc "$1"
}

cleanup_ephemeral_db() {
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMP_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" >/dev/null 2>&1 || true
  rm -rf "${FIXTURE_PRISMA_DIR:-}" "${FULL_SCHEMA_LINK:-}"
}

trap cleanup_ephemeral_db EXIT

PRISMA_VERSION="$(node -e "console.log(require('./package.json').devDependencies.prisma.replace(/[^0-9.]/g,''))")"
PRISMA_BIN="${ROOT}/node_modules/prisma/build/index.js"
if [[ ! -f "$PRISMA_BIN" ]]; then
  npx prisma version >/dev/null
fi
log "prisma_version=${PRISMA_VERSION}"

log "Creating ephemeral database ${TEMP_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEMP_DB}\";"

FIXTURE_PRISMA_DIR="$(mktemp -d)"
mkdir -p "${FIXTURE_PRISMA_DIR}/migrations"
cp "${ROOT}/prisma/schema.prisma" "${FIXTURE_PRISMA_DIR}/schema.prisma"
while IFS= read -r -d '' dir; do
  base="$(basename "$dir")"
  if [[ "$base" == "$BATTERY_MIG_1" || "$base" == "$BATTERY_MIG_2" ]]; then
    continue
  fi
  cp -a "$dir" "${FIXTURE_PRISMA_DIR}/migrations/"
done < <(find "${ROOT}/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -print0)

log "Baseline migrate deploy (migration tree WITHOUT Battery R2 folders)"
export PRISMA_SCHEMA_PATH="${FIXTURE_PRISMA_DIR}/schema.prisma"
DATABASE_URL="${MIGRATION_DATABASE_URL}" \
  PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh
unset PRISMA_SCHEMA_PATH

for name in "$BATTERY_MIG_1" "$BATTERY_MIG_2"; do
  pending_count="$(psql_atc "SELECT COUNT(*)::text FROM _prisma_migrations WHERE migration_name='${name}';")"
  pending_count="$(echo "$pending_count" | tr -d '[:space:]')"
  if [[ "$pending_count" != "0" ]]; then
    echo "Expected ${name} absent from ledger after baseline, got count=${pending_count}" >&2
    exit 1
  fi
done

apd_applied="$(psql_atc "SELECT COUNT(*)::text FROM _prisma_migrations WHERE migration_name='${APD_LATE}' AND finished_at IS NOT NULL;")"
apd_applied="$(echo "$apd_applied" | tr -d '[:space:]')"
if [[ "$apd_applied" != "1" ]]; then
  echo "Fixture fidelity failed: ${APD_LATE} not applied (got ${apd_applied})" >&2
  exit 1
fi

lock_fn_before="$(psql_atc "SELECT COUNT(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${LOCK_FN}';")"
lock_fn_before="$(echo "$lock_fn_before" | tr -d '[:space:]')"
if [[ "$lock_fn_before" != "0" ]]; then
  echo "Expected lock function absent before Battery R2, got ${lock_fn_before}" >&2
  exit 1
fi

log "Forward migrate deploy (full repository migration source)"
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
  ACTUAL_PRISMA_ERROR_CODE="none"
else
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
      '${LOCK_FN}'
    );
")"
PRIV_CHECK="$(echo "$PRIV_CHECK" | tr -d '[:space:]')"

for name in "$BATTERY_MIG_1" "$BATTERY_MIG_2"; do
  finished="$(psql_atc "SELECT COUNT(*)::text FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NOT NULL;")"
  finished="$(echo "$finished" | tr -d '[:space:]')"
  if [[ "$finished" != "1" ]]; then
    echo "Expected finished migration row for ${name}, got ${finished}" >&2
    exit 1
  fi
done

cat >"$RESULT_FILE" <<EOF
PRISMA_VERSION=${PRISMA_VERSION}
MIGRATION_FIXTURE_SEMANTIC_FIDELITY=YES
APDS_LATER_MIGRATION_APPLIED=YES
BATTERY_PENDING_EFFECTS_ABSENT_BEFORE_TEST=YES
ACTUAL_PRISMA_ERROR_CODE=${ACTUAL_PRISMA_ERROR_CODE}
BATTERY_MIGRATION_1_FIXTURE_RESULT=${BATT1_RESULT}
BATTERY_MIGRATION_2_FIXTURE_RESULT=${BATT2_RESULT}
SECURITY_DEFINER_PRIVILEGES=function_count_${PRIV_CHECK}
DEPLOY_RC=${DEPLOY_RC}
MIGRATION_ISOLATION_GUARD=YES
EOF

log "Wrote ${RESULT_FILE}"

if [[ "$DEPLOY_RC" -ne 0 ]]; then
  log "Forward deploy failed — preserving exact error output above"
  exit 1
fi

if [[ "$BATT1_RESULT" != *applied* || "$BATT2_RESULT" != *applied* ]]; then
  echo "Battery migrations not fully applied" >&2
  exit 1
fi

log "Production-faithful fixture PASS"
exit 0
