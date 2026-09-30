#!/usr/bin/env bash
# M3.3-HV-H1 — static contract checks (pure contracts + read-only CLI; no automatic runtime).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HV_H1="$ROOT/backend/src/modules/vehicle-intelligence/battery-health/hv-h1"
BATTERY_HEALTH="$ROOT/backend/src/modules/vehicle-intelligence/battery-health"
APP_MODULE="$ROOT/backend/src/app.module.ts"

fail() { echo "H1 contract validation FAILED: $*" >&2; exit 1; }

test -d "$HV_H1" || fail "missing hv-h1 module directory"

grep -q 'M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1' "$HV_H1/m3-3-hv-h1.constants.ts" \
  || fail "missing capability matrix contract version"
grep -q 'METHOD_IDENTITY_REQUIRED = true' "$HV_H1/m3-3-hv-h1.constants.ts" \
  || fail "METHOD_IDENTITY_REQUIRED must be true"
grep -q 'CROSS_METHOD_POOLING_DEFAULT = false' "$HV_H1/m3-3-hv-h1.constants.ts" \
  || fail "CROSS_METHOD_POOLING_DEFAULT must be false"
grep -q "HV_H1_BATTERY_SCOPE = 'HV'" "$HV_H1/m3-3-hv-h1.constants.ts" \
  || fail "H1 batteryScope must be HV"

# No Nest automatic wiring of hv-h1 report (CLI-only)
if grep -rq 'hv-h1' "$APP_MODULE" 2>/dev/null; then
  fail "hv-h1 must not be registered in app.module.ts (H1_RUNTIME_REACHABLE=NO)"
fi

# No LV D3/F5/E2/E3 imports inside hv-h1
if grep -rqE "rest-session-features/longitudinal/|f5-natural-calibration|evaluateM3_3E_" "$HV_H1" 2>/dev/null; then
  fail "hv-h1 must not import LV longitudinal pipelines"
fi

python3 - "$BATTERY_HEALTH" <<'PY'
import os, sys
battery_root = sys.argv[1]
forbidden = [
    "rest-session-features/longitudinal/",
    "f5-natural-calibration",
    "evaluateM3_3E_",
]
for dirpath, _, files in os.walk(os.path.join(battery_root, "hv-h1")):
    for name in files:
        if not name.endswith(".ts"):
            continue
        path = os.path.join(dirpath, name)
        text = open(path, encoding="utf-8").read()
        for frag in forbidden:
            if frag in text.replace("\\", "/"):
                raise SystemExit(f"H1 contract validation FAILED: LV pipeline import in {path}")
print("H1 LV reuse guard: OK")
PY

echo "M3.3-HV-H1 domain contracts: OK"
