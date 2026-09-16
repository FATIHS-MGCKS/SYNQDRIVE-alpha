#!/usr/bin/env bash
# RFRF F10.1.1 script-level operational contract tests — fixtures/mocks only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "CONTRACT_FAIL: $*" >&2; exit 1; }
pass() { echo "CONTRACT_PASS: $*"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

export RFRF_FIXTURE_MODE=1
export DRY_RUN=1
export RFRF_REQUIRED_GIT_SHA="${RFRF_REQUIRED_GIT_SHA:-fixturesha000000000000000000000000000000000000}"
export SYNQDRIVE_CURRENT_LINK="$REPO_ROOT"
export BACKEND_ENV="${TMP_DIR}/backend.env"
export PROM_DIR="${TMP_DIR}/prometheus"

mkdir -p "$PROM_DIR"
cat >"$BACKEND_ENV" <<EOF
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
METRICS_BEARER_TOKEN=fixture-token
EOF

cp "$REPO_ROOT/backend/monitoring/prometheus/prometheus.vps.yml" "$PROM_DIR/prometheus.yml"
cp "$REPO_ROOT/backend/monitoring/prometheus/alerts.yml" "$PROM_DIR/alerts.yml"

PROM_FIXTURE_DIR="${TMP_DIR}/prom-fixtures"
mkdir -p "$PROM_FIXTURE_DIR"
cat >"${PROM_FIXTURE_DIR}/targets.json" <<'JSON'
{"status":"success","data":{"activeTargets":[
  {"scrapeUrl":"http://127.0.0.1:3001/api/v1/metrics","health":"up","labels":{"job":"synqdrive-backend","replica":"a"}},
  {"scrapeUrl":"http://127.0.0.1:3002/api/v1/metrics","health":"up","labels":{"job":"synqdrive-backend","replica":"b"}}
]}}
JSON
cat >"${PROM_FIXTURE_DIR}/rules.json" <<'JSON'
{"status":"success","data":{"groups":[{"name":"synqdrive_physical_refuel","rules":[
  {"name":"PhysicalRefuelOrphanBacklogPersistent","health":"ok"},
  {"name":"PhysicalRefuelLostEnqueueBacklogPersistent","health":"ok"},
  {"name":"PhysicalRefuelStaleEnrichmentBacklogPersistent","health":"ok"},
  {"name":"PhysicalRefuelRecoverySchedulerStale","health":"ok"},
  {"name":"PhysicalRefuelRecoveryFailuresElevated","health":"ok"}
]}]}}
JSON
export RFRF_PROMETHEUS_FIXTURE_DIR="$PROM_FIXTURE_DIR"

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

# 1) Stage0 -> Stage1 dry-run with explicit cutover
export RFRF_STAGE=1
export RFRF_CUTOVER_AT="2026-09-15T20:00:00.000Z"
if bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1 | tee "${TMP_DIR}/stage1-dry.log" | grep -q 'RFRF_STAGE_DRY_RUN=PASS'; then
  pass "stage0->stage1 dry-run explicit cutover"
else
  fail "stage0->stage1 dry-run"
fi

# 2) Stage1 absent cutover blocks
if rfrf_assert_can_enter_stage 1 "$BACKEND_ENV" "" 2>/dev/null; then
  fail "stage1 absent cutover should block"
else
  pass "stage1 absent cutover blocks"
fi

# 3) invalid cutover blocks
if rfrf_assert_can_enter_stage 1 "$BACKEND_ENV" "bad-ts" 2>/dev/null; then
  fail "invalid cutover should block"
else
  pass "invalid cutover blocks"
fi

# 4) Stage1 -> Stage2 dry-run
rfrf_apply_stage_mutations 1 "$BACKEND_ENV" "2026-09-15T20:00:00.000Z"
export RFRF_STAGE=2
unset RFRF_CUTOVER_AT
if bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1 | grep -q 'RFRF_STAGE_DRY_RUN=PASS'; then
  pass "stage1->stage2 dry-run"
else
  fail "stage1->stage2 dry-run"
fi

# 5) skip stage1 blocks stage2 from stage0
cat >"$BACKEND_ENV" <<EOF
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
METRICS_BEARER_TOKEN=fixture-token
EOF
if rfrf_assert_can_enter_stage 2 "$BACKEND_ENV" 2>/dev/null; then
  fail "skip stage1 should block"
else
  pass "skip stage1 blocks"
fi

# 6) missing deploy SHA blocks (non-fixture)
export RFRF_REQUIRED_GIT_SHA=
unset RFRF_FIXTURE_MODE
unset DRY_RUN
if rfrf_require_approved_deploy_sha 2>/dev/null; then
  fail "missing deploy sha should block"
else
  pass "missing deploy sha blocks"
fi
export RFRF_REQUIRED_GIT_SHA=fixturesha000000000000000000000000000000000000
export RFRF_FIXTURE_MODE=1
export DRY_RUN=1

# 7) wrong deploy sha blocks when verifiable current link exists
unset RFRF_FIXTURE_MODE
unset DRY_RUN
export RFRF_REQUIRED_GIT_SHA=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
if rfrf_verify_deploy_sha "$REPO_ROOT" "$RFRF_REQUIRED_GIT_SHA" 2>/dev/null; then
  fail "wrong deploy sha should block"
else
  pass "wrong deploy sha blocks"
fi
export RFRF_REQUIRED_GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
export RFRF_FIXTURE_MODE=1
export DRY_RUN=1

# 8) monitoring apply cannot silently dry-run
sync_out="$(bash "${OPS}/rfrf-monitoring-sync-alerts.sh" --apply 2>&1 || true)"
if [[ "$sync_out" == *"RFRF_MONITORING_SYNC=BLOCKED"* ]]; then
  pass "monitoring apply without auth blocks"
else
  fail "monitoring apply without auth should block"
fi

# 9) monitoring --apply with ACK but without mutation mode blocks
export RFRF_MONITORING_SYNC_ACK=YES
sync_out="$(bash "${OPS}/rfrf-monitoring-sync-alerts.sh" --apply 2>&1 || true)"
if [[ "$sync_out" == *"RFRF_MONITORING_MUTATION=PRODUCTION"* ]]; then
  pass "monitoring apply incomplete mutation authorization blocks"
else
  fail "monitoring apply incomplete auth should block"
fi
unset RFRF_MONITORING_SYNC_ACK

# 10) monitoring --check zero mutation
check_out="$(bash "${OPS}/rfrf-monitoring-sync-alerts.sh" --check 2>&1 || true)"
if [[ "$check_out" == *"CHECK_ONLY=1"* ]]; then
  pass "monitoring check zero mutation"
else
  fail "monitoring check should not mutate"
fi

# 11) live observability gate with fixture
rfrf_verify_live_observability_gates "$PROM_DIR/prometheus.yml" || fail "fixture live observability"
pass "live prometheus fixture gates"

# 12) blast assessment process failure blocks stage5 path
export RFRF_BLAST_RADIUS_PASS=0
export DATABASE_URL=""
blast_out="$(bash "${OPS}/rfrf-production-blast-radius-assessment.sh" 2>&1 || true)"
if [[ "$blast_out" == *"BLAST_RADIUS=BLOCKED"* ]]; then
  pass "blast assessment db failure blocks"
else
  fail "blast assessment db failure should block"
fi

# 13) operator pass cannot override incomplete assessment (enable-stage stage5)
cat >"$BACKEND_ENV" <<EOF
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=2026-09-15T20:00:00.000Z
RAW_FUEL_REFUEL_FALLBACK_ENABLED=true
RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED=true
RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED=true
METRICS_BEARER_TOKEN=fixture-token
EOF
export RFRF_STAGE=5
export RFRF_BLAST_RADIUS_PASS=1
export DRY_RUN=1
stage5_out="$(bash "${OPS}/rfrf-production-enable-stage.sh" 2>&1 || true)"
if [[ "$stage5_out" == *"blast-radius assessment failed"* || "$stage5_out" == *"BLAST_RADIUS=BLOCKED"* ]]; then
  pass "operator pass cannot override failed assessment"
else
  fail "failed assessment must block stage5 even with operator pass"
fi

# 14) rollback dry-run non-destructive
export DRY_RUN=1
rollback_out="$(bash "${OPS}/rfrf-production-rollback.sh" --from-stage 2 2>&1 || true)"
if [[ "$rollback_out" == *"RFRF_ROLLBACK_DRY_RUN=PASS"* ]]; then
  pass "rollback dry-run non-destructive"
else
  fail "rollback dry-run"
fi

# 15) no production paths touched
[[ "$BACKEND_ENV" == "${TMP_DIR}/backend.env" ]] || fail "tests must use temp backend.env"
[[ "$PROM_DIR" == "${TMP_DIR}/prometheus" ]] || fail "tests must use temp prom dir"
pass "no production state touched by tests"

# 16) preflight must not source backend.env (literal $share fixture)
cat >"$BACKEND_ENV" <<EOF
HM_HEALTH_APP_MQTT_TOPIC=\$share/synqdrive/health
METRICS_BEARER_TOKEN=fixture-token
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture?schema=public
PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=true
PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT=2026-09-04T12:00:00.000Z
EOF
preflight_out="$(bash "${OPS}/rfrf-production-preflight.sh" --check --live-required 2>&1 || true)"
if [[ "$preflight_out" == *"backend.env:"* && "$preflight_out" == *"unbound variable"* ]]; then
  fail "preflight sourced backend.env on literal \$share"
fi
if [[ "$preflight_out" != *"live_required=1"* ]]; then
  fail "preflight missing live_required mode"
fi
pass "preflight dotenv-safe with live-required flag"

echo "rfrf-f10-operational-script-contracts: OK"
