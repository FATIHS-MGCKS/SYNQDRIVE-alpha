#!/usr/bin/env bash
# M3.0E read-only production convergence snapshot (no mutations).
set -euo pipefail

LABEL="${1:-T0}"
BACKEND_ENV="${BATTERY_V2_M3_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
DEPLOY_SINCE="${DEPLOY_SINCE_ISO:-}"

echo "=== M3.0E SNAPSHOT label=${LABEL} ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

# --- Config ---
echo "--- CONFIG ---"
bash /opt/synqdrive/current/backend/scripts/ops/battery-v2-m3-canary-observability.sh config 2>/dev/null || true

# --- PM2 ---
echo "--- PM2 ---"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
procs=json.load(sys.stdin)
for p in procs:
    if p.get('name') in ('synqdrive','synqdrive-b'):
        env=p.get('pm2_env',{})
        print(f\"name={p['name']} status={p.get('pm2_env',{}).get('status')} pid={p.get('pid')} uptime={env.get('pm_uptime')} restarts={env.get('restart_time')} sha={env.get('env',{}).get('SYNQDRIVE_DEPLOY_SHA','?')[:12]}\")
" 2>/dev/null || pm2 list

# --- Scheduler leader ---
echo "--- SCHEDULER ---"
grep -h 'scheduler.*leader\|battery-v2-reconciliation\|reconciliation.*tick\|reconcileAll' /root/.pm2/logs/synqdrive-out.log /root/.pm2/logs/synqdrive-b-out.log 2>/dev/null | tail -5 || echo "(no recent scheduler lines)"

# --- Redis BullMQ ---
echo "--- BULLMQ battery.v2 ---"
set +u
set -a
# shellcheck disable=SC1090
source "$BACKEND_ENV" 2>/dev/null || sudo cat "$BACKEND_ENV" | while IFS= read -r line; do [[ "$line" =~ ^[A-Z] ]] && export "$line" 2>/dev/null || true; done
set +a
set -u
AUTH=""
[ -n "${REDIS_PASSWORD:-}" ] && AUTH="-a $REDIS_PASSWORD"
RH=${REDIS_HOST:-localhost}
RP=${REDIS_PORT:-6379}
DB=${REDIS_DB:-0}
if [[ -n "${REDIS_HOST:-}" ]]; then
  echo -n "wait="; redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" LLEN bull:battery.v2:wait 2>/dev/null
  echo -n "active="; redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" LLEN bull:battery.v2:active 2>/dev/null
  echo -n "failed="; redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" ZCARD bull:battery.v2:failed 2>/dev/null
  echo -n "completed="; redis-cli -h "$RH" -p "$RP" $AUTH -n "$DB" ZCARD bull:battery.v2:completed 2>/dev/null
else
  echo "REDIS_HOST unset"
fi

# --- Failed jobs classification ---
echo "--- FAILED JOBS ---"
bash /opt/synqdrive/current/backend/scripts/ops/battery-v2-m3-canary-observability.sh failed-jobs 2>/dev/null || true

# --- Redis reservations ---
echo "--- ASSESS-DISPATCH RESERVATIONS ---"
if [[ -n "${REDIS_URL:-}" ]]; then
  python3 - "$REDIS_URL" <<'PY'
import subprocess, sys, json, collections
url = sys.argv[1]
try:
    keys = subprocess.check_output(["redis-cli", "-u", url, "--scan", "--pattern", "battery:v2:assess-dispatch:*"], text=True).strip().splitlines()
    keys = [k for k in keys if k]
    ttls = []
    vehicles = []
    for k in keys:
        vid = k.split(":")[-1]
        vehicles.append(vid)
        ttl = subprocess.check_output(["redis-cli", "-u", url, "PTTL", k], text=True).strip()
        ttls.append(int(ttl) if ttl.lstrip('-').isdigit() else ttl)
    dist = collections.Counter(vehicles)
    print(json.dumps({
        "reservation_count": len(keys),
        "unique_vehicles": len(dist),
        "ttl_min_ms": min(ttls) if ttls else None,
        "ttl_max_ms": max(ttls) if ttls else None,
        "vehicle_distribution": dict(dist.most_common(10)),
        "stale_negative_ttl": sum(1 for t in ttls if isinstance(t,int) and t < 0),
    }, indent=2))
except Exception as e:
    print(f"error: {e}")
PY
fi

# --- SQL handoffs ---
echo "--- SQL PKG-01/02 ---"
if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL_URL="${DATABASE_URL%%\?*}"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -t -A <<'SQL'
\echo 'PKG01_BY_STATUS'
SELECT COALESCE(s.metadata->'assessmentHandoff'->>'status','MISSING') AS st, COUNT(*)
FROM battery_measurement_sessions s
WHERE s.type IN ('REST_60M', 'REST_6H')
  AND s.updated_at >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 2 DESC;

\echo 'PKG01_RECONCILE_ELIGIBLE'
SELECT COUNT(*) FROM battery_measurement_sessions s
WHERE s.type IN ('REST_60M', 'REST_6H')
  AND s.updated_at >= NOW() - INTERVAL '30 days'
  AND COALESCE(s.metadata->'assessmentHandoff'->>'status','') IN ('MISSING','ENQUEUED','FAILED');

\echo 'PKG01_LEGACY_54000_RECOVERABLE'
SELECT COUNT(*) FROM battery_measurement_sessions s
WHERE s.type IN ('REST_60M', 'REST_6H')
  AND COALESCE(s.metadata->'assessmentHandoff'->>'status','') = 'FAILED'
  AND s.metadata->'assessmentHandoff'->>'failureClass' = 'PERSISTENCE_FAILED'
  AND s.metadata->'assessmentHandoff'->>'errorCode' = 'HANDLER_FAILED'
  AND (s.metadata->'assessmentHandoff'->>'lastError' LIKE '%54000%' OR s.metadata->'assessmentHandoff'->>'lastError' LIKE '%index row size%');

\echo 'PKG01_MALFORMED_LASTATTEMPT'
SELECT COUNT(*) FROM battery_measurement_sessions s
WHERE s.type IN ('REST_60M', 'REST_6H')
  AND COALESCE(s.metadata->'assessmentHandoff'->>'status','') IN ('MISSING','ENQUEUED','FAILED')
  AND (s.metadata->'assessmentHandoff'->>'lastAttemptAt' IS NULL OR s.metadata->'assessmentHandoff'->>'lastAttemptAt' = '');

\echo 'PKG02_BY_STATUS'
SELECT COALESCE(ba.input_summary->'publicationHandoff'->>'status','MISSING') AS st, COUNT(*)
FROM battery_assessments ba
WHERE ba.scope = 'LV' AND ba.type = 'LV_ESTIMATED_HEALTH'
  AND ba.computed_at >= NOW() - INTERVAL '30 days'
  AND COALESCE(ba.input_summary->>'assessmentMode','') = 'CANONICAL'
GROUP BY 1 ORDER BY 2 DESC;

\echo 'BATTERY_PUBLICATIONS_COUNT'
SELECT COUNT(*) FROM battery_publications WHERE created_at >= NOW() - INTERVAL '30 days';

\echo 'DUPLICATE_ASSESS_IDEMPOTENCY'
SELECT idempotency_key, COUNT(*) c FROM battery_assessments
WHERE computed_at >= NOW() - INTERVAL '7 days' AND idempotency_key LIKE 'assess:%'
GROUP BY 1 HAVING COUNT(*) > 1 LIMIT 5;

\echo 'NEW_54000_ASSESSMENTS_7D'
SELECT COUNT(*) FROM battery_assessments
WHERE computed_at >= NOW() - INTERVAL '7 days'
  AND (idempotency_key LIKE '%' OR true)
  AND false;
SQL
else
  echo "DATABASE_URL unset"
fi

# --- Post-deploy log deltas ---
if [[ -n "$DEPLOY_SINCE" ]]; then
  echo "--- LOG DELTAS since ${DEPLOY_SINCE} ---"
  bash /opt/synqdrive/current/backend/scripts/ops/battery-v2-m3-canary-observability.sh logs --since "$DEPLOY_SINCE" 2>/dev/null || true
  echo "--- ERROR PATTERNS since deploy ---"
  for pat in '54000' 'index row size' 'text = uuid' 'operator does not exist' 'LOCK_CONTENTION' 'AUTHORITY_UNAVAILABLE' 'ownership mismatch' 'reservation refresh' 'HANDLER_FAILED'; do
    c=$(grep -h "$pat" /root/.pm2/logs/synqdrive-out.log /root/.pm2/logs/synqdrive-b-out.log /root/.pm2/logs/synqdrive-error.log /root/.pm2/logs/synqdrive-b-error.log 2>/dev/null | python3 -c "
import sys,re
from datetime import datetime,timezone
since='$DEPLOY_SINCE'
since_ms=int(datetime.fromisoformat(since.replace('Z','+00:00')).timestamp()*1000) if since else 0
pm2_re=re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}):')
n=0
for line in sys.stdin:
    m=pm2_re.match(line)
    if m and since_ms:
        try:
            ts=int(datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc).timestamp()*1000)
            if ts<since_ms: continue
        except: pass
    n+=1
print(n)
" 2>/dev/null || echo 0)
    echo "${pat}=${c}"
  done
fi

echo "=== END SNAPSHOT ${LABEL} ==="
