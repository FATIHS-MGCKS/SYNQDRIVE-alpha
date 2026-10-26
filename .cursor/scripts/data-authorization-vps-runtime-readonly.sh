#!/usr/bin/env bash
# Read-only VPS runtime inventory for Data Authorization remediation (Prompt 3/44).
# Safe to run: no restarts, no writes, no migrations, no secret output.
set -uo pipefail

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
VPS_USER="${CLOUD_AGENT_SSH_USER:-root}"

mask_stream() {
  sed -E \
    -e 's/(password|secret|token|key|Bearer)=[^ ]+/\1=[REDACTED]/Ig' \
    -e 's/postgresql:\/\/[^@]+@/postgresql:\/\/[REDACTED]@/g' \
    -e 's/--token [^ ]+/--token [REDACTED]/g'
}

echo "[readonly] Target: ${VPS_USER}@${VPS_HOST}"
echo "[readonly] Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

ssh -o BatchMode=yes -o ConnectTimeout=20 "${VPS_USER}@${VPS_HOST}" 'bash -s' << 'REMOTE' | mask_stream
set -uo pipefail

section() { echo ""; echo "===== $1 ====="; }

section "META"
hostname; date -u +%Y-%m-%dT%H:%M:%SZ; uptime -p 2>/dev/null || uptime

section "OS_RESOURCES"
uname -a
free -h | head -2
df -hT / /opt 2>/dev/null || df -h /
nproc

section "SYSTEMD"
systemctl list-units --type=service --all 2>/dev/null | grep -iE 'synq|dimo|clickhouse|redis|postgres|grafana|prometheus|nginx|caddy|cloudflare' || true
systemctl list-timers --all 2>/dev/null | head -12

section "DOCKER"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo no-docker

section "PM2"
pm2 list 2>/dev/null || true
pm2 describe synqdrive 2>/dev/null | grep -E 'status|script path|exec cwd|restarts|uptime|error log|out log' || true

section "DEPLOY"
readlink -f /opt/synqdrive/current 2>/dev/null || true
git -C /opt/synqdrive/current rev-parse HEAD 2>/dev/null || true
git -C /opt/synqdrive/current log -1 --oneline 2>/dev/null || true
ls -1dt /opt/synqdrive/releases/* 2>/dev/null | head -8 || true
echo "release_count=$(ls -1d /opt/synqdrive/releases/* 2>/dev/null | wc -l)"
for rel in $(ls -1dt /opt/synqdrive/releases/* 2>/dev/null | head -5); do
  echo "REL $(basename "$rel") $(git -C "$rel" rev-parse --short HEAD 2>/dev/null) built=$([ -f "$rel/backend/dist/src/main.js" ] && echo yes || echo no)"
done

section "PORTS_PROCESSES"
ss -tlnp 2>/dev/null | grep -E ':(3001|5432|6379|8123|9000|9090|3000|80|443)\b' || ss -tlnp | head -15
ps aux | grep -E 'node.*main.js|postgres|redis|clickhouse|nginx|prometheus|grafana' | grep -v grep | awk '{print $1,$2,$11,$12,$13}' | head -20

section "HEALTH"
curl -sf -m 5 http://127.0.0.1:3001/api/v1/health 2>/dev/null | head -c 400 || echo local_health=DOWN
echo
curl -sf -m 8 -o /dev/null -w 'public_health_http=%{http_code}\n' https://app.synqdrive.eu/api/v1/health 2>/dev/null || echo public_health=fail

section "PROXY"
systemctl is-active nginx 2>/dev/null || true
pgrep -a cloudflared 2>/dev/null | sed 's/--token [^ ]*/--token [REDACTED]/g' | head -2 || echo no-cloudflared

section "STORAGE"
ls -la /opt/synqdrive/shared 2>/dev/null | head -12 || true
ls -la /opt/synqdrive/current/backend/storage 2>/dev/null | head -6 || true
ls -la /root/.pm2/logs 2>/dev/null | head -8 || true

section "POSTGRESQL_COUNTS"
sudo -u postgres psql -d synqdrive -Atqc "
SELECT 'vehicles='||count(*) FROM vehicles;
SELECT 'dimo_linked='||count(*) FROM vehicles WHERE dimo_vehicle_id IS NOT NULL;
SELECT 'org_data_authorizations='||count(*) FROM org_data_authorizations;
SELECT 'oda_active='||count(*) FROM org_data_authorizations WHERE status='ACTIVE';
SELECT 'oda_revoked='||count(*) FROM org_data_authorizations WHERE status='REVOKED';
SELECT 'dimo_telemetry_auth='||count(*) FROM org_data_authorizations WHERE system_key='DIMO_TELEMETRY';
SELECT 'vpc_active='||count(*) FROM vehicle_provider_consents WHERE status='ACTIVE';
SELECT 'vpc_dimo='||count(*) FROM vehicle_provider_consents WHERE provider='DIMO' AND status='ACTIVE';
SELECT 'vpc_hm='||count(*) FROM vehicle_provider_consents WHERE provider='HIGH_MOBILITY' AND status='ACTIVE';
" 2>/dev/null || true

section "REDIS_QUEUES"
redis-cli PING 2>/dev/null || true
for q in dimo.snapshot.poll dimo.dtc.poll dimo.trip-tracking trip.behavior.enrichment notification.evaluation notification.delivery connectivity.webhook.process document.extraction driving.intelligence.jobs battery.v2 dimo.vehicle.sync voice.webhook.process; do
  w=$(redis-cli LLEN "bull:${q}:wait" 2>/dev/null || echo -1)
  a=$(redis-cli LLEN "bull:${q}:active" 2>/dev/null || echo -1)
  d=$(redis-cli ZCARD "bull:${q}:delayed" 2>/dev/null || echo -1)
  f=$(redis-cli ZCARD "bull:${q}:failed" 2>/dev/null || echo -1)
  echo "Q ${q} wait=${w} active=${a} delayed=${d} failed=${f}"
done

section "CLICKHOUSE"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi clickhouse; then
  chc=$(docker ps --format '{{.Names}}' | grep -i clickhouse | head -1)
  docker exec "$chc" clickhouse-client --query "SELECT version()" 2>/dev/null || true
  docker exec "$chc" clickhouse-client --query "SHOW TABLES FROM default" 2>/dev/null | head -15 || true
else
  echo clickhouse_container_not_found
fi

section "FEATURE_FLAGS_BOOL"
for k in DATA_RETENTION_ENABLED HF_MIRROR_ENABLED WAYPOINT_MIRROR_ENABLED NOTIFICATIONS_V2 NOTIFICATIONS_DELIVERY_ENABLED VOICE_MCP_GATEWAY VOICE_WEBHOOK_INGESTION_ENABLED HM_HEALTH_APP_MQTT_ENABLED HM_TELEMETRY_APP_MQTT_ENABLED DOCUMENT_EXTRACTION_QUEUE_ENABLED CLICKHOUSE_TRIP_ASSIST_ENABLED DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED; do
  v=$(grep -m1 "^${k}=" /opt/synqdrive/shared/backend.env 2>/dev/null | cut -d= -f2-)
  echo "$k=$v"
done

section "DATA_AUTH_ENV"
grep -iE 'data.auth|data_auth|consent.enforce|authorization.enforce' /opt/synqdrive/shared/backend.env 2>/dev/null | cut -d= -f1 | sed 's/$/=***PRESENT***/' || echo no_data_auth_env_keys

section "PM2_ERROR_TAIL"
tail -12 /root/.pm2/logs/synqdrive-error.log 2>/dev/null || true
REMOTE

echo "[readonly] Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
