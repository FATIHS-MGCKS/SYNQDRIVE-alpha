#!/usr/bin/env bash
# Battery V2 M3.1/M3.2 read-only canary observability helper.
# Does NOT mutate production state or enable publication.
set -euo pipefail

readonly SCRIPT_NAME="${0##*/}"

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [--logs PATH] [--redis-url URL]

Read-only Battery V2 PKG-01/PKG-02 canary observability snapshot.

Sections:
  config     Effective Battery V2 env flags (non-secret values only)
  logs       Structured log event counts from backend logs
  sql        Read-only PostgreSQL handoff/publication backlog queries
  redis      BullMQ battery.v2 queue depths (requires redis-cli + URL)
  promql     Suggested Prometheus queries for Grafana panels

Requires for SQL: DATABASE_URL (read-only access sufficient).
EOF
}

LOG_PATH="${BATTERY_V2_M3_LOG_PATH:-/var/log/pm2/synqdrive-out.log}"
REDIS_URL="${REDIS_URL:-}"
MODE="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --logs) LOG_PATH="$2"; shift 2 ;;
    --redis-url) REDIS_URL="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    config|logs|sql|redis|promql) MODE="$1"; shift ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

section_config() {
  echo "=== CONFIG (effective defaults when unset) ==="
  python3 - <<'PY'
import os
def b(name, default=False):
    v=os.environ.get(name)
    if v is None: print(f"{name}={default} (default)")
    else: print(f"{name}={v}")
b("BATTERY_V2_PUBLICATION_ENABLED", False)
b("BATTERY_V2_REST_SHADOW_ENABLED", False)
b("BATTERY_V2_RECONCILIATION_ENABLED", True)
for k, d in [
    ("BATTERY_V2_RECONCILIATION_INTERVAL_MS", 300000),
    ("BATTERY_V2_RECONCILIATION_BATCH", 25),
    ("BATTERY_V2_OBSERVATION_STALE_MS", 120000),
]:
    v=os.environ.get(k)
    print(f"{k}={v if v is not None else d}{' (default)' if v is None else ''}")
PY
}

section_logs() {
  echo "=== LOG EVENT COUNTS (last 24h if timestamps present) ==="
  if [[ ! -f "$LOG_PATH" ]]; then
    echo "log file missing: $LOG_PATH"
    return 0
  fi
  python3 - "$LOG_PATH" <<'PY'
import json, sys, collections
path=sys.argv[1]
counts=collections.Counter()
with open(path, 'r', errors='replace') as f:
    for line in f:
        if 'battery.v2.' not in line:
            continue
        try:
            i=line.index('{')
            obj=json.loads(line[i:])
            msg=obj.get('msg','')
            if msg.startswith('battery.v2.'):
                counts[msg]+=1
        except Exception:
            continue
for msg, n in counts.most_common(40):
    print(f"{n}\t{msg}")
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

\echo '--- Oldest PKG-02 incomplete lastAttemptAt (fairness age)'
SELECT MIN(
  CASE
    WHEN (ba.input_summary->'publicationHandoff'->>'lastAttemptAt') ~ '^\d{4}-\d{2}-\d{2}T'
    THEN (ba.input_summary->'publicationHandoff'->>'lastAttemptAt')::timestamptz
    ELSE NULL
  END
) AS oldest_valid_last_attempt
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
  redis-cli -u "$REDIS_URL" LLEN bull:battery.v2:wait
  redis-cli -u "$REDIS_URL" LLEN bull:battery.v2:active
  redis-cli -u "$REDIS_URL" LLEN bull:battery.v2:delayed
  redis-cli -u "$REDIS_URL" ZCARD bull:battery.v2:failed
}

section_promql() {
  cat <<'EOF'
=== PROMQL (Grafana / Prometheus) ===
# PKG-01 / PKG-02 enqueue
sum(rate(synqdrive_battery_v2_jobs_enqueue_total[15m])) by (job_type, outcome)
sum(rate(synqdrive_battery_v2_jobs_enqueue_suppressed_total[15m])) by (job_type, reason)

# Reconciliation repairs per tick category
sum(rate(synqdrive_battery_v2_reconciliation_enqueued_total[15m])) by (category)

# Job failures / dead letters
sum(rate(synqdrive_battery_jobs_failed_total[15m])) by (job_type, error_code)
synqdrive_battery_v2_dead_letter_backlog

# Publications (customer effect gate — should stay skipped while PUBLICATION OFF)
sum(rate(synqdrive_battery_publications_total[15m])) by (maturity, outcome)

# REST shadow coexistence
sum(rate(synqdrive_battery_rest_measurements_total[15m])) by (window, quality)
EOF
}

case "$MODE" in
  all)
    section_config
    echo
    section_logs
    echo
    section_sql
    echo
    section_redis
    echo
    section_promql
    ;;
  config|logs|sql|redis|promql) "section_$MODE" ;;
esac
