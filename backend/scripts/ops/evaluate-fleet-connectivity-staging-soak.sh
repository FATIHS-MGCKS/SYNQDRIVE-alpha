#!/usr/bin/env bash
# Evaluate Fleet Connectivity staging soak metrics (read-only).
#
# Usage (VPS):
#   SOAK_START_UTC=2026-07-19T12:26:00Z bash backend/scripts/ops/evaluate-fleet-connectivity-staging-soak.sh
#
# Output: JSON summary on stdout; optional OUT_DIR for artifacts.
set -euo pipefail

SOAK_START_UTC="${SOAK_START_UTC:-2026-07-19T12:26:00Z}"
OUT_DIR="${OUT_DIR:-}"
NOW_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -n "$OUT_DIR" ]]; then
  mkdir -p "$OUT_DIR"
  exec > >(tee "${OUT_DIR}/soak-eval.log") 2>&1
fi

echo "==> Fleet Connectivity staging soak evaluation"
echo "    soak_start=${SOAK_START_UTC}"
echo "    evaluated_at=${NOW_UTC}"

START_EPOCH="$(date -u -d "$SOAK_START_UTC" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$SOAK_START_UTC" +%s)"
NOW_EPOCH="$(date -u +%s)"
SOAK_HOURS="$(awk "BEGIN {printf \"%.2f\", ($NOW_EPOCH - $START_EPOCH) / 3600}")"
echo "    soak_hours=${SOAK_HOURS}"

echo "==> Kill switch"
grep -E '^CONNECTIVITY_(EPISODE_RECOVERY|RECONCILIATION_APPLY)_ENABLED=' /opt/synqdrive/shared/backend.env 2>/dev/null || true

echo "==> Health"
curl -sf http://127.0.0.1:3001/api/v1/health || echo '{"status":"unreachable"}'

echo "==> PM2 stability"
pm2 describe synqdrive 2>/dev/null | grep -E 'status|restarts|uptime' || true

echo "==> PostgreSQL connectivity metrics (since soak start)"
sudo -u postgres psql -d synqdrive -v soak_start="$SOAK_START_UTC" <<'SQL'
\pset format aligned
SELECT 'webhook_inbox' AS layer, processing_status::text AS status, count(*) AS n
FROM device_connection_webhook_inbox
WHERE created_at >= :'soak_start'::timestamptz
GROUP BY 1, 2
UNION ALL
SELECT 'webhook_inbox_dlq', 'DEAD_LETTER', count(*)
FROM device_connection_webhook_inbox
WHERE dead_lettered_at IS NOT NULL AND dead_lettered_at >= :'soak_start'::timestamptz
UNION ALL
SELECT 'webhook_inbox_retry', 'RETRYABLE_FAILED', count(*)
FROM device_connection_webhook_inbox
WHERE processing_status = 'RETRYABLE_FAILED' AND updated_at >= :'soak_start'::timestamptz
UNION ALL
SELECT 'outbox', status::text, count(*)
FROM device_connection_episode_resolution_outbox
WHERE created_at >= :'soak_start'::timestamptz
GROUP BY 1, 2
UNION ALL
SELECT 'episodes_open', 'OPEN', count(*)
FROM device_connection_episodes WHERE status = 'OPEN'
UNION ALL
SELECT 'episodes_resolved_soak', 'RESOLVED', count(*)
FROM device_connection_episodes
WHERE status = 'RESOLVED' AND resolved_at >= :'soak_start'::timestamptz
UNION ALL
SELECT 'episodes_recovery_evidence', 'with_evidence', count(*)
FROM device_connection_episodes
WHERE resolution_evidence_at IS NOT NULL
UNION ALL
SELECT 'legacy_unplug_events', 'total', count(*)
FROM dimo_device_connection_events
WHERE event_type = 'OBD_DEVICE_UNPLUGGED';
SQL

if [[ -n "$OUT_DIR" ]]; then
  echo "==> Prisma migrate status"
  cd /opt/synqdrive/current/backend && npx prisma migrate status 2>&1 | tail -5
fi

node -e "
const soakHours = Number(process.env.SOAK_HOURS || '$SOAK_HOURS');
const minHours = Number(process.env.SOAK_MIN_HOURS || '24');
console.log(JSON.stringify({
  evaluatedAt: '$NOW_UTC',
  soakStartUtc: '$SOAK_START_UTC',
  soakHours,
  soakMinHoursRequired: minHours,
  soakDurationMet: soakHours >= minHours,
}, null, 2));
"
