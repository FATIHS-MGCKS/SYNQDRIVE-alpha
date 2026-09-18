#!/usr/bin/env bash
# RFRF F10.1 operational tooling gate — local/CI safe (no production mutation).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND="$REPO_ROOT/backend"
cd "$BACKEND"

echo "==> F10.1 operational tooling selftest"
bash scripts/ops/rfrf-production-rollout.selftest.sh

echo "==> F10.1.1 script-level operational contracts"
bash scripts/test/rfrf-f10-operational-script-contracts.sh

echo "==> F10.2.1 dotenv safety tests"
bash scripts/test/rfrf-f10-dotenv-safety-tests.sh

echo "==> F10.2.1.1 worker readiness contract tests"
bash scripts/test/rfrf-f10-worker-readiness-contracts.sh

echo "==> F10.2.2 metrics probe regression tests"
bash scripts/test/rfrf-f10-metrics-probe-regression.sh

echo "==> F10.3.0 Stage-1 restart safety tests"
bash scripts/test/rfrf-f10-stage1-restart-safety-tests.sh

echo "==> Shell syntax validation"
for f in \
  scripts/ops/lib/rfrf-production-rollout.lib.sh \
  scripts/ops/rfrf-production-preflight.sh \
  scripts/ops/rfrf-production-blast-radius-assessment.sh \
  scripts/ops/rfrf-production-enable-stage.sh \
  scripts/ops/rfrf-production-rollback.sh \
  scripts/ops/rfrf-monitoring-verify-alerts.sh \
  scripts/ops/rfrf-monitoring-sync-alerts.sh; do
  bash -n "$f"
done
bash -n scripts/test/rfrf-f10-operational-script-contracts.sh
bash -n scripts/test/rfrf-f10-dotenv-safety-tests.sh
bash -n scripts/test/rfrf-f10-worker-readiness-contracts.sh
bash -n scripts/test/rfrf-f10-metrics-probe-regression.sh
bash -n scripts/test/rfrf-f10-stage1-restart-safety-tests.sh

if command -v shellcheck >/dev/null 2>&1; then
  echo "==> shellcheck (ops scripts)"
  shellcheck -x scripts/ops/lib/rfrf-production-rollout.lib.sh
  shellcheck scripts/ops/rfrf-production-preflight.sh
  shellcheck scripts/ops/rfrf-production-enable-stage.sh
  shellcheck scripts/ops/rfrf-production-rollback.sh
  shellcheck scripts/ops/rfrf-monitoring-verify-alerts.sh
fi

echo "==> Monitoring verify (repo-only)"
SYNQDRIVE_CURRENT_LINK="$REPO_ROOT" bash scripts/ops/rfrf-monitoring-verify-alerts.sh --check || {
  echo "WARN: loaded production alerts not present locally — verifying repo subset only"
  source scripts/ops/lib/rfrf-production-rollout.lib.sh
  rfrf_verify_repo_alerts_subset "$(rfrf_repo_alerts_file "$REPO_ROOT")"
  rfrf_observability_topology_check "$REPO_ROOT/backend/monitoring/prometheus/prometheus.vps.yml"
}

echo "==> Existing cutover semantics (unchanged runtime)"
npm test -- --runInBand --forceExit --testPathPattern=raw-refuel-promotion-cutover.util.spec 2>/dev/null | tail -5

echo "==> Prometheus config unit tests"
npm test -- --runInBand --forceExit --testPathPattern=prometheus-config.spec 2>/dev/null | tail -5

echo "==> Backend build"
npm run build

echo "==> Prisma validate"
npx prisma validate

echo "==> EED graph validator"
node "$REPO_ROOT/architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs"

echo "==> Module registry validator"
bash "$REPO_ROOT/architecture/scripts/validate-module-registry.sh"

echo "==> git diff --check"
git diff --check

echo "RFRF F10.1 operational tooling gate PASS"
echo "RFRF F10.2.1 dotenv safety micro-closure gate PASS"
echo "RFRF F10.2.2 metrics probe reliability gate PASS"
echo "RFRF F10.3.0 Stage-1 restart safety gate PASS"
