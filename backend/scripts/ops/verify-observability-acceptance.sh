#!/usr/bin/env bash
# Observability production-readiness acceptance checks (Phase 2F.9).
#
# Modes:
#   REPO_ONLY=1 (default) — artifact + unit-test gate (CI / pre-merge)
#   LIVE=1              — probe Prometheus, Alertmanager, health endpoints
#
# Test alarm (optional):
#   SEND_TEST_ALERT=1 ALERTMANAGER_URL=http://127.0.0.1:9093 bash verify-observability-acceptance.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_ROOT/.." && pwd)"

REPO_ONLY="${REPO_ONLY:-1}"
LIVE="${LIVE:-0}"
SEND_TEST_ALERT="${SEND_TEST_ALERT:-0}"
HEALTH_URL="${HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"
READINESS_URL="${READINESS_URL:-https://app.synqdrive.eu/api/v1/health/readiness}"
DEPENDENCIES_URL="${DEPENDENCIES_URL:-https://app.synqdrive.eu/api/v1/health/dependencies}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://127.0.0.1:9090}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://127.0.0.1:9093}"

fail=0
warn=0

ok() { echo "OK   $*"; }
warn_msg() { echo "WARN $*"; warn=$((warn + 1)); }
fail_msg() { echo "FAIL $*"; fail=$((fail + 1)); }

check_file() {
  local path="$1" label="$2"
  if [[ -f "$path" ]]; then ok "$label"; else fail_msg "missing $label ($path)"; fi
}

echo "==> SynqDrive Observability Acceptance (2F.9)"
echo "    repo: $REPO_ROOT"
echo ""

echo "==> Prometheus artifacts"
check_file "$BACKEND_ROOT/monitoring/prometheus/prometheus.vps.yml" "prometheus.vps.yml"
check_file "$BACKEND_ROOT/monitoring/prometheus/prometheus.docker.yml" "prometheus.docker.yml"
check_file "$BACKEND_ROOT/monitoring/prometheus/alerts.yml" "alerts.yml"
check_file "$BACKEND_ROOT/monitoring/prometheus/alerts-infra.yml" "alerts-infra.yml"
check_file "$BACKEND_ROOT/monitoring/prometheus/alerts-workers.yml" "alerts-workers.yml"

if grep -q 'alerts-app-health.yml' "$BACKEND_ROOT/monitoring/prometheus/prometheus.vps.yml" 2>/dev/null; then
  check_file "$BACKEND_ROOT/monitoring/prometheus/alerts-app-health.yml" "alerts-app-health.yml"
else
  warn_msg "alerts-app-health.yml not wired in prometheus.vps.yml (merge 2F.5)"
fi

if grep -q 'alerts-slo.yml' "$BACKEND_ROOT/monitoring/prometheus/prometheus.vps.yml" 2>/dev/null; then
  check_file "$BACKEND_ROOT/monitoring/prometheus/alerts-slo.yml" "alerts-slo.yml"
else
  warn_msg "alerts-slo.yml not wired in prometheus.vps.yml (merge 2F.7)"
fi

for job in synqdrive-backend node postgres redis clickhouse; do
  if grep -q "job_name: $job" "$BACKEND_ROOT/monitoring/prometheus/prometheus.vps.yml" 2>/dev/null; then
    ok "VPS scrape job: $job"
  else
    fail_msg "VPS scrape job missing: $job"
  fi
done

if grep -q 'alertmanager:9093\|127.0.0.1:9093' "$BACKEND_ROOT/monitoring/prometheus/prometheus.vps.yml" 2>/dev/null; then
  ok "Alertmanager wired in prometheus.vps.yml"
else
  fail_msg "Alertmanager not wired in prometheus.vps.yml"
fi

echo ""
echo "==> Alertmanager artifacts"
check_file "$BACKEND_ROOT/monitoring/alertmanager/alertmanager.yml.example" "alertmanager.yml.example"
check_file "$BACKEND_ROOT/monitoring/alertmanager/templates/synqdrive.tmpl" "alertmanager templates"
check_file "$BACKEND_ROOT/scripts/ops/vps-setup-alertmanager.sh" "vps-setup-alertmanager.sh"

echo ""
echo "==> Grafana artifacts"
GRAFANA_DIR="$BACKEND_ROOT/monitoring/grafana/dashboards"
dashboard_count="$(find "$GRAFANA_DIR" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$dashboard_count" -ge 7 ]]; then
  ok "Grafana dashboards present ($dashboard_count JSON files)"
else
  fail_msg "Grafana dashboards insufficient ($dashboard_count < 7)"
fi

for dash in synqdrive-platform-overview synqdrive-infrastructure synqdrive-queues-workers; do
  if [[ -f "$GRAFANA_DIR/${dash}.json" ]]; then
    ok "Grafana dashboard: $dash"
  else
    warn_msg "Grafana dashboard missing: $dash (merge 2F.6)"
  fi
done

check_file "$BACKEND_ROOT/monitoring/grafana/provisioning/datasources/prometheus.yml" "Grafana datasource provisioning"
check_file "$BACKEND_ROOT/scripts/ops/vps-setup-grafana.sh" "vps-setup-grafana.sh"

echo ""
echo "==> Health / application probes"
check_file "$BACKEND_ROOT/src/modules/health/health.controller.ts" "health.controller.ts"
if [[ -f "$BACKEND_ROOT/src/modules/health/application-health.service.ts" ]]; then
  ok "ApplicationHealthService (2F.5)"
else
  warn_msg "ApplicationHealthService not present (merge 2F.5)"
fi

echo ""
echo "==> Worker / scheduler observability"
check_file "$BACKEND_ROOT/src/modules/worker-observability/worker-observability.module.ts" "worker-observability module"
check_file "$BACKEND_ROOT/src/modules/observability/queue-monitoring.service.ts" "queue-monitoring service"

echo ""
echo "==> Remediation / runbook docs"
for doc in \
  observability-architecture.md \
  alertmanager.md \
  infrastructure-monitoring.md \
  worker-observability.md \
  application-health.md \
  grafana-production.md \
  service-level-objectives.md \
  observability-production-readiness.md; do
  if [[ -f "$REPO_ROOT/docs/remediation/$doc" ]]; then
    ok "docs/remediation/$doc"
  else
    if [[ "$doc" == "observability-production-readiness.md" ]]; then
      fail_msg "missing docs/remediation/$doc"
    else
      warn_msg "missing docs/remediation/$doc (phase branch not merged)"
    fi
  fi
done

echo ""
echo "==> Unit tests"
if (cd "$BACKEND_ROOT" && npm test -- --testPathPattern='prometheus-config|worker-observability' --silent 2>/dev/null); then
  ok "prometheus-config + worker-observability tests"
else
  fail_msg "observability unit tests failed"
fi

if [[ "$LIVE" == "1" || "$REPO_ONLY" != "1" ]]; then
  echo ""
  echo "==> Live probes"

  if curl -sf "$HEALTH_URL" >/dev/null; then
    ok "GET $HEALTH_URL"
  else
    fail_msg "GET $HEALTH_URL unreachable"
  fi

  readiness_code="$(curl -sf -o /dev/null -w '%{http_code}' "$READINESS_URL" || echo 000)"
  if [[ "$readiness_code" == "200" ]]; then
    ok "GET $READINESS_URL → 200"
  elif [[ "$readiness_code" == "503" ]]; then
    warn_msg "GET $READINESS_URL → 503 (not ready)"
  else
    fail_msg "GET $READINESS_URL → $readiness_code"
  fi

  dep_code="$(curl -sf -o /dev/null -w '%{http_code}' "$DEPENDENCIES_URL" 2>/dev/null || true)"
  dep_code="${dep_code:-000}"
  if [[ "$dep_code" == "200" ]]; then
    ok "GET $DEPENDENCIES_URL → 200"
  elif [[ "$dep_code" == "404" ]]; then
    warn_msg "GET $DEPENDENCIES_URL → 404 (2F.5 not deployed)"
  else
    warn_msg "GET $DEPENDENCIES_URL → $dep_code"
  fi

  if curl -sf "$PROMETHEUS_URL/-/healthy" >/dev/null 2>&1; then
    ok "Prometheus healthy ($PROMETHEUS_URL)"
    rule_groups="$(curl -sf "$PROMETHEUS_URL/api/v1/rules" | grep -c '"name":' || echo 0)"
    ok "Prometheus rule groups loaded (~$rule_groups name fields in /api/v1/rules)"
  else
    warn_msg "Prometheus not reachable at $PROMETHEUS_URL (expected on VPS localhost)"
  fi

  if curl -sf "$ALERTMANAGER_URL/-/healthy" >/dev/null 2>&1; then
    ok "Alertmanager healthy ($ALERTMANAGER_URL)"
  else
    warn_msg "Alertmanager not reachable at $ALERTMANAGER_URL"
  fi
fi

if [[ "$SEND_TEST_ALERT" == "1" ]]; then
  echo ""
  echo "==> Test alarm injection"
  payload='[{"labels":{"alertname":"SynqDriveObservabilityAcceptanceTest","severity":"warning","component":"acceptance","owner":"platform"},"annotations":{"summary":"2F.9 observability acceptance test alert","description":"Safe to ignore — injected by verify-observability-acceptance.sh"}}]'
  if curl -sf -X POST -H 'Content-Type: application/json' -d "$payload" "$ALERTMANAGER_URL/api/v2/alerts" >/dev/null; then
    ok "Test alert POST $ALERTMANAGER_URL/api/v2/alerts"
    sleep 2
    if curl -sf "$ALERTMANAGER_URL/api/v2/alerts" | grep -q 'SynqDriveObservabilityAcceptanceTest'; then
      ok "Test alert visible in Alertmanager"
    else
      warn_msg "Test alert not found in Alertmanager API (may have routed to null receiver)"
    fi
  else
    fail_msg "Test alert POST failed — is Alertmanager running?"
  fi
fi

echo ""
echo "==> Summary: failures=$fail warnings=$warn"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
exit 0
