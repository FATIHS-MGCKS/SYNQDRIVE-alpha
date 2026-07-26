#!/usr/bin/env bash
# Post-deploy VPS ops for Master Admin P0/P1 remediation (Phase 2G).
# Run on the VPS as synqdrive-admin (sudo where noted) AFTER vps-deploy-release.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"

echo "==> SynqDrive post-remediation ops ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
echo "    current=${CURRENT}"

# Sub-scripts read DATABASE_URL and the ClickHouse credentials from the
# environment; on the VPS those live in the shared backend env.
#
# Read the keys literally instead of sourcing the file: values are not shell
# quoted, and at least one (the MQTT `$share/...` topic) would be expanded as a
# variable. Sourcing a secrets file also executes whatever it contains.
export_env_keys() {
  local file="$1"; shift
  local key line value
  for key in "$@"; do
    line="$(grep -m1 -E "^${key}=" "$file" || true)"
    [[ -z "$line" ]] && continue
    value="${line#*=}"
    if [[ ${#value} -ge 2 ]] &&
      { [[ "$value" == \"*\" ]] || [[ "$value" == \'*\' ]]; }; then
      value="${value:1:${#value}-2}"
    fi
    [[ -z "$value" ]] && continue
    export "${key}=${value}"
  done
}

BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
if [[ -r "$BACKEND_ENV" ]]; then
  export_env_keys "$BACKEND_ENV" \
    DATABASE_URL \
    CLICKHOUSE_URL CLICKHOUSE_HOST CLICKHOUSE_PORT \
    CLICKHOUSE_USER CLICKHOUSE_PASSWORD CLICKHOUSE_DATABASE \
    REDIS_HOST REDIS_PORT REDIS_PASSWORD
  echo "    env=${BACKEND_ENV} (loaded: DATABASE_URL=${DATABASE_URL:+set} CLICKHOUSE_USER=${CLICKHOUSE_USER:-unset})"
else
  echo "    WARN: ${BACKEND_ENV} not readable — steps needing DATABASE_URL/CLICKHOUSE_* will be skipped"
fi

run() {
  echo ""
  echo ">>> $*"
  "$@"
}

# 1) Monitoring stack (Alertmanager + node exporter refresh)
if [[ -x "${OPS}/vps-refresh-monitoring.sh" ]]; then
  run sudo bash "${OPS}/vps-refresh-monitoring.sh" || echo "WARN: monitoring refresh failed"
fi

# 2) ClickHouse org_id backfill (after migration 007)
if [[ -x "${OPS}/vps-clickhouse-backfill-org-id.sh" ]]; then
  run bash "${OPS}/vps-clickhouse-backfill-org-id.sh" || echo "WARN: CH org_id backfill failed"
fi

# 3) Backup crons (idempotent installers)
if [[ -x "${OPS}/vps-install-clickhouse-backup-cron.sh" ]]; then
  run sudo bash "${OPS}/vps-install-clickhouse-backup-cron.sh" || true
fi
if [[ -x "${OPS}/vps-install-redis-backup-cron.sh" ]]; then
  run sudo bash "${OPS}/vps-install-redis-backup-cron.sh" || true
fi
if [[ -x "${OPS}/vps-install-offsite-backup-cron.sh" ]]; then
  run sudo bash "${OPS}/vps-install-offsite-backup-cron.sh" || true
fi

# 4) Optional: first CH backup if env configured
if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]] && [[ -x "${OPS}/vps-backup-clickhouse.sh" ]]; then
  run sudo bash "${OPS}/vps-backup-clickhouse.sh" || echo "WARN: initial CH backup failed"
fi

# 5) BullMQ battery.v2 failed job inspection
if [[ -x "${OPS}/vps-inspect-bullmq-redis.sh" ]]; then
  run bash "${OPS}/vps-inspect-bullmq-redis.sh" || true
fi

# 6) Acceptance audit bundle (read-only)
if [[ -x "${OPS}/vps-clickhouse-acceptance-audit.sh" ]]; then
  run bash "${OPS}/vps-clickhouse-acceptance-audit.sh" || echo "WARN: CH acceptance audit reported issues"
fi

echo ""
echo "==> Post-remediation ops finished"
echo "    Verify: curl -s https://app.synqdrive.eu/api/v1/health"
echo "    Swagger should be disabled: curl -o /dev/null -w '%{http_code}' https://app.synqdrive.eu/docs"
