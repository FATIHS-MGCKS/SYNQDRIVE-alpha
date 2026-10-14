#!/usr/bin/env bash
# VO-SIG B1 — read-only production preflight (no backup, no SQL repair).
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vo-sig-b1-load-production-backend-env.sh
source "${SCRIPT_DIR}/vo-sig-b1-load-production-backend-env.sh"

APPROVED_SQL_SHA256="aa09f9063d5780d6d96f4063dd753da544daae51c85efdab97d388c1fd49735c"
APPROVED_MANIFEST="f9f2a17be4c361be04dc88afd4e12bb3034a4b64e84a504641a999a06cddef73"
APPROVED_PROD_SHA="b3107b44831cf10add09c067b2ae738f35a1fde1"
ORG_ID="faa710c9-6d91-4079-a7d5-91fdccdec14a"
LINK_IDS=(
  "6fcca9d4-99d5-4be8-8985-e9369c53b7f6"
  "9ff5e350-cd4b-4e3a-956a-4f1770b017f2"
  "805b271c-ba87-4776-9e39-23e24d595c53"
  "71b75519-3053-4836-8bcd-554680d592b2"
)

APPROVED_SQL_PATH="${VO_SIG_B1_APPROVED_SQL_PATH:-/tmp/VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V3.approved.sql}"
RELEASE_DIR="$(readlink -f /opt/synqdrive/current)"
BACKEND="${RELEASE_DIR}/backend"
LOG="${VO_SIG_B1_PREFLIGHT_LOG:-/tmp/vo-sig-b1-preflight.log}"

fail() { echo "BLOCKER: $*"; exit 1; }

exec > >(tee -a "$LOG") 2>&1
echo "=== VO-SIG B1 read-only preflight $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

vo_sig_b1_load_production_database_url || exit 1
DBURL="${DATABASE_URL%%\?*}"

ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD)"
echo "PRODUCTION_SHA=$ACTUAL_SHA"
[[ "$ACTUAL_SHA" == "$APPROVED_PROD_SHA" ]] || fail "production SHA mismatch"

REPLICA_A="$(sudo pm2 jlist | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const p=j.find(x=>x.name==='synqdrive');process.stdout.write(p?.pm2_env?.status||'missing')")"
REPLICA_B="$(sudo pm2 jlist | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const p=j.find(x=>x.name==='synqdrive-b');process.stdout.write(p?.pm2_env?.status||'missing')")"
echo "REPLICA_A=$REPLICA_A REPLICA_B=$REPLICA_B"
[[ "$REPLICA_A" == "online" && "$REPLICA_B" == "online" ]] || fail "replicas not healthy"
curl -sf https://app.synqdrive.eu/api/v1/health >/dev/null || fail "health check failed"

[[ -f "$APPROVED_SQL_PATH" ]] || fail "approved SQL missing at $APPROVED_SQL_PATH"
SQL_SHA="$(sha256sum "$APPROVED_SQL_PATH" | awk '{print $1}')"
echo "SQL_V3_SHA256=$SQL_SHA"
[[ "$SQL_SHA" == "$APPROVED_SQL_SHA256" ]] || fail "SQL sha256 mismatch"

PGCRYPTO="$(psql "$DBURL" -t -A -c "SELECT extname FROM pg_extension WHERE extname='pgcrypto';")"
[[ "$PGCRYPTO" == "pgcrypto" ]] || fail "pgcrypto extension missing"

LINK_IN="$(printf "'%s'," "${LINK_IDS[@]}")"
LINK_IN="${LINK_IN%,}"

psql "$DBURL" -v ON_ERROR_STOP=1 -c "
SELECT registry_lifecycle, count(*) AS n
FROM vehicles WHERE organization_id='${ORG_ID}'
GROUP BY 1 ORDER BY 1;"

echo "INFO org_fleet_counts above (informational only — not gates)"

TARGET_L="$(psql "$DBURL" -t -A -c "SELECT count(*) FROM vehicle_data_source_links WHERE id IN (${LINK_IN}) AND is_active=true;")"
TARGET_V_ACTIVE="$(psql "$DBURL" -t -A -c "
  SELECT count(*) FROM vehicle_data_source_links l
  JOIN vehicles v ON v.id = l.vehicle_id
  WHERE l.id IN (${LINK_IN}) AND l.is_active = true
    AND v.registry_lifecycle = 'ACTIVE'::\"VehicleRegistryLifecycle\"
    AND v.organization_id = '${ORG_ID}';")"
CONSENT_OK="$(psql "$DBURL" -t -A -c "
  SELECT count(*) FROM vehicle_data_source_links l
  JOIN vehicles v ON v.id = l.vehicle_id
  JOIN vehicle_provider_consents vpc ON vpc.id = l.consent_id
  WHERE l.id IN (${LINK_IN})
    AND l.is_active = true
    AND v.registry_lifecycle = 'ACTIVE'::\"VehicleRegistryLifecycle\"
    AND v.organization_id = '${ORG_ID}'
    AND vpc.organization_id = '${ORG_ID}'
    AND vpc.vehicle_id = v.id
    AND vpc.status = 'ACTIVE'::\"VehicleProviderConsentStatus\"
    AND vpc.revoked_at IS NULL
    AND (vpc.expires_at IS NULL OR vpc.expires_at > NOW());")"
AUDITS="$(psql "$DBURL" -t -A -c "SELECT count(*) FROM vehicle_connection_identity_reconciliation_audits WHERE source_link_id IN (${LINK_IN});")"
CI_V2="$(psql "$DBURL" -t -A -c "SELECT count(*) FROM vehicle_data_source_links WHERE id IN (${LINK_IN}) AND metadata ? 'connectionIdentity';")"

echo "target_links_active=$TARGET_L target_vehicles_active=$TARGET_V_ACTIVE consents_valid=$CONSENT_OK audits=$AUDITS ci=$CI_V2"
[[ "$TARGET_L" == "4" ]] || fail "expected 4 active target links"
[[ "$TARGET_V_ACTIVE" == "4" ]] || fail "expected 4 ACTIVE target vehicles"
[[ "$CONSENT_OK" == "4" ]] || fail "expected 4 valid DIMO consents"
[[ "$AUDITS" == "0" ]] || fail "existing B1 audits"
[[ "$CI_V2" == "0" ]] || fail "existing connectionIdentity"

cd "$BACKEND"
export VO_SIG_B1_ORGANIZATION_ID="$ORG_ID"
export VO_SIG_B1_LINK_IDS="$(IFS=,; echo "${LINK_IDS[*]}")"
npx ts-node -r tsconfig-paths/register scripts/ops/vo-sig-01-legacy-connection-identity-reconcile-dry-run.ts > /tmp/vo-sig-b1-dry-run-live.json
MANIFEST_FP="$(node -e "const m=require('/tmp/vo-sig-b1-dry-run-live.json');console.log(m.manifestFingerprint)")"
ELIGIBLE="$(node -e "const m=require('/tmp/vo-sig-b1-dry-run-live.json');console.log(m.rows.filter(r=>r.eligibility==='ELIGIBLE').length)")"
BLOCKED="$(node -e "const m=require('/tmp/vo-sig-b1-dry-run-live.json');console.log(m.rows.filter(r=>r.eligibility!=='ELIGIBLE').length)")"
echo "MANIFEST_FP=$MANIFEST_FP eligible=$ELIGIBLE blocked=$BLOCKED"
[[ "$MANIFEST_FP" == "$APPROVED_MANIFEST" ]] || fail "manifest fingerprint drift"
[[ "$ELIGIBLE" == "4" && "$BLOCKED" == "0" ]] || fail "planner eligibility failed"

bash "${SCRIPT_DIR}/vo-sig-b1-prod-readonly-parity.sh" "$APPROVED_SQL_PATH" /tmp/vo-sig-b1-dry-run-live.json "$BACKEND"

BACKUP_SCRIPT="${BACKEND}/scripts/ops/vps-backup-postgresql.sh"
[[ -x "$BACKUP_SCRIPT" ]] || fail "canonical backup script missing"
sudo bash "$BACKUP_SCRIPT" --dry-run >/tmp/vo-sig-b1-backup-dry-run.log 2>&1 || fail "backup dry-run failed"
grep -q 'DRY RUN — config OK' /tmp/vo-sig-b1-backup-dry-run.log || fail "backup config not OK"

echo "PREFLIGHT_OK"
echo "BACKUP_PROCEDURE_READY=YES (vps-backup-postgresql.sh --dry-run passed)"
