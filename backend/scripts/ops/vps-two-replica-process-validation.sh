#!/usr/bin/env bash
# Two-process process-level validation for P1.3 + P1.7 + P1.4 on VPS.
# Safe mode: uses isolated REDIS_DB (default 15) so production PM2 synqdrive (db 0) is not disturbed.
#
# Usage (on VPS as root):
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-two-replica-process-validation.sh
#
# From Cloud Agent:
#   ssh root@srv1374778.hstgr.cloud \
#     "bash /opt/synqdrive/current/backend/scripts/ops/vps-two-replica-process-validation.sh"
set -euo pipefail

GIT_REPO="${GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
VALIDATION_ID="$(date -u +%Y%m%d%H%M%S)_procval"
VALIDATION_DIR="/opt/synqdrive/validation-process/${VALIDATION_ID}"
SHARED_ENV="/opt/synqdrive/shared/backend.env"
PORT_A="${PORT_A:-3010}"
PORT_B="${PORT_B:-3011}"
VALIDATION_REDIS_DB="${VALIDATION_REDIS_DB:-15}"
LOG_DIR="/opt/synqdrive/validation-process/logs/${VALIDATION_ID}"
RESULT_FILE="${LOG_DIR}/validation-results.json"

mkdir -p "$LOG_DIR"

echo "==> Two-replica PROCESS validation ${VALIDATION_ID}"
echo "    branch=${GIT_BRANCH}"
echo "    dir=${VALIDATION_DIR}"
echo "    ports=${PORT_A}/${PORT_B}"
echo "    validation REDIS_DB=${VALIDATION_REDIS_DB} (production synqdrive on db 0 untouched)"

cleanup() {
  echo "==> Cleanup"
  if [[ -n "${PID_A:-}" ]] && kill -0 "$PID_A" 2>/dev/null; then kill "$PID_A" 2>/dev/null || true; fi
  if [[ -n "${PID_B:-}" ]] && kill -0 "$PID_B" 2>/dev/null; then kill "$PID_B" 2>/dev/null || true; fi
  sleep 2
  if [[ -n "${PID_A:-}" ]] && kill -0 "$PID_A" 2>/dev/null; then kill -9 "$PID_A" 2>/dev/null || true; fi
  if [[ -n "${PID_B:-}" ]] && kill -0 "$PID_B" 2>/dev/null; then kill -9 "$PID_B" 2>/dev/null || true; fi
  # Clear validation redis db keys
  if command -v redis-cli >/dev/null 2>&1; then
    redis-cli -n "$VALIDATION_REDIS_DB" FLUSHDB >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "==> Clone + build ${GIT_BRANCH}"
git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" "$VALIDATION_DIR"
ln -sfn "$SHARED_ENV" "$VALIDATION_DIR/backend/.env"
cd "$VALIDATION_DIR/backend"
npm ci
npx prisma generate
npm run build

echo "==> Start replica A (PORT=${PORT_A})"
export PORT="$PORT_A"
export REDIS_DB="$VALIDATION_REDIS_DB"
export INSTANCE_ID="replica-a"
export SCHEDULER_LEADER_LEASE_MS="${SCHEDULER_LEADER_LEASE_MS:-10000}"
export SCHEDULER_LEADER_RENEW_INTERVAL_MS="${SCHEDULER_LEADER_RENEW_INTERVAL_MS:-3000}"
export SCHEDULER_LEADER_ACQUIRE_INTERVAL_MS="${SCHEDULER_LEADER_ACQUIRE_INTERVAL_MS:-1000}"
export RECONCILIATION_EXECUTION_MUTEX_ENABLED=true
export DIMO_GLOBAL_BUDGET_ENABLED=true
export DIMO_GLOBAL_MAX_IN_FLIGHT="${DIMO_GLOBAL_MAX_IN_FLIGHT:-10}"
nohup node dist/src/main.js >"${LOG_DIR}/replica-a.log" 2>&1 &
PID_A=$!
echo "    REPLICA_A_PID=${PID_A}"

echo "==> Start replica B (PORT=${PORT_B})"
export PORT="$PORT_B"
export INSTANCE_ID="replica-b"
nohup node dist/src/main.js >"${LOG_DIR}/replica-b.log" 2>&1 &
PID_B=$!
echo "    REPLICA_B_PID=${PID_B}"

echo "==> Wait for readiness"
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT_A}/api/v1/health/readiness" >/dev/null \
    && curl -sf "http://127.0.0.1:${PORT_B}/api/v1/health/readiness" >/dev/null; then
    echo "    both ready after ${i} attempts"
    break
  fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    echo "!! readiness timeout" >&2
    tail -50 "${LOG_DIR}/replica-a.log" || true
    tail -50 "${LOG_DIR}/replica-b.log" || true
    exit 1
  fi
done

echo "==> Collect readiness snapshots (pre-failover)"
curl -sf "http://127.0.0.1:${PORT_A}/api/v1/health/readiness" | tee "${LOG_DIR}/readiness-a.json"
echo
curl -sf "http://127.0.0.1:${PORT_B}/api/v1/health/readiness" | tee "${LOG_DIR}/readiness-b.json"
echo

echo "==> Leader election probe (will terminate replicas)"
REPLICA_A_PORT="$PORT_A" REPLICA_B_PORT="$PORT_B" REPLICA_A_PID="$PID_A" REPLICA_B_PID="$PID_B" \
  node scripts/ops/two-replica-process-validation-probe.mjs | tee "${LOG_DIR}/leader-probe.log"

echo "==> Reconciliation mutex + DIMO budget coordination probe (two forked Node processes)"
set -a
# shellcheck disable=SC1091
source "$SHARED_ENV"
set +a
REDIS_DB="$VALIDATION_REDIS_DB" node scripts/ops/two-replica-coordination-probe.mjs | tee "${LOG_DIR}/coordination-probe.log"

git -C "$VALIDATION_DIR" rev-parse HEAD | tee "${LOG_DIR}/main-head.txt"
echo "{\"validationId\":\"${VALIDATION_ID}\",\"pidA\":${PID_A},\"pidB\":${PID_B},\"portA\":${PORT_A},\"portB\":${PORT_B},\"redisDb\":${VALIDATION_REDIS_DB}}" >"$RESULT_FILE"

echo "==> Validation complete — results in ${LOG_DIR}"
echo "CLEANUP will run via trap"
