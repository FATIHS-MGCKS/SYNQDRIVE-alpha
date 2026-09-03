#!/usr/bin/env bash
# Battery V2 M3.1/M3.2 read-only canary observability helper.
# Does NOT mutate production state or enable publication.
set -euo pipefail

readonly SCRIPT_NAME="${0##*/}"
readonly BATTERY_V2_CONFIG_KEYS=(
  BATTERY_V2_PUBLICATION_ENABLED
  BATTERY_V2_REST_SHADOW_ENABLED
  BATTERY_V2_RECONCILIATION_ENABLED
  BATTERY_V2_RECONCILIATION_INTERVAL_MS
  BATTERY_V2_RECONCILIATION_BATCH
  BATTERY_V2_OBSERVATION_STALE_MS
  BATTERY_V2_DLQ_REPLAY_ENABLED
)

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [options] [section]

Sections: all | config | logs | sql | redis | promql | failed-jobs

Options:
  --since <ISO-8601-UTC>   Count log events at/after this timestamp (logs section)
  --all-logs               Include unbounded log scan (explicit; not default)
  --logs PATH              PM2 log file (default: /root/.pm2/logs/synqdrive-out.log)
  --redis-url URL          Redis URL for queue depths
  --backend-env PATH       Production backend.env (default: /opt/synqdrive/shared/backend.env)
  --pm2-name NAME          PM2 process for env resolution (default: synqdrive)

Requires for SQL: DATABASE_URL (read-only sufficient).
EOF
}

LOG_PATH="${BATTERY_V2_M3_LOG_PATH:-/root/.pm2/logs/synqdrive-out.log}"
REDIS_URL="${REDIS_URL:-}"
BACKEND_ENV="${BATTERY_V2_M3_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
PM2_NAME="${BATTERY_V2_M3_PM2_NAME:-synqdrive}"
SINCE_ISO=""
LOGS_ALL=false
MODE="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) SINCE_ISO="$2"; shift 2 ;;
    --all-logs) LOGS_ALL=true; shift ;;
    --logs) LOG_PATH="$2"; shift 2 ;;
    --redis-url) REDIS_URL="$2"; shift 2 ;;
    --backend-env) BACKEND_ENV="$2"; shift 2 ;;
    --pm2-name) PM2_NAME="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    config|logs|sql|redis|promql|failed-jobs|all) MODE="$1"; shift ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

section_config() {
  echo "=== CONFIG (authoritative production Battery V2 flags) ==="
  python3 - "$BACKEND_ENV" "$PM2_NAME" <<'PY'
import json, os, subprocess, sys

backend_env, pm2_name = sys.argv[1], sys.argv[2]
keys = [
  "BATTERY_V2_PUBLICATION_ENABLED",
  "BATTERY_V2_REST_SHADOW_ENABLED",
  "BATTERY_V2_RECONCILIATION_ENABLED",
  "BATTERY_V2_RECONCILIATION_INTERVAL_MS",
  "BATTERY_V2_RECONCILIATION_BATCH",
  "BATTERY_V2_OBSERVATION_STALE_MS",
  "BATTERY_V2_DLQ_REPLAY_ENABLED",
]
defaults = {
  "BATTERY_V2_PUBLICATION_ENABLED": "false",
  "BATTERY_V2_REST_SHADOW_ENABLED": "false",
  "BATTERY_V2_RECONCILIATION_ENABLED": "true",
  "BATTERY_V2_RECONCILIATION_INTERVAL_MS": "300000",
  "BATTERY_V2_RECONCILIATION_BATCH": "25",
  "BATTERY_V2_OBSERVATION_STALE_MS": "120000",
  "BATTERY_V2_DLQ_REPLAY_ENABLED": "false",
}

def parse_env_file(path):
    out = {}
    content = None
    if os.path.isfile(path):
        try:
            content = open(path).read()
        except PermissionError:
            try:
                content = subprocess.check_output(["sudo", "cat", path], text=True)
            except Exception:
                content = None
    if not content:
        return out
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k] = v.strip().strip('"')
    return out

def pm2_env(name):
    try:
        raw = subprocess.check_output(["pm2", "jlist"], text=True)
        for proc in json.loads(raw):
            if proc.get("name") == name:
                return proc.get("pm2_env", {}).get("env", {}) or {}
    except Exception:
        return {}
    return {}

file_env = parse_env_file(backend_env)
pm2 = pm2_env(pm2_name)
for key in keys:
    if key in pm2 and pm2[key] not in (None, ""):
        print(f"{key}={pm2[key]}")
        print(f"source=pm2:{pm2_name}")
    elif key in file_env and file_env[key] not in (None, ""):
        print(f"{key}={file_env[key]}")
        print(f"source={backend_env}")
    elif key in os.environ and os.environ[key] not in (None, ""):
        print(f"{key}={os.environ[key]}")
        print("source=process_environment")
    else:
        print(f"{key}={defaults[key]}")
        print("source=code_default")
    print()
PY
}

section_logs() {
  if [[ -n "$SINCE_ISO" ]]; then
    echo "=== LOG EVENT COUNTS (since ${SINCE_ISO} UTC) ==="
  elif [[ "$LOGS_ALL" == true ]]; then
    echo "=== LOG EVENT COUNTS (ALL — explicit --all-logs) ==="
  else
    echo "=== LOG EVENT COUNTS (skipped — pass --since <ISO-8601-UTC> or --all-logs) ==="
    return 0
  fi
  if [[ ! -f "$LOG_PATH" ]]; then
    echo "log file missing: $LOG_PATH"
    return 0
  fi
  python3 - "$LOG_PATH" "$SINCE_ISO" "$LOGS_ALL" <<'PY'
import json, re, sys, collections
from datetime import datetime, timezone

path, since_iso, all_logs = sys.argv[1], sys.argv[2], sys.argv[3] == "true"
since_ms = None
if since_iso:
    since_ms = int(datetime.fromisoformat(since_iso.replace("Z", "+00:00")).timestamp() * 1000)

pm2_re = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}):")
nest_re = re.compile(r"\d{2}/\d{2}/\d{4}, (\d{1,2}:\d{2}:\d{2} [AP]M)")

def parse_line_ts(line):
    m = pm2_re.match(line)
    if m:
        try:
            dt = datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except Exception:
            return None
    if "{" in line:
        try:
            obj = json.loads(line[line.index("{"):])
            for key in ("timestamp", "time", "@timestamp"):
                if key in obj:
                    return int(datetime.fromisoformat(str(obj[key]).replace("Z", "+00:00")).timestamp() * 1000)
        except Exception:
            pass
    return None

counts = collections.Counter()
unparseable = 0
skipped_before_since = 0
with open(path, "r", errors="replace") as f:
    for line in f:
        if "battery.v2." not in line:
            continue
        ts = parse_line_ts(line)
        if since_ms is not None:
            if ts is None:
                unparseable += 1
                continue
            if ts < since_ms:
                skipped_before_since += 1
                continue
        try:
            obj = json.loads(line[line.index("{"):])
            msg = obj.get("msg", "")
            if msg.startswith("battery.v2."):
                counts[msg] += 1
            else:
                unparseable += 1
        except Exception:
            unparseable += 1

if since_ms is not None:
    print(f"unparseable_lines={unparseable}")
    print(f"skipped_before_since={skipped_before_since}")
for msg, n in counts.most_common(40):
    print(f"{n}\t{msg}")
if not counts:
    print("(no matching battery.v2 structured events in window)")
PY
}

section_sql() {
  echo "=== SQL (read-only handoff / publication backlog) ==="
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL unset — skip SQL"
    return 0
  fi
  PSQL_URL="${DATABASE_URL%%\?*}"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 <<'SQL'
\echo '--- PKG-01 assessmentHandoff incomplete (canonical REST sessions, 7d)'
SELECT COUNT(*) AS pkg01_incomplete_sessions
FROM battery_measurement_sessions s
WHERE s.type IN ('REST_60M', 'REST_6H')
  AND s.updated_at >= NOW() - INTERVAL '7 days'
  AND COALESCE(s.metadata->'assessmentHandoff'->>'status','') IN ('MISSING','ENQUEUED');

\echo '--- PKG-02 publicationHandoff incomplete (canonical LV assessments, 7d)'
SELECT COUNT(*) AS pkg02_incomplete_publications
FROM battery_assessments ba
WHERE ba.scope = 'LV'
  AND ba.type = 'LV_ESTIMATED_HEALTH'
  AND ba.computed_at >= NOW() - INTERVAL '7 days'
  AND COALESCE(ba.input_summary->>'assessmentMode','') = 'CANONICAL'
  AND COALESCE(ba.input_summary->'publicationHandoff'->>'status','') IN ('MISSING','ENQUEUED');

\echo '--- PKG-02 lastAttemptAt fairness observer (crash-proof)'
SELECT
  COUNT(*) FILTER (
    WHERE ba.input_summary->'publicationHandoff'->>'lastAttemptAt' IS NULL
       OR ba.input_summary->'publicationHandoff'->>'lastAttemptAt' = ''
  ) AS malformed_or_null_last_attempt,
  COUNT(*) FILTER (
    WHERE (ba.input_summary->'publicationHandoff'->>'lastAttemptAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
  ) AS canonical_iso_last_attempt,
  MIN(
    CASE
      WHEN (ba.input_summary->'publicationHandoff'->>'lastAttemptAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
      THEN ba.input_summary->'publicationHandoff'->>'lastAttemptAt'
      ELSE NULL
    END
  ) AS oldest_canonical_iso_last_attempt
FROM battery_assessments ba
WHERE ba.scope = 'LV'
  AND ba.type = 'LV_ESTIMATED_HEALTH'
  AND COALESCE(ba.input_summary->>'assessmentMode','') = 'CANONICAL'
  AND COALESCE(ba.input_summary->'publicationHandoff'->>'status','') IN ('MISSING','ENQUEUED');

\echo '--- Duplicate assess job identity probe (sample)'
SELECT idempotency_key, COUNT(*) AS c
FROM battery_assessments
WHERE computed_at >= NOW() - INTERVAL '7 days'
  AND idempotency_key LIKE 'assess:%'
GROUP BY 1 HAVING COUNT(*) > 1
ORDER BY c DESC LIMIT 10;
SQL
}

section_redis() {
  echo "=== REDIS BullMQ battery.v2 ==="
  if [[ -z "$REDIS_URL" ]]; then
    echo "REDIS_URL unset — skip (or pass --redis-url)"
    return 0
  fi
  echo -n "wait="; redis-cli -u "$REDIS_URL" LLEN bull:battery.v2:wait
  echo -n "active="; redis-cli -u "$REDIS_URL" LLEN bull:battery.v2:active
  echo -n "delayed="; redis-cli -u "$REDIS_URL" LLEN bull:battery.v2:delayed
  echo -n "failed="; redis-cli -u "$REDIS_URL" ZCARD bull:battery.v2:failed
}

section_failed_jobs() {
  echo "=== FAILED battery.v2 classification (read-only) ==="
  if [[ ! -d /opt/synqdrive/current/backend/node_modules/bullmq ]]; then
    echo "Run on VPS with deployed backend (bullmq required)"
    return 0
  fi
  (
    cd /opt/synqdrive/current/backend
    sudo bash -c "set -a; source '$BACKEND_ENV'; set +a; node - <<'NODE'
const { Queue } = require('bullmq');
function redact(s){return String(s||'').replace(/[a-f0-9-]{36}/gi,'<uuid>').slice(0,200)}
(async()=>{
  const connection = process.env.REDIS_URL || {host:process.env.REDIS_HOST||'127.0.0.1',port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD,db:Number(process.env.REDIS_DB||0),maxRetriesPerRequest:null};
  const q=new Queue('battery.v2',{connection});
  const failed=await q.getJobs(['failed'],0,200);
  const now=Date.now(), day=864e5, week=7*day;
  const byType={}, byErr={}, last24h=0, last7d=0, older=0;
  let first=null, last=null;
  for(const j of failed){
    const n=j.name||'unknown';
    byType[n]=(byType[n]||0)+1;
    const e=redact(j.failedReason).split('\n')[0].slice(0,120);
    byErr[e]=(byErr[e]||0)+1;
    const f=j.finishedOn||null;
    if(f){first=first==null?f:Math.min(first,f);last=last==null?f:Math.max(last,f);
      const age=now-f; if(age<=day)last24h++; else if(age<=week)last7d++; else older++;}
  }
  console.log(JSON.stringify({failed_count:failed.length,first_failed:first?new Date(first).toISOString():null,most_recent_failed:last?new Date(last).toISOString():null,last24h,last7d,older,by_job_type:byType,top_errors:Object.entries(byErr).sort((a,b)=>b[1]-a[1]).slice(0,8)},null,2));
  await q.close();
})().catch(e=>{console.error(e);process.exit(1)});
NODE
  )
}

section_promql() {
  cat <<'EOF'
=== PROMQL (Grafana / Prometheus) ===
sum(rate(synqdrive_battery_v2_jobs_enqueue_total[15m])) by (job_type, outcome)
sum(rate(synqdrive_battery_v2_reconciliation_enqueued_total[15m])) by (category)
sum(rate(synqdrive_battery_jobs_failed_total[15m])) by (job_type, error_code)
synqdrive_battery_v2_dead_letter_backlog
sum(rate(synqdrive_battery_publications_total[15m])) by (maturity, outcome)
EOF
}

case "$MODE" in
  all)
    section_config; echo; section_logs; echo; section_sql; echo; section_redis; echo; section_failed_jobs; echo; section_promql ;;
  failed-jobs) section_failed_jobs ;;
  config|logs|sql|redis|promql) "section_$MODE" ;;
esac
