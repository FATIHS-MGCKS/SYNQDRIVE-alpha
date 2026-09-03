#!/usr/bin/env bash
# Selftest for Battery V2 Stage-2 cutover contract helpers and operator scripts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Contract truth table
battery_v2_stage2_contract_is_valid true true true || fail "Stage-2 contract should be valid"
battery_v2_invalid_m31_contract_is_active false true || fail "invalid M3.1 should be detected"
if battery_v2_stage2_contract_reject_invalid false true 2>/dev/null; then
  fail "expected invalid M3.1 rejection"
fi
if ! battery_v2_stage2_contract_reject_invalid true true 2>/dev/null; then
  fail "expected Stage-2 acceptance"
fi

# Deprecated script fails closed
if bash "${SCRIPT_DIR}/vps-enable-battery-v2-full-fleet-production.sh" 2>/dev/null; then
  fail "deprecated script should fail closed"
fi

# Scheduler topology fail-closed
export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:FOLLOWER,3002:FOLLOWER"
if battery_v2_stage2_scheduler_topology_preflight 2>/dev/null; then
  fail "expected failure with 0 leaders"
fi
unset BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT

export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:LEADER"
if battery_v2_stage2_scheduler_topology_preflight 2>/dev/null; then
  fail "expected failure with >1 leaders"
fi
unset BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT

export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:FOLLOWER"
battery_v2_stage2_scheduler_topology_preflight | grep -q 'SCHEDULER_TOPOLOGY_PREFLIGHT=PASS' \
  || fail "expected PASS with exactly 1 leader"
unset BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT

export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:UNKNOWN,3002:FOLLOWER"
if battery_v2_stage2_scheduler_topology_preflight 2>/dev/null; then
  fail "expected failure on UNKNOWN role"
fi
unset BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT

# PKG-01 guard deployment proof (workspace release)
TMP_CURRENT="$(mktemp -d)"
mkdir -p "${TMP_CURRENT}/backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window"
cp "${SCRIPT_DIR}/../../src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-assessment-handoff.policy.ts" \
  "${TMP_CURRENT}/backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/"
git -C "$TMP_CURRENT" init -q
git -C "$TMP_CURRENT" add -A
git -C "$TMP_CURRENT" commit -q -m "test"
export SYNQDRIVE_CURRENT_LINK="$TMP_CURRENT"
battery_v2_stage2_verify_pkg01_guard_deployed | grep -q 'PKG01_GUARD_DEPLOYED=YES' \
  || fail "expected guard deployed in workspace release"
unset SYNQDRIVE_CURRENT_LINK
rm -rf "$TMP_CURRENT"

# Dry-run activation succeeds without ACK
TMP_ENV="$(mktemp)"
cat >"$TMP_ENV" <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=false
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
DATABASE_URL=postgresql://invalid
EOF
MOCK_BIN="$(mktemp -d)"
cat >"$MOCK_BIN/psql" <<'EOF'
#!/usr/bin/env bash
echo "24|0|24|0"
EOF
chmod +x "$MOCK_BIN/psql"
export PATH="$MOCK_BIN:$PATH"
export BACKEND_ENV="$TMP_ENV"
export DRY_RUN=1
export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:FOLLOWER"
export SYNQDRIVE_CURRENT_LINK="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
if ! bash "${SCRIPT_DIR}/vps-enable-battery-v2-stage2-production.sh" 2>&1 | tee /tmp/stage2-dry-run.log | grep -q 'No BATTERY_V2_STAGE2_PREFLIGHT_ACK required'; then
  fail "dry-run should not require ACK"
fi
unset DRY_RUN BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT SYNQDRIVE_CURRENT_LINK
rm -rf "$MOCK_BIN"

# Real activation refuses without ACK
MOCK_BIN="$(mktemp -d)"
cat >"$MOCK_BIN/psql" <<'EOF'
#!/usr/bin/env bash
echo "24|0|24|0"
EOF
chmod +x "$MOCK_BIN/psql"
export BACKEND_ENV="$TMP_ENV"
export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:FOLLOWER"
export SYNQDRIVE_CURRENT_LINK="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export PATH="$MOCK_BIN:$PATH"
if BATTERY_V2_STAGE2_PREFLIGHT_ACK= bash "${SCRIPT_DIR}/vps-enable-battery-v2-stage2-production.sh" 2>/dev/null; then
  fail "real activation should refuse without ACK"
fi
unset BATTERY_V2_STAGE2_PREFLIGHT_ACK BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT SYNQDRIVE_CURRENT_LINK
rm -rf "$MOCK_BIN"

# Preflight fails closed when backend.env missing for PKG-01 SQL
export BACKEND_ENV="/tmp/missing-backend-env-$$"
export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:FOLLOWER"
export SYNQDRIVE_CURRENT_LINK="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
if bash "${SCRIPT_DIR}/battery-v2-stage2-production-preflight.sh" 2>/dev/null; then
  fail "preflight should fail when backend.env missing for PKG-01 audit"
fi
unset BACKEND_ENV BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT SYNQDRIVE_CURRENT_LINK
rm -f "$TMP_ENV"

# PKG-01 valid backlog gate
battery_v2_stage2_pkg01_preflight_backlog_gate 0 0 | grep -q 'PKG01_PRE_T0_VALID_BACKLOG_GATE=PASS' \
  || fail "PKG01 valid=0 unresolved=0 should pass"
if battery_v2_stage2_pkg01_preflight_backlog_gate 1 0 2>/dev/null; then
  fail "PKG01 valid=1 should fail"
fi
if battery_v2_stage2_pkg01_preflight_backlog_gate 0 1 2>/dev/null; then
  fail "PKG01 unresolved=1 should fail"
fi

# Preflight fails on VALID ENQUEUED backlog (mocked SQL)
MOCK_BIN="$(mktemp -d)"
cat >"$MOCK_BIN/psql" <<'EOF'
#!/usr/bin/env bash
echo "25|1|24|0"
EOF
chmod +x "$MOCK_BIN/psql"
export PATH="$MOCK_BIN:$PATH"
TMP_ENV="$(mktemp)"
cat >"$TMP_ENV" <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=false
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
DATABASE_URL=postgresql://invalid
EOF
export BACKEND_ENV="$TMP_ENV"
export BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT="3001:LEADER,3002:FOLLOWER"
export SYNQDRIVE_CURRENT_LINK="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
if bash "${SCRIPT_DIR}/battery-v2-stage2-production-preflight.sh" 2>/dev/null; then
  fail "preflight should fail when VALID ENQUEUED backlog > 0"
fi
unset BACKEND_ENV BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT SYNQDRIVE_CURRENT_LINK
rm -rf "$MOCK_BIN" "$TMP_ENV"

# Atomic rollback matrix (runtime, not file-only)
bash "${SCRIPT_DIR}/battery-v2-stage2-rollback-atomicity.selftest.sh" \
  || fail "rollback atomicity selftest failed"

echo "battery-v2-stage2-production-activation.selftest: OK"
