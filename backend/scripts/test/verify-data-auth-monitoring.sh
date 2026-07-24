#!/usr/bin/env bash
# Verify data-auth Prometheus metrics, alert rules, and Grafana dashboard artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> Data-auth metrics unit tests"
npm test -- --testPathPattern='data-auth-metrics.service.spec' --runInBand

echo "==> Prometheus alert group synqdrive_data_auth"
if ! rg -q 'name: synqdrive_data_auth' monitoring/prometheus/alerts.yml; then
  echo "Missing alert group synqdrive_data_auth" >&2
  exit 1
fi

for metric in \
  data_auth_decision_total \
  data_auth_audit_dead_letter_total \
  data_auth_dev_bypass_enabled \
  data_auth_unregistered_path_total \
  data_auth_build_info; do
  if ! rg -q "$metric" monitoring/prometheus/alerts.yml monitoring/grafana/dashboards/synqdrive-data-authorization.json src/modules/data-authorizations/observability/; then
    echo "Expected metric reference missing: $metric" >&2
    exit 1
  fi
done

echo "==> Grafana dashboard present"
test -f monitoring/grafana/dashboards/synqdrive-data-authorization.json

echo "==> Data authorization monitoring verification complete"
