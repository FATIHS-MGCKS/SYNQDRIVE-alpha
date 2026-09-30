#!/usr/bin/env bash
# M3.3-HV-H2 — static contract checks (read-only CLI; no automatic runtime; no LV pipeline imports).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HV_H2="$ROOT/backend/src/modules/vehicle-intelligence/battery-health/hv-h2"
BATTERY_HEALTH="$ROOT/backend/src/modules/vehicle-intelligence/battery-health"
APP_MODULE="$ROOT/backend/src/app.module.ts"

fail() { echo "H2 contract validation FAILED: $*" >&2; exit 1; }

test -d "$HV_H2" || fail "missing hv-h2 module directory"

grep -q 'M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1' "$HV_H2/m3-3-hv-h2.constants.ts" \
  || fail "missing H2 candidate contract version"
grep -q 'METHOD_IDENTITY_REQUIRED = true' "$HV_H2/m3-3-hv-h2.constants.ts" \
  || fail "METHOD_IDENTITY_REQUIRED must be true"
grep -q 'CROSS_METHOD_POOLING_DEFAULT = false' "$HV_H2/m3-3-hv-h2.constants.ts" \
  || fail "CROSS_METHOD_POOLING_DEFAULT must be false"
grep -q "HV_H2_BATTERY_SCOPE = 'HV'" "$HV_H2/m3-3-hv-h2.constants.ts" \
  || fail "H2 batteryScope must be HV"
grep -q 'H2_AUTOMATIC_RUNTIME_REACHABLE = false' "$HV_H2/m3-3-hv-h2.constants.ts" \
  || fail "H2_AUTOMATIC_RUNTIME_REACHABLE must be false"
grep -q 'H2_OPERATOR_CLI_REACHABLE = true' "$HV_H2/m3-3-hv-h2.constants.ts" \
  || fail "H2_OPERATOR_CLI_REACHABLE must be true"
test -f "$HV_H2/m3-3-hv-h2-readonly-transaction.ts" \
  || fail "missing read-only transaction guard"
grep -q 'SET TRANSACTION READ ONLY' "$HV_H2/m3-3-hv-h2-readonly-transaction.ts" \
  || fail "H2 must enforce SET TRANSACTION READ ONLY"
grep -q 'runM3_3HvH2ReadOnlyTransaction' "$HV_H2/m3-3-hv-h2-longitudinal-input-report.service.ts" \
  || fail "H2 report must use runM3_3HvH2ReadOnlyTransaction"
grep -q 'modelVersion: null' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "provider SOH modelVersion must be null when no provider model exists"
grep -q 'receivedAt: null' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "provider SOH must not fabricate receivedAt from persistence time"
grep -q 'numericValue: number | null' "$HV_H2/m3-3-hv-h2.types.ts" \
  || fail "candidate numericValue must allow null"
grep -q 'MODEL_VERSION_UNSUPPORTED' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "H2 must enforce MODEL_VERSION_UNSUPPORTED"
grep -q 'BatteryEvidenceStrengthTier' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "H2 must use canonical BatteryEvidenceStrengthTier vocabulary"
grep -q 'isHvH2GroundTruthActiveAtEvaluationAt' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "H2 must use GT as-of active projector"
grep -q 'healthConclusion: null' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "H2 candidates must keep healthConclusion null"
grep -q 'createdAt: { lte: evaluationAt }' "$HV_H2/m3-3-hv-h2-longitudinal-input-report.service.ts" \
  || fail "GT query must filter createdAt <= evaluationAt before take/limit"
grep -q 'verificationStatusAtEvaluationAt' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "validation anchors must project verificationStatusAtEvaluationAt"
grep -q 'SESSION_STATE_NOT_KNOWABLE_AT_EVALUATION_AT' "$HV_H2/m3-3-hv-h2.types.ts" \
  || fail "missing SESSION_STATE_NOT_KNOWABLE_AT_EVALUATION_AT reason"
grep -q 'compareM3_3HvH2LifecycleSegmentIds' "$HV_H2/m3-3-hv-h2-fingerprint.ts" \
  || fail "candidate ordering must use numeric lifecycle segment order"
grep -q 'resolveM3_3HvH2ReportBound' "$HV_H2/m3-3-hv-h2-longitudinal-input-report.service.ts" \
  || fail "H2 report bounds must use resolveM3_3HvH2ReportBound"
if grep -q '\-\-as-of' "$ROOT/backend/scripts/ops/battery-hv-h2-longitudinal-input-report.ts"; then
  fail "H2 CLI must not retain misleading --as-of alias"
fi
grep -q 'OBSERVATION_EVENT_TIME_FILTERED' "$HV_H2/m3-3-hv-h2.constants.ts" \
  || fail "H2 temporal semantics must document observation/GT/session authority"
grep -q 'SESSION_MISSING' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "M2 must fail closed on missing chargeSessionId"
grep -q 'customerPublicationEligible: false' "$HV_H2/m3-3-hv-h2-candidate-builder.ts" \
  || fail "H2 report must set customerPublicationEligible false"

if grep -rq 'hv-h2' "$APP_MODULE" 2>/dev/null; then
  fail "hv-h2 must not be registered in app.module.ts (H2_AUTOMATIC_RUNTIME_REACHABLE=NO)"
fi

if grep -rqE "rest-session-features/longitudinal/|f5-natural-calibration|evaluateM3_3E_" "$HV_H2" 2>/dev/null; then
  fail "hv-h2 must not import LV D3/F5/E2/E3 pipelines"
fi

python3 - "$BATTERY_HEALTH" <<'PY'
import os, sys
battery_root = sys.argv[1]
forbidden = [
    "rest-session-features/longitudinal/",
    "f5-natural-calibration",
    "evaluateM3_3E_",
]
for dirpath, _, files in os.walk(os.path.join(battery_root, "hv-h2")):
    for name in files:
        if not name.endswith(".ts"):
            continue
        path = os.path.join(dirpath, name)
        text = open(path, encoding="utf-8").read()
        for frag in forbidden:
            if frag in text.replace("\\", "/"):
                raise SystemExit(f"H2 contract validation FAILED: LV pipeline import in {path}")
print("H2 LV reuse guard: OK")
PY

echo "M3.3-HV-H2 domain contracts: OK"
