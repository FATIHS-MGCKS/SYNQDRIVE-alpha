#!/usr/bin/env bash
# M3.3-H0 — static domain-separation contract checks (docs/authority; no runtime).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
F5_CONST="$ROOT/backend/src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/f5-natural-calibration-report/f5-ground-truth-correlation.constants.ts"
MIG="$ROOT/backend/prisma/migrations/20260929140000_battery_ground_truth_replacement_source_scope_unique/migration.sql"

fail() { echo "H0 contract validation FAILED: $*" >&2; exit 1; }

grep -q 'F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE: BatteryEvidenceScope =' "$F5_CONST" \
  || fail "missing F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE"
grep -q 'BatteryEvidenceScope.LV' "$F5_CONST" \
  || fail "F5 GT correlation scope must be LV"
grep -q 'LV_REST_SESSION_LONGITUDINAL_PIPELINE_V1' "$F5_CONST" \
  || fail "missing F5 longitudinal scope authority constant"

grep -q 'battery_ground_truth_one_active_replacement_per_source_event' "$MIG" \
  || fail "G2.2 replacement index must be per org+sourceServiceEvent (not scope in key)"
if grep -E 'CREATE UNIQUE INDEX "battery_ground_truth_one_active_replacement_per_source_event"' "$MIG" | grep -q 'battery_scope'; then
  fail "replacement unique index must NOT include battery_scope in key"
fi

# E3 must not be registered as production runtime path in config (flag absent or off pattern)
CONFIG="$ROOT/backend/src/config/battery-health-v2.config.ts"
if grep -qE 'E3.*ENABLED|LONGITUDINAL.*EVALUATOR.*ENABLED' "$CONFIG" 2>/dev/null; then
  grep -qE 'isBatteryV2.*E3.*Enabled.*return false|default.*false' "$CONFIG" \
    || fail "unexpected E3 production enablement in battery-health-v2.config.ts"
fi

echo "M3.3-H0 domain separation static contracts: OK"
