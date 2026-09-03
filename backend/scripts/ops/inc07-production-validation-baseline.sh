#!/usr/bin/env bash
# INC-07 (P1.8.3.5) read-only production validation baseline snapshot.
# Does NOT mutate production state.
set -euo pipefail

LABEL="${1:-SNAPSHOT}"
BACKEND_ENV="${INC07_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

echo "=== INC07_VALIDATION_BASELINE label=${LABEL} ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "HOST=$(hostname -f 2>/dev/null || hostname)"

echo "--- DEPLOY_TOPOLOGY ---"
echo "CURRENT_SYMLINK=$(readlink -f /opt/synqdrive/current 2>/dev/null || echo UNAVAILABLE)"
echo "CURRENT_RELEASE=$(basename "$(readlink -f /opt/synqdrive/current 2>/dev/null || echo '')" 2>/dev/null || echo UNAVAILABLE)"
echo "CURRENT_PRODUCTION_SHA=$(git -C /opt/synqdrive/current rev-parse HEAD 2>/dev/null || echo UNAVAILABLE)"

if [[ -f /opt/synqdrive/shared/deploy-state/last-deploy-state.env ]]; then
  # shellcheck disable=SC1091
  source /opt/synqdrive/shared/deploy-state/last-deploy-state.env 2>/dev/null || true
  echo "LAST_DEPLOY_STATE_FILE=present"
  echo "ROLLBACK_TARGET_SHA=${PREVIOUS_SHA:-UNAVAILABLE}"
  echo "ROLLBACK_RELEASE=${PREVIOUS_RELEASE_DIR:-UNAVAILABLE}"
fi

echo "--- PM2 ---"
pm2 jlist 2>/dev/null | node -e "
const apps=JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const name of ['synqdrive','synqdrive-b']) {
  const p=apps.find(x=>x.name===name);
  if (!p) { console.log(name+': MISSING'); continue; }
  const e=p.pm2_env||{};
  console.log(name+': status='+e.status+' pid='+p.pid+' restarts='+e.restart_time+' uptime_sec='+Math.floor((Date.now()-(e.pm_uptime||Date.now()))/1000));
}
" 2>/dev/null || pm2 list

echo "--- NGINX ---"
nginx -t 2>&1 | sed 's/^/nginx: /' || echo "nginx: TEST_FAILED"
grep -E 'server 127\.0\.0\.1:(3001|3002)' /etc/nginx/sites-enabled/* 2>/dev/null | head -5 || true

echo "--- DIRECT_HEALTH ---"
for port in 3001 3002; do
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health" 2>/dev/null || echo '{}')
  ok=$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).status==='ok'?'OK':'FAIL')}catch{console.log('FAIL')}})" 2>/dev/null || echo FAIL)
  echo "port_${port}_health=${ok}"
done
echo "EXTERNAL_HEALTH=$(curl -sf https://app.synqdrive.eu/api/v1/health >/dev/null && echo OK || echo FAIL)"

echo "--- SCHEDULER ---"
for port in 3001 3002; do
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || echo '{}')
  role=$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).checks?.schedulerLeader?.details?.role||'UNKNOWN')}catch{console.log('UNKNOWN')}})" 2>/dev/null || echo UNKNOWN)
  echo "port_${port}_scheduler_role=${role}"
done

set +u
set -a
# shellcheck disable=SC1090
source "$BACKEND_ENV"
set +a
export DATABASE_URL REDIS_HOST REDIS_PORT REDIS_PASSWORD REDIS_DB

AUTH=""; [[ -n "${REDIS_PASSWORD:-}" ]] && AUTH="-a $REDIS_PASSWORD"
RH=${REDIS_HOST:-localhost}; RP=${REDIS_PORT:-6379}; DB=${REDIS_DB:-0}

echo "--- REDIS ---"
echo "REDIS_PING=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" PING 2>/dev/null || echo ERR)"
echo "RECONCILIATION_MUTEX_KEYS=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" --scan --pattern 'reconciliation:*' 2>/dev/null | wc -l | tr -d ' ')"

echo "--- QUEUES (sample) ---"
for q in trip-reconciliation route-enrichment automatic-trip-enrichment; do
  wait=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" LLEN "bull:${q}:wait" 2>/dev/null || echo ERR)
  failed=$(redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" ZCARD "bull:${q}:failed" 2>/dev/null || echo ERR)
  echo "${q}_wait=${wait} ${q}_failed=${failed}"
done

PSQL_URL="${DATABASE_URL%%\?*}"

echo "--- INC07_TRIP_REPAIR_COUNTS ---"
psql "$PSQL_URL" -t -A -c "
SELECT status, COUNT(*) FROM trip_repairs
WHERE repair_type = 'INTRA_TRIP_GAP_SPLIT'
GROUP BY status ORDER BY status;"

echo "--- INC07_DETERMINISTIC_REPAIR_ID_COUNT ---"
psql "$PSQL_URL" -t -A -c "
SELECT COUNT(*) FROM trip_repairs tr
WHERE tr.repair_type = 'INTRA_TRIP_GAP_SPLIT'
  AND tr.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND tr.id = (
    SELECT encode(digest(
      concat_ws('|', tr.vehicle_id, 'INTRA_TRIP_GAP_SPLIT',
        to_char(tr.window_from AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),
        to_char(tr.window_to AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')
      ), 'sha256'), 'hex')
  );" 2>/dev/null || echo "deterministic_id_check=UNAVAILABLE_WITHOUT_PGCRYPTO"

echo "--- INC07_HISTORICAL_DUPLICATE_GROUPS ---"
psql "$PSQL_URL" -P pager=off -c "
SELECT vehicle_id, start_time, COUNT(*) AS row_count,
       array_agg(id ORDER BY created_at) AS trip_ids,
       array_agg(created_at ORDER BY created_at) AS created_ats
FROM vehicle_trips
WHERE trip_source = 'REPAIRED' AND is_repaired = true
GROUP BY vehicle_id, start_time
HAVING COUNT(*) > 1
ORDER BY vehicle_id, start_time;"

echo "--- INC07_HISTORICAL_DUPLICATE_ROW_COUNT ---"
psql "$PSQL_URL" -t -A -c "
SELECT COALESCE(SUM(cnt),0) FROM (
  SELECT COUNT(*) AS cnt FROM vehicle_trips
  WHERE trip_source = 'REPAIRED' AND is_repaired = true
  GROUP BY vehicle_id, start_time HAVING COUNT(*) > 1
) x;"

echo "--- INC07_TRIP_REPAIR_DETAIL (INTRA_TRIP_GAP_SPLIT) ---"
psql "$PSQL_URL" -P pager=off -c "
SELECT id, vehicle_id, trip_id, status, window_from, window_to, applied_at, created_at
FROM trip_repairs
WHERE repair_type = 'INTRA_TRIP_GAP_SPLIT'
ORDER BY created_at;"

echo "--- INC07_RUNTIME_CODE_MARKERS ---"
RELEASE_DIR="${2:-/opt/synqdrive/current}"
for sym in buildIntraTripGapSplitRepairAuditId applyIntraTripGapSplitRepairAtomically recordIntraTripGapSplitFailureSafely acquirePgAdvisoryXactLock64; do
  if grep -rq "$sym" "$RELEASE_DIR/backend/dist/src/modules/vehicle-intelligence/trips/reconciliation/" 2>/dev/null \
     || grep -rq "$sym" "$RELEASE_DIR/backend/src/modules/vehicle-intelligence/trips/reconciliation/" 2>/dev/null; then
    echo "${sym}=PRESENT"
  else
    echo "${sym}=ABSENT"
  fi
done

echo "=== END ${LABEL} ==="
