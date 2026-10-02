#!/usr/bin/env bash
# Shell contract tests for EXP-021 fleet deploy capability guard.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD_LIB="${ROOT}/scripts/ops/lib/vps-exp021-fleet-deploy-guard.lib.sh"
# shellcheck source=../ops/lib/vps-exp021-fleet-deploy-guard.lib.sh
source "$GUARD_LIB"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

write_env() {
  local file="$1"
  local enabled="$2"
  printf 'EXP021_FLEET_COORDINATOR_ENABLED=%s\n' "$enabled" >"$file"
}

copy_capable_target() {
  local dest="$1"
  mkdir -p "$dest/backend/src/workers/schedulers"
  mkdir -p "$dest/backend/src/modules/vehicle-intelligence/reference-capture/exp021-fleet"
  mkdir -p "$dest/backend/dist/src/workers/schedulers"
  mkdir -p "$dest/backend/dist/src/modules/vehicle-intelligence/reference-capture/exp021-fleet"
  cp "$ROOT/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.ts" \
    "$dest/backend/src/workers/schedulers/"
  cp "$ROOT/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.ts" \
    "$dest/backend/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/"
  cp "$ROOT/src/workers/workers.module.ts" "$dest/backend/src/workers/"
  cp "$ROOT/dist/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.js" \
    "$dest/backend/dist/src/workers/schedulers/" 2>/dev/null || {
    printf '%s\n' "// dist scheduler stub" >"$dest/backend/dist/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.js"
  }
  cp "$ROOT/dist/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.js" \
    "$dest/backend/dist/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/" 2>/dev/null || {
    printf '%s\n' "// dist service stub" >"$dest/backend/dist/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.js"
  }
}

# A. capable target + coordinator enabled -> PASS
TARGET_A="${WORK}/capable-enabled"
ENV_A="${WORK}/env-a"
write_env "$ENV_A" true
copy_capable_target "$TARGET_A"
if vps_exp021_verify_target_fleet_capability "$TARGET_A" "$ENV_A"; then
  pass "A enabled capable target"
else
  fail "A enabled capable target"
fi

# B. incapable target + coordinator enabled -> FAIL
TARGET_B="${WORK}/incapable-enabled"
ENV_B="${WORK}/env-b"
write_env "$ENV_B" true
mkdir -p "$TARGET_B/backend"
if vps_exp021_verify_target_fleet_capability "$TARGET_B" "$ENV_B" 2>/dev/null; then
  fail "B enabled incapable target should fail"
else
  pass "B enabled incapable target"
fi

# C. legacy target without helper + coordinator disabled -> PASS this EXP-021 guard
TARGET_C="${WORK}/legacy-disabled"
ENV_C="${WORK}/env-c"
write_env "$ENV_C" false
mkdir -p "$TARGET_C/backend"
if vps_exp021_verify_target_fleet_capability "$TARGET_C" "$ENV_C"; then
  pass "C disabled legacy target without helper"
else
  fail "C disabled legacy target without helper"
fi

# D. helper-present capable target + coordinator disabled -> PASS
TARGET_D="${WORK}/capable-disabled"
ENV_D="${WORK}/env-d"
write_env "$ENV_D" false
copy_capable_target "$TARGET_D"
if vps_exp021_verify_target_fleet_capability "$TARGET_D" "$ENV_D"; then
  pass "D disabled capable target"
else
  fail "D disabled capable target"
fi

# E. source exists but dist missing + enabled -> FAIL
TARGET_E="${WORK}/dist-missing"
ENV_E="${WORK}/env-e"
write_env "$ENV_E" true
mkdir -p "$TARGET_E/backend/src/workers/schedulers"
mkdir -p "$TARGET_E/backend/src/modules/vehicle-intelligence/reference-capture/exp021-fleet"
cp "$ROOT/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.ts" \
  "$TARGET_E/backend/src/workers/schedulers/"
cp "$ROOT/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.ts" \
  "$TARGET_E/backend/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/"
printf '%s\n' "import { ReferenceCaptureExp021FleetCoordinatorScheduler } from './schedulers/reference-capture-exp021-fleet-coordinator.scheduler';" \
  >"$TARGET_E/backend/src/workers/workers.module.ts"
if vps_exp021_verify_target_fleet_capability "$TARGET_E" "$ENV_E" 2>/dev/null; then
  fail "E dist missing should fail"
else
  pass "E dist missing"
fi

# F. workers.module registration missing + enabled -> FAIL
TARGET_F="${WORK}/registration-missing"
ENV_F="${WORK}/env-f"
write_env "$ENV_F" true
copy_capable_target "$TARGET_F"
printf '%s\n' "export class WorkersModule {}" >"$TARGET_F/backend/src/workers/workers.module.ts"
if vps_exp021_verify_target_fleet_capability "$TARGET_F" "$ENV_F" 2>/dev/null; then
  fail "F registration missing should fail"
else
  pass "F registration missing"
fi

echo "EXP-021 fleet deploy guard shell contract: OK"
