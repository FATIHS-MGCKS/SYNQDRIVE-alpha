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
TRACKED_PIDS_FILE="${LOG_DIR}/tracked-pids.txt"

mkdir -p "$LOG_DIR"
touch "$TRACKED_PIDS_FILE"
export VALIDATION_TRACKED_PIDS_FILE="$TRACKED_PIDS_FILE"

kill_pid_gracefully() {
  local pid="$1"
  [[ -z "$pid" || "$pid" -le 0 ]] && return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

kill_listeners_on_port() {
  local port="$1"
  [[ -z "$port" ]] && return 0
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)"
    for pid in $pids; do
      kill_pid_gracefully "$pid"
    done
  fi
}

kill_tracked_probe_pids() {
  [[ ! -f "$TRACKED_PIDS_FILE" ]] && return 0
  while IFS=$'\t' read -r pid _label; do
    [[ -z "$pid" ]] && continue
    kill_pid_gracefully "$pid"
  done <"$TRACKED_PIDS_FILE"
}

echo "==> Two-replica PROCESS validation ${VALIDATION_ID}"
echo "    branch=${GIT_BRANCH}"
echo "    dir=${VALIDATION_DIR}"
echo "    ports=${PORT_A}/${PORT_B}"
echo "    validation REDIS_DB=${VALIDATION_REDIS_DB} (production synqdrive on db 0 untouched)"

cleanup() {
  echo "==> Cleanup"
  kill_tracked_probe_pids
  kill_pid_gracefully "${PID_A:-}"
  kill_pid_gracefully "${PID_B:-}"
  kill_listeners_on_port "$PORT_A"
  kill_listeners_on_port "$PORT_B"
  # Clear validation redis db keys (isolated DB only — never DB 0)
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
# Keep production-equivalent budget sizing; do not downscale max below reserved slots.
export DIMO_GLOBAL_MAX_IN_FLIGHT="${DIMO_GLOBAL_MAX_IN_FLIGHT:-50}"
nohup node dist/src/main.js >"${LOG_DIR}/replica-a.log" 2>&1 &
PID_A=$!
echo "    REPLICA_A_PID=${PID_A}"

echo "==> Start replica B (PORT=${PORT_B})"
export PORT="$PORT_B"
export INSTANCE_ID="replica-b"
nohup node dist/src/main.js >"${LOG_DIR}/replica-b.log" 2>&1 &
PID_B=$!
echo "    REPLICA_B_PID=${PID_B}"

echo "==> Wait for readiness (up to 180s — full Nest bootstrap)"
for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${PORT_A}/api/v1/health/readiness" >/dev/null \
    && curl -sf "http://127.0.0.1:${PORT_B}/api/v1/health/readiness" >/dev/null; then
    echo "    both ready after ${i} attempts"
    break
  fi
  sleep 2
  if [[ "$i" -eq 90 ]]; then
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

echo "==> Reconciliation mutex + DIMO budget coordination probe (two forked Node processes)"
set +u
set -a
# shellcheck disable=SC1091
source "$SHARED_ENV"
set +a
set -u
REDIS_DB="$VALIDATION_REDIS_DB" DIMO_GLOBAL_MAX_IN_FLIGHT="${DIMO_GLOBAL_MAX_IN_FLIGHT:-50}" \
  node scripts/ops/two-replica-coordination-probe.mjs | tee "${LOG_DIR}/coordination-probe.log"

echo "==> Leader election probe (will terminate replicas)"
REPLICA_A_PORT="$PORT_A" REPLICA_B_PORT="$PORT_B" REPLICA_A_PID="$PID_A" REPLICA_B_PID="$PID_B" \
  REDIS_DB="$VALIDATION_REDIS_DB" \
  node scripts/ops/two-replica-process-validation-probe.mjs | tee "${LOG_DIR}/leader-probe.log"

git -C "$VALIDATION_DIR" rev-parse HEAD | tee "${LOG_DIR}/main-head.txt"
echo "{\"validationId\":\"${VALIDATION_ID}\",\"pidA\":${PID_A},\"pidB\":${PID_B},\"portA\":${PORT_A},\"portB\":${PORT_B},\"redisDb\":${VALIDATION_REDIS_DB}}" >"$RESULT_FILE"

echo "==> Validation complete — results in ${LOG_DIR}"
echo "CLEANUP will run via trap"
