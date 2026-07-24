#!/usr/bin/env bash
# Read-only + controlled Data Authorization staging verification (VPS).
#
# Usage (on VPS after RC deploy):
#   bash /opt/synqdrive/current/backend/scripts/ops/verify-data-auth-staging.sh
#
# Artifacts: /opt/synqdrive/shared/staging-verification/data-authorization-2026-07-<ts>/
set -euo pipefail

ROOT="/opt/synqdrive/current"
BACKEND="${ROOT}/backend"
TS="$(date -u +%Y%m%d%H%M%S)"
OUT="/opt/synqdrive/shared/staging-verification/data-authorization-2026-07-${TS}"
mkdir -p "$OUT"

log() { echo "[verify-data-auth] $*" | tee -a "${OUT}/verify.log"; }
warn() { log "WARN: $*"; }
fail() { log "FAIL: $*"; exit 1; }

export NODE_ENV=production

cd "$BACKEND"

GIT_SHA="$(git rev-parse HEAD)"
GIT_SHORT="$(git rev-parse --short HEAD)"
log "git=${GIT_SHORT} out=${OUT}"
echo "${GIT_SHA}" > "${OUT}/verified-commit.txt"

log "==> Rollback reference"
echo "pm2 restart synqdrive after: ln -sfn /opt/synqdrive/releases/<prior> /opt/synqdrive/current" | tee "${OUT}/rollback-notes.txt"
ls -lt /opt/synqdrive/shared/backups/db-pre-data-auth-rc-*.sql.gz 2>/dev/null | head -3 | tee "${OUT}/backups-latest.txt" || true
ls -lt /opt/synqdrive/shared/backups/db-pre-deploy-*.sql.gz 2>/dev/null | head -3 | tee -a "${OUT}/backups-latest.txt" || true

log "==> PM2 processes"
pm2 jlist 2>/dev/null | tee "${OUT}/pm2.json" || pm2 list | tee "${OUT}/pm2.txt"

log "==> Safety env keys (names only)"
grep -E '^(DATA_AUTH_|RETENTION_DELETION_|METRICS_BEARER|CLICKHOUSE|WORKERS)' .env 2>/dev/null \
  | cut -d= -f1 | sort | tee "${OUT}/env-keys.txt" || true

if grep -qE '^DATA_AUTH_DECISION_DEV_BYPASS=(1|true|yes|on)' .env 2>/dev/null; then
  fail "DATA_AUTH_DECISION_DEV_BYPASS must be false in staging verification"
fi

log "==> Health"
curl -sf http://127.0.0.1:3001/api/v1/health | tee "${OUT}/health.json"

log "==> Redis"
redis-cli ping | tee "${OUT}/redis-ping.txt"

log "==> ClickHouse runtime form"
CH_URL_SET="no"
if grep -qE '^CLICKHOUSE_URL=' .env 2>/dev/null; then
  CH_URL_SET="yes"
fi
echo "clickhouse_url_configured=${CH_URL_SET}" | tee "${OUT}/clickhouse-runtime.txt"
if [[ "$CH_URL_SET" == "yes" ]]; then
  npm run clickhouse:ping:url >> "${OUT}/clickhouse-runtime.txt" 2>&1 || warn "clickhouse ping failed (optional runtime)"
else
  log "ClickHouse not configured via CLICKHOUSE_URL — retention ClickHouse adapter NOT_APPLICABLE expected"
fi

log "==> Prisma migrate status"
npx prisma migrate status 2>&1 | tee "${OUT}/prisma-migrate-status.txt"
PENDING="$(npx prisma migrate status 2>&1 | grep -c 'not yet been applied' || true)"
if [[ "$PENDING" -gt 0 ]]; then
  fail "Pending Prisma migrations detected"
fi

log "==> Privacy / data-auth schema tables"
sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -c "
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND (
    tablename IN (
      'processing_activities', 'enforcement_policies', 'data_authorization_audit_outbox',
      'data_authorization_revocation_workflows', 'data_authorization_deny_switches'
    )
    OR tablename LIKE 'processing_activity_%'
  )
ORDER BY 1;
" | tee "${OUT}/data-auth-tables.txt"

for tbl in processing_activities enforcement_policies data_authorization_audit_outbox data_authorization_revocation_workflows data_authorization_deny_switches; do
  if ! sudo -u postgres psql -d synqdrive -tAc "SELECT to_regclass('public.${tbl}')" | grep -q "${tbl}"; then
    fail "Missing table ${tbl}"
  fi
done

log "==> Metrics scrape (localhost, auth from env — token not logged)"
METRICS_CODE="$(curl -s -o "${OUT}/metrics.txt" -w '%{http_code}' \
  -H "Authorization: Bearer $(grep -E '^METRICS_BEARER_TOKEN=' .env | cut -d= -f2- | tr -d '\r')" \
  http://127.0.0.1:3001/api/v1/metrics || true)"
echo "metrics_http=${METRICS_CODE}" | tee "${OUT}/metrics-meta.txt"
if [[ "$METRICS_CODE" == "200" ]]; then
  grep -E '^data_auth_' "${OUT}/metrics.txt" | head -60 | tee "${OUT}/data-auth-metrics-sample.txt" || warn "no data_auth_* metrics yet"
  grep -E 'data_auth_build_info' "${OUT}/metrics.txt" | tee "${OUT}/build-info-metric.txt" || warn "build info metric missing"
else
  warn "metrics endpoint returned ${METRICS_CODE}"
fi

log "==> Prometheus alert group present"
if [[ -f monitoring/prometheus/alerts.yml ]]; then
  grep -n 'name: synqdrive_data_auth' monitoring/prometheus/alerts.yml | tee "${OUT}/prometheus-alert-group.txt" || warn "synqdrive_data_auth alert group not in bundled alerts.yml"
fi
curl -sf http://127.0.0.1:9090/-/healthy >/dev/null && echo "prometheus_healthy=yes" | tee "${OUT}/prometheus-health.txt" || warn "prometheus not reachable on :9090"

log "==> CI safety scripts (unit-level)"
bash scripts/test/verify-data-auth-monitoring.sh 2>&1 | tee "${OUT}/monitoring-verify.txt"
bash scripts/test/data-auth-production-safety-check.sh 2>&1 | tee "${OUT}/production-safety.txt"

log "==> Controlled runtime scenarios (isolated test tenant)"
npx ts-node -r tsconfig-paths/register scripts/ops/run-data-auth-staging-runtime-tests.ts 2>&1 | tee "${OUT}/runtime-tests.jsonl"

log "==> Verification complete — artifacts in ${OUT}"
