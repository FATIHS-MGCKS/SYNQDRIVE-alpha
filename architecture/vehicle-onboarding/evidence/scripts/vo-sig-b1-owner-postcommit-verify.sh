#!/usr/bin/env bash
# VO-SIG B1 — read-only post-commit verification (Phase 5).
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vo-sig-b1-load-production-backend-env.sh
source "${SCRIPT_DIR}/vo-sig-b1-load-production-backend-env.sh"

RUN_ID="${1:-}"
[[ -n "$RUN_ID" ]] || { echo "usage: vo-sig-b1-owner-postcommit-verify.sh <run_id>" >&2; exit 1; }

vo_sig_b1_load_production_database_url || exit 1
DBURL="${DATABASE_URL%%\?*}"

LINK_IDS=(
  "6fcca9d4-99d5-4be8-8985-e9369c53b7f6"
  "9ff5e350-cd4b-4e3a-956a-4f1770b017f2"
  "805b271c-ba87-4776-9e39-23e24d595c53"
  "71b75519-3053-4836-8bcd-554680d592b2"
)
LINK_IN="$(printf "'%s'," "${LINK_IDS[@]}")"
LINK_IN="${LINK_IN%,}"

echo "POSTCOMMIT_RUN_ID=$RUN_ID"

psql "$DBURL" -v ON_ERROR_STOP=1 <<SQL
SELECT 'ci_v2_count=' || count(*)::text
FROM vehicle_data_source_links
WHERE id IN (${LINK_IN})
  AND metadata->'connectionIdentity'->>'version' = 'vo-source-link-connection-identity-v2';

SELECT 'applied_audits=' || count(*)::text
FROM vehicle_connection_identity_reconciliation_audits
WHERE source_link_id IN (${LINK_IN}) AND outcome = 'APPLIED';

SELECT 'applied_run_id=' || count(*)::text
FROM vehicle_connection_identity_reconciliation_audits
WHERE source_link_id IN (${LINK_IN}) AND outcome = 'APPLIED' AND run_id = '${RUN_ID}';

SELECT l.id,
       l.metadata->'connectionIdentity'->>'verifiedModality' AS modality,
       l.metadata->'connectionIdentity'->>'physicalDeviceReference' AS pdr,
       l.metadata->'connectionIdentity'->>'origin' AS origin,
       l.metadata->'connectionIdentity'->'physicalEpisodeAttestation'->>'independentlyProven' AS episode_proven,
       v.hardware_type,
       l.last_verified_at
FROM vehicle_data_source_links l
JOIN vehicles v ON v.id = l.vehicle_id
WHERE l.id IN (${LINK_IN})
ORDER BY l.id;

SELECT 'other_ci_in_org=' || count(*)::text
FROM vehicle_data_source_links l
JOIN vehicles v ON v.id = l.vehicle_id
WHERE v.organization_id = 'faa710c9-6d91-4079-a7d5-91fdccdec14a'
  AND l.metadata ? 'connectionIdentity'
  AND l.id NOT IN (${LINK_IN});
SQL

REPLICA_A="$(sudo pm2 jlist | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const p=j.find(x=>x.name==='synqdrive');process.stdout.write(p?.pm2_env?.status||'missing')")"
REPLICA_B="$(sudo pm2 jlist | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const p=j.find(x=>x.name==='synqdrive-b');process.stdout.write(p?.pm2_env?.status||'missing')")"
echo "REPLICA_A=$REPLICA_A REPLICA_B=$REPLICA_B"
curl -sf https://app.synqdrive.eu/api/v1/health >/dev/null && echo HEALTH=ok
