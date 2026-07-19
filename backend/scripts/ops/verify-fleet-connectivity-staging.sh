#!/usr/bin/env bash
# Read-only Fleet Connectivity staging verification orchestrator (VPS).
#
# Usage (on VPS after RC deploy):
#   bash /opt/synqdrive/current/backend/scripts/ops/verify-fleet-connectivity-staging.sh
#
# Artifacts: /opt/synqdrive/shared/staging-verification/fleet-connectivity-2026-07-<ts>/
set -euo pipefail

ROOT="/opt/synqdrive/current"
BACKEND="${ROOT}/backend"
TS="$(date -u +%Y%m%d%H%M%S)"
OUT="/opt/synqdrive/shared/staging-verification/fleet-connectivity-2026-07-${TS}"
mkdir -p "$OUT"

log() { echo "[verify] $*" | tee -a "${OUT}/verify.log"; }
fail() { log "FAIL: $*"; exit 1; }

export FLEET_CONNECTIVITY_AUDIT_ALLOW_REMOTE=1
export FLEET_CONNECTIVITY_AUDIT_ALLOW_PROD=1
export NODE_ENV=production

cd "$BACKEND"

GIT_SHA="$(git rev-parse HEAD)"
GIT_SHORT="$(git rev-parse --short HEAD)"
log "git=${GIT_SHORT} out=${OUT}"

log "==> Kill switch env"
grep -E '^CONNECTIVITY_(EPISODE_RECOVERY|RECONCILIATION_APPLY)_ENABLED=' .env \
  | tee "${OUT}/kill-switch.env" || true
if grep -q '^CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=1' .env 2>/dev/null \
  || grep -q '^CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=true' .env 2>/dev/null; then
  fail "CONNECTIVITY_RECONCILIATION_APPLY_ENABLED must remain off for staging validation"
fi

log "==> Health"
curl -sf http://127.0.0.1:3001/api/v1/health | tee "${OUT}/health.json"

log "==> Prisma migrate status"
npx prisma migrate status 2>&1 | tee "${OUT}/prisma-migrate-status.txt"

PENDING="$(npx prisma migrate status 2>&1 | grep -c 'not yet been applied' || true)"
if [[ "$PENDING" -gt 0 ]]; then
  fail "Pending Prisma migrations detected"
fi

log "==> Connectivity schema tables"
sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -c "
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND (
    tablename LIKE 'device_connection%'
    OR tablename = 'dimo_device_connection_events'
  )
ORDER BY 1;
" | tee "${OUT}/connectivity-tables.txt"

for tbl in device_connection_episodes device_connection_webhook_inbox device_connection_episode_resolution_outbox; do
  if ! sudo -u postgres psql -d synqdrive -tAc "SELECT to_regclass('public.${tbl}')" | grep -q "${tbl}"; then
    fail "Missing table ${tbl}"
  fi
done

log "==> Webhook inbox / outbox row counts (read-only)"
sudo -u postgres psql -d synqdrive -c "
SELECT 'webhook_inbox' AS src, processing_status::text AS status, count(*) AS n
FROM device_connection_webhook_inbox GROUP BY 1,2
UNION ALL
SELECT 'resolution_outbox', status::text, count(*)
FROM device_connection_episode_resolution_outbox GROUP BY 1,2
ORDER BY 1,2;
" | tee "${OUT}/inbox-outbox-counts.txt"

log "==> Metrics scrape (localhost)"
METRICS_CODE="$(curl -s -o "${OUT}/metrics.txt" -w '%{http_code}' http://127.0.0.1:3001/api/v1/metrics || true)"
echo "metrics_http=${METRICS_CODE}" | tee "${OUT}/metrics-meta.txt"
if [[ "$METRICS_CODE" == "200" ]]; then
  grep -E 'synqdrive_connectivity_' "${OUT}/metrics.txt" | head -40 | tee "${OUT}/connectivity-metrics-sample.txt" || true
fi

log "==> Episode reconciliation audit (read-only, fleet-wide)"
npx ts-node -r tsconfig-paths/register scripts/ops/audit-device-connection-episode-reconciliation.ts \
  --format=json > "${OUT}/episode-reconciliation-audit.json" 2>&1
tail -5 "${OUT}/episode-reconciliation-audit.json" | tee -a "${OUT}/verify.log"

log "==> Production readiness audit phase 2 (fleet stats)"
cd "$ROOT"
npx ts-node --project backend/tsconfig.json -r tsconfig-paths/register \
  scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=2 \
  > "${OUT}/audit-phase-2.json" 2>&1

log "==> Production readiness audit phase 3 (INCIDENT_VEHICLE_001 fixture replay)"
npx ts-node --project backend/tsconfig.json -r tsconfig-paths/register \
  scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=3 --replay \
  > "${OUT}/audit-phase-3-replay.json" 2>&1

log "==> Production readiness audit phase 4 (integrity / coverage / provider link)"
npx ts-node --project backend/tsconfig.json -r tsconfig-paths/register \
  scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=4 --days=60 \
  > "${OUT}/audit-phase-4.json" 2>&1

log "==> Reconciliation dry-run with evidence packages (no --apply)"
cd "$BACKEND"
PRIMARY_ORG="$(sudo -u postgres psql -d synqdrive -tAc "
  SELECT organization_id FROM vehicles
  WHERE dimo_vehicle_id IS NOT NULL
  GROUP BY organization_id
  ORDER BY count(*) DESC
  LIMIT 1;
" | tr -d '[:space:]')"
if [[ -z "$PRIMARY_ORG" ]]; then
  PRIMARY_ORG="$(sudo -u postgres psql -d synqdrive -tAc "SELECT id FROM organizations ORDER BY created_at LIMIT 1;" | tr -d '[:space:]')"
fi
echo "primary_org_set=yes" > "${OUT}/dry-run-meta.txt"

AUDIT_JSON="${OUT}/episode-reconciliation-audit.json"
AUDIT_HASH="$(node -e "
const fs=require('fs');const crypto=require('crypto');
const p=process.argv[1];
const raw=fs.readFileSync(p,'utf8');
const start=raw.indexOf('{');
const json=raw.slice(start);
console.log(crypto.createHash('sha256').update(json).digest('hex'));
" "$AUDIT_JSON")"

npx ts-node -r tsconfig-paths/register scripts/ops/apply-device-connection-episode-reconciliation.ts \
  --organization-id="$PRIMARY_ORG" \
  --audit-report-hash="$AUDIT_HASH" \
  --expected-git-commit="$GIT_SHA" \
  --operator="staging-verify-agent" \
  --reason="Prompt 9 staging dry-run — no apply" \
  --batch-size=25 \
  --output="${OUT}/reconciliation-dry-run.json" \
  2>&1 | tee "${OUT}/reconciliation-dry-run.log"

if grep -q '"apply":true' "${OUT}/reconciliation-dry-run.json" 2>/dev/null; then
  fail "Dry-run report indicates apply=true — aborting"
fi

log "==> Jest: incident replay + negative paths + kill switch"
npm test -- --testPathPattern='device-connection-episode-resolution\.service\.spec|device-connection-webhook-processing\.service\.spec|device-connection-episode-resolution-outbox-processor\.service\.spec|connectivity-recovery\.policy\.spec|device-connection-episode-reconciliation-evidence-package\.spec' \
  --passWithNoTests 2>&1 | tee "${OUT}/jest-connectivity.txt"

if grep -E 'Tests:.*[1-9][0-9]* failed' "${OUT}/jest-connectivity.txt"; then
  fail "Jest connectivity suite had failures"
fi

log "==> Summary"
{
  echo "timestamp=${TS}"
  echo "git=${GIT_SHA}"
  echo "artifacts=${OUT}"
  echo "reconciliation_apply_enabled=false"
  echo "migrate_pending=0"
} | tee "${OUT}/summary.txt"

log "DONE — artifacts in ${OUT}"
