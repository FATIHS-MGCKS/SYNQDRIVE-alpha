#!/usr/bin/env bash
# Battery V2 M3.1 read-only production activation observability snapshot.
# Does NOT mutate production state.
set -eo pipefail

LABEL="${1:-SNAPSHOT}"
SINCE_ISO="${BATTERY_V2_SINCE_ISO:-}"
BACKEND_ENV="${BATTERY_V2_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
M3E_DEPLOY_ISO="${BATTERY_V2_M3E_DEPLOY_ISO:-2026-09-03T10:26:26Z}"

echo "=== BATTERY_V2_M3_1_SNAPSHOT label=${LABEL} ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

bash /opt/synqdrive/current/backend/scripts/ops/battery-v2-m3-canary-observability.sh config 2>/dev/null || true

echo "--- DEPLOY ---"
readlink -f /opt/synqdrive/current 2>/dev/null || true
git -C /opt/synqdrive/current rev-parse HEAD 2>/dev/null || true

echo "--- PM2 ---"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
leaders=0
for p in json.load(sys.stdin):
  if p.get('name') in ('synqdrive','synqdrive-b'):
    e=p.get('pm2_env',{})
    print(f\"{p['name']}: status={e.get('status')} pid={p.get('pid')} restarts={e.get('restart_time')}\")
" 2>/dev/null || pm2 list

echo "--- SCHEDULER LEADERS ---"
for port in 3001 3002; do
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || echo '{}')
  role=$(printf '%s' "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('checks',{}).get('schedulerLeader',{}).get('details',{}).get('role','UNKNOWN'))" 2>/dev/null || echo UNKNOWN)
  echo "port_${port}_role=${role}"
done

set +u
set -a
# shellcheck disable=SC1090
source "$BACKEND_ENV"
set +a

AUTH=""; [ -n "${REDIS_PASSWORD:-}" ] && AUTH="-a $REDIS_PASSWORD"
RH=${REDIS_HOST:-localhost}; RP=${REDIS_PORT:-6379}; DB=${REDIS_DB:-0}
export REDIS_HOST REDIS_PORT REDIS_PASSWORD REDIS_DB DATABASE_URL

echo "--- BULLMQ ---"
echo "wait=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" LLEN bull:battery.v2:wait 2>/dev/null || echo ERR)"
echo "active=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" LLEN bull:battery.v2:active 2>/dev/null || echo ERR)"
echo "failed=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" ZCARD bull:battery.v2:failed 2>/dev/null || echo ERR)"
echo "completed=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" ZCARD bull:battery.v2:completed 2>/dev/null || echo ERR)"

cd /opt/synqdrive/current/backend
node -e '
const {Queue}=require("bullmq");
(async()=>{
  const since=process.env.SINCE_ISO?Date.parse(process.env.SINCE_ISO):Date.parse(process.env.M3E_DEPLOY_ISO);
  const c={host:process.env.REDIS_HOST,port:+process.env.REDIS_PORT,password:process.env.REDIS_PASSWORD,db:+process.env.REDIS_DB,maxRetriesPerRequest:null};
  const q=new Queue("battery.v2",{connection:c});
  const f=await q.getJobs(["failed"],0,500);
  let sinceCount=0; const byType={};
  for(const j of f){const n=j.name||"?"; if((j.finishedOn||0)>=since){sinceCount++; byType[n]=(byType[n]||0)+1;}}
  console.log(JSON.stringify({failed_total:f.length,failed_since_marker:sinceCount,since_iso:process.env.SINCE_ISO||process.env.M3E_DEPLOY_ISO,by_type_since:byType}));
  await q.close();
})().catch(e=>{console.error(e);process.exit(1)});
' 2>/dev/null || true

echo "--- RESERVATIONS ---"
echo "count=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" --scan --pattern 'battery:v2:assess-dispatch:*' 2>/dev/null | wc -l)"

PSQL_URL="${DATABASE_URL%%\?*}"
echo "--- PKG01 ---"
psql "$PSQL_URL" -t -A -c "
SELECT COALESCE(s.metadata #>> ARRAY['scheduledTargets', t.target_type, 'assessmentHandoff', 'status'], 'MISSING'), COUNT(*)
FROM battery_measurement_sessions s
CROSS JOIN (VALUES ('REST_60M'), ('REST_6H')) t(target_type)
WHERE s.updated_at >= NOW()-INTERVAL '30 days' AND s.metadata ? 'scheduledTargets' AND s.metadata->'scheduledTargets' ? t.target_type
GROUP BY 1 ORDER BY 2 DESC;"
psql "$PSQL_URL" -t -A -c "
SELECT COUNT(*) FROM battery_measurements m
INNER JOIN battery_measurement_sessions s ON s.id=m.session_id AND s.organization_id=m.organization_id
WHERE m.type IN ('REST_60M','REST_6H') AND m.created_at >= NOW()-INTERVAL '7 days'
AND COALESCE(m.provenance->>'sourceObservationId','') <> ''
AND NOT (COALESCE(s.metadata #>> ARRAY['scheduledTargets', m.type::text, 'assessmentHandoff', 'status'],'MISSING')='EXECUTED'
  AND COALESCE(s.metadata #>> ARRAY['scheduledTargets', m.type::text, 'assessmentHandoff', 'measurementId'],'')=m.id);" | sed 's/^/reconcile_candidates=/'

echo "--- PKG02 ---"
psql "$PSQL_URL" -t -A -c "
SELECT COALESCE(ba.input_summary->'publicationHandoff'->>'status','MISSING'), COUNT(*)
FROM battery_assessments ba WHERE ba.scope='LV' AND ba.type='LV_ESTIMATED_HEALTH'
AND ba.computed_at >= NOW()-INTERVAL '30 days' AND COALESCE(ba.input_summary->>'assessmentMode','')='CANONICAL'
GROUP BY 1 ORDER BY 2 DESC;"
SINCE_SQL="${SINCE_ISO:-1970-01-01T00:00:00Z}"
psql "$PSQL_URL" -t -A -c "SELECT COUNT(*) FROM battery_publications WHERE created_at >= '${SINCE_SQL}'::timestamptz;" | sed 's/^/publications_since_marker=/'
psql "$PSQL_URL" -t -A -c "
SELECT COUNT(*) FROM battery_assessments ba WHERE ba.scope='LV' AND ba.type='LV_ESTIMATED_HEALTH'
AND ba.computed_at >= NOW()-INTERVAL '30 days' AND COALESCE(ba.input_summary->>'assessmentMode','')='CANONICAL'
AND jsonb_typeof(ba.input_summary->'publicationHandoff')='object'
AND ba.input_summary->'publicationHandoff'->>'status' IN ('MISSING','ENQUEUED')
AND COALESCE(ba.input_summary->'publicationHandoff'->>'selectedAssessmentId','') <> '';" | sed 's/^/pub_handoff_candidates=/'

echo "--- DUPLICATES ---"
psql "$PSQL_URL" -t -A -c "SELECT COUNT(*) FROM (SELECT idempotency_key FROM battery_assessments WHERE computed_at >= NOW()-INTERVAL '7 days' AND idempotency_key LIKE 'assess:%' GROUP BY 1 HAVING COUNT(*)>1) x;" | sed 's/^/dup_assess=/'
psql "$PSQL_URL" -t -A -c "SELECT COUNT(*) FROM (SELECT idempotency_key FROM battery_assessments WHERE computed_at >= NOW()-INTERVAL '7 days' AND idempotency_key LIKE 'pub:%' GROUP BY 1 HAVING COUNT(*)>1) x;" | sed 's/^/dup_pub=/'
psql "$PSQL_URL" -t -A -c "SELECT COUNT(*) FROM (SELECT vehicle_id, version, COUNT(*) c FROM battery_publications WHERE created_at >= NOW()-INTERVAL '7 days' GROUP BY 1,2 HAVING COUNT(*)>1) x;" | sed 's/^/dup_customer_pub=/'

if [[ "${LABEL}" == "VEHICLE_EVIDENCE" || "${LABEL}" == *"T30"* ]]; then
  echo "--- CONNECTED VEHICLE EVIDENCE ---"
  psql "$PSQL_URL" -t -A <<SQL
SELECT v.id, LEFT(COALESCE(v.license_plate,'?'),10),
  (SELECT MAX(bm.created_at) FROM battery_measurements bm WHERE bm.vehicle_id=v.id),
  (SELECT MAX(ba.computed_at) FROM battery_assessments ba WHERE ba.vehicle_id=v.id AND ba.scope='LV'),
  (SELECT COUNT(*) FROM battery_publications bp WHERE bp.vehicle_id=v.id AND bp.created_at >= '${SINCE_SQL}'::timestamptz)
FROM vehicles v
INNER JOIN vehicle_latest_states vls ON vls.vehicle_id=v.id
WHERE vls.dimo_token_id IS NOT NULL
ORDER BY 3 DESC NULLS LAST LIMIT 20;
SQL
fi

if [[ -n "$SINCE_ISO" ]]; then
  echo "--- ERROR DELTA since ${SINCE_ISO} ---"
  for pat in '54000' 'index row size' 'text = uuid' 'operator does not exist' 'LOCK_CONTENTION' 'AUTHORITY_UNAVAILABLE' 'ownership mismatch' 'reservation refresh' 'HANDLER_FAILED' 'publication persistence'; do
    c=$(grep -h "$pat" /root/.pm2/logs/synqdrive-out.log /root/.pm2/logs/synqdrive-b-out.log /root/.pm2/logs/synqdrive-error.log /root/.pm2/logs/synqdrive-b-error.log 2>/dev/null | python3 -c "
import sys,re
from datetime import datetime,timezone
since=int(datetime.fromisoformat('${SINCE_ISO}'.replace('Z','+00:00')).timestamp()*1000)
pm2=re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}):')
n=0
for line in sys.stdin:
 m=pm2.match(line)
 if m:
  ts=int(datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc).timestamp()*1000)
  if ts<since: continue
 n+=1
print(n)" 2>/dev/null || echo 0)
    echo "${pat}=${c}"
  done
fi

echo "--- HEALTH ---"
curl -sf https://app.synqdrive.eu/api/v1/health 2>/dev/null || echo FAIL
echo
echo "=== END ${LABEL} ==="
