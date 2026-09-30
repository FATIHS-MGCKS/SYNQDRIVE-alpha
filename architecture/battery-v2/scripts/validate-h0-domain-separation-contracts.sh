#!/usr/bin/env bash
# M3.3-H0 — static domain-separation contract checks (docs/authority; no runtime).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
F5_CONST="$ROOT/backend/src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/f5-natural-calibration-report/f5-ground-truth-correlation.constants.ts"
MIG="$ROOT/backend/prisma/migrations/20260929140000_battery_ground_truth_replacement_source_scope_unique/migration.sql"
BATTERY_HEALTH="$ROOT/backend/src/modules/vehicle-intelligence/battery-health"

fail() { echo "H0 contract validation FAILED: $*" >&2; exit 1; }

grep -q 'F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE: BatteryEvidenceScope =' "$F5_CONST" \
  || fail "missing F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE"
grep -q 'BatteryEvidenceScope.LV' "$F5_CONST" \
  || fail "F5 GT correlation scope must be LV"
grep -q 'LV_REST_SESSION_LONGITUDINAL_PIPELINE_V1' "$F5_CONST" \
  || fail "missing F5 longitudinal scope authority constant"

# --- G2.2: full multiline CREATE UNIQUE INDEX statement ---
python3 - "$MIG" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
m = re.search(
    r'CREATE UNIQUE INDEX "battery_ground_truth_one_active_replacement_per_source_event"[\s\S]*?;',
    text,
    re.IGNORECASE,
)
if not m:
    raise SystemExit("H0 contract validation FAILED: G2.2 CREATE UNIQUE INDEX statement not found")
stmt = m.group(0)
if "battery_scope" in stmt.lower():
    raise SystemExit(
        "H0 contract validation FAILED: battery_scope must NOT appear in G2.2 unique index statement"
    )
on_match = re.search(r'ON\s+"battery_ground_truth_events"\s*\(([^)]+)\)', stmt, re.IGNORECASE)
if not on_match:
    raise SystemExit("H0 contract validation FAILED: could not parse G2.2 ON (...) column list")
cols = [c.strip().strip('"') for c in on_match.group(1).split(",")]
expected = ["organization_id", "source_service_event_id"]
if cols != expected:
    raise SystemExit(
        f"H0 contract validation FAILED: G2.2 unique key must be {expected}, got {cols}"
    )
print("G2.2 full index statement: OK")
PY

CONFIG="$ROOT/backend/src/config/battery-health-v2.config.ts"
if grep -qE 'E3.*ENABLED|LONGITUDINAL.*EVALUATOR.*ENABLED' "$CONFIG" 2>/dev/null; then
  grep -qE 'isBatteryV2.*E3.*Enabled.*return false|default.*false' "$CONFIG" \
    || fail "unexpected E3 production enablement in battery-health-v2.config.ts"
fi

# --- E3: no unexpected runtime consumers (offline F5 + tests only) ---
python3 - "$BATTERY_HEALTH" "$ROOT/backend/src/workers" <<'PY'
import os, re, sys

battery_root = sys.argv[1]
workers_root = sys.argv[2]
symbol = "evaluateM3_3E_LongitudinalHealthEvaluationV1"

allowed_offline = {
    os.path.normpath(
        "generalized-evidence/rest-session-features/longitudinal/f5-natural-calibration-report/f5-natural-calibration-report.service.ts"
    ),
    os.path.normpath(
        "generalized-evidence/rest-session-features/longitudinal/longitudinal-health-evaluation.policy.ts"
    ),
}

def is_test_path(path: str) -> bool:
    base = os.path.basename(path)
    return (
        base.endswith(".spec.ts")
        or base.endswith(".e31-conformance.spec.ts")
        or base.endswith(".e311-v1-closure.spec.ts")
        or base.endswith(".e312-c1-envelope.spec.ts")
        or "/test/" in path.replace("\\", "/")
    )

def scan_battery_health():
    unexpected = []
    offline = []
    non_test = 0
    for dirpath, _, files in os.walk(battery_root):
        for fn in files:
            if not fn.endswith(".ts"):
                continue
            full = os.path.join(dirpath, fn)
            if symbol not in open(full, encoding="utf-8").read():
                continue
            if is_test_path(full):
                continue
            non_test += 1
            rel = os.path.normpath(os.path.relpath(full, battery_root))
            if rel in allowed_offline:
                offline.append(rel)
            else:
                unexpected.append(rel)
    return non_test, offline, unexpected

nt, off, bad = scan_battery_health()
if os.path.isdir(workers_root):
    for dirpath, _, files in os.walk(workers_root):
        for fn in files:
            if not fn.endswith(".ts"):
                continue
            full = os.path.join(dirpath, fn)
            if symbol not in open(full, encoding="utf-8").read():
                continue
            if is_test_path(full):
                continue
            nt += 1
            bad.append(os.path.join("workers", os.path.relpath(full, workers_root)))

print(f"E3_NON_TEST_CALL_SITE_COUNT={nt}")
print(f"E3_ALLOWED_OFFLINE_CALL_SITE_COUNT={len(off)}")
print(f"E3_UNEXPECTED_RUNTIME_CALL_SITE_COUNT={len(bad)}")
if bad:
    raise SystemExit(
        "H0 contract validation FAILED: unexpected E3 consumers: " + ", ".join(bad)
    )
if len(off) < 1:
    raise SystemExit("H0 contract validation FAILED: expected at least one allowed offline E3 consumer")
print("E3 runtime reachability guard: OK")
PY

D3_POSTGRES_CI="$ROOT/backend/scripts/test/battery-longitudinal-profile-materialization-postgres-ci.sh"
if grep -qE 'hv-h1|test:battery:v2:hv-h1' "$D3_POSTGRES_CI" 2>/dev/null; then
  fail "LV D3 longitudinal postgres CI must not invoke HV-H1 (M3.3-H0 domain separation)"
fi

echo "M3.3-H0 domain separation static contracts: OK"
