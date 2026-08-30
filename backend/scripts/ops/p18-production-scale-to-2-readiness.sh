#!/usr/bin/env bash
# P1.8 production scale-to-2 readiness gate — safe VPS validation harness.
# - Does NOT change production PM2 replica count
# - Does NOT FLUSHDB / FLUSHALL
# - Uses isolated Redis DB 15 for NestJS harness (same server as prod DB 0)
# - Runs non-destructive Redis DB 0 namespace audit separately
set -euo pipefail

GIT_REPO="${GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
VALIDATION_ID="$(date -u +%Y%m%d%H%M%S)_p18"
VALIDATION_DIR="/opt/synqdrive/validation-process/${VALIDATION_ID}"
SHARED_ENV="/opt/synqdrive/shared/backend.env"
PORT_A="${PORT_A:-3010}"
PORT_B="${PORT_B:-3011}"
HARNESS_REDIS_DB="${HARNESS_REDIS_DB:-15}"
LOG_DIR="/opt/synqdrive/validation-process/logs/${VALIDATION_ID}"
RESULT_FILE="${LOG_DIR}/p18-results.json"

mkdir -p "$LOG_DIR"

echo "==> P1.8 scale-to-2 readiness ${VALIDATION_ID}"
echo "    branch=${GIT_BRANCH}"
echo "    harness REDIS_DB=${HARNESS_REDIS_DB} (prod DB 0 audited separately, not flushed)"

cleanup() {
  echo "==> Cleanup (no FLUSHDB)"
  if [[ -n "${PID_A:-}" ]] && kill -0 "$PID_A" 2>/dev/null; then kill "$PID_A" 2>/dev/null || true; fi
  if [[ -n "${PID_B:-}" ]] && kill -0 "$PID_B" 2>/dev/null; then kill "$PID_B" 2>/dev/null || true; fi
  sleep 2
  if [[ -n "${PID_A:-}" ]] && kill -0 "$PID_A" 2>/dev/null; then kill -9 "$PID_A" 2>/dev/null || true; fi
  if [[ -n "${PID_B:-}" ]] && kill -0 "$PID_B" 2>/dev/null; then kill -9 "$PID_B" 2>/dev/null || true; fi
  if command -v redis-cli >/dev/null 2>&1; then
    redis-cli -n "$HARNESS_REDIS_DB" --scan --pattern 'synqdrive:p18-validation:*' 2>/dev/null | while read -r k; do
      [[ -n "$k" ]] && redis-cli -n "$HARNESS_REDIS_DB" DEL "$k" >/dev/null || true
    done
    redis-cli -n "$HARNESS_REDIS_DB" DEL synqdrive:scheduler:leader 2>/dev/null || true
    redis-cli -n "$HARNESS_REDIS_DB" --scan --pattern 'synqdrive:reconciliation:lock:org-p18:*' 2>/dev/null | while read -r k; do
      [[ -n "$k" ]] && redis-cli -n "$HARNESS_REDIS_DB" DEL "$k" >/dev/null || true
    done
    redis-cli -n "$HARNESS_REDIS_DB" DEL dimo:provider:budget:leases 2>/dev/null || true
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

echo "==> Phase 2: Redis DB 0 namespace audit (read-only + p18-validation keys)"
set +u
set -a
# shellcheck disable=SC1091
source "$SHARED_ENV"
set +a
set -u
REDIS_DB=0 node scripts/ops/redis-db0-namespace-audit.mjs | tee "${LOG_DIR}/redis-db0-audit.json"

echo "==> Phase 3–4: Start two NestJS replicas (harness DB ${HARNESS_REDIS_DB})"
export REDIS_DB="$HARNESS_REDIS_DB"
export SCHEDULER_LEADER_LEASE_MS="${SCHEDULER_LEADER_LEASE_MS:-10000}"
export SCHEDULER_LEADER_RENEW_INTERVAL_MS="${SCHEDULER_LEADER_RENEW_INTERVAL_MS:-3000}"
export SCHEDULER_LEADER_ACQUIRE_INTERVAL_MS="${SCHEDULER_LEADER_ACQUIRE_INTERVAL_MS:-1000}"
export RECONCILIATION_EXECUTION_MUTEX_ENABLED=true
export DIMO_GLOBAL_BUDGET_ENABLED=true
export DIMO_GLOBAL_MAX_IN_FLIGHT="${DIMO_GLOBAL_MAX_IN_FLIGHT:-50}"

export PORT="$PORT_A" INSTANCE_ID="p18-replica-a"
nohup node dist/src/main.js >"${LOG_DIR}/replica-a.log" 2>&1 &
PID_A=$!
export PORT="$PORT_B" INSTANCE_ID="p18-replica-b"
nohup node dist/src/main.js >"${LOG_DIR}/replica-b.log" 2>&1 &
PID_B=$!
echo "REPLICA_A_PID=${PID_A} REPLICA_B_PID=${PID_B}"

for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${PORT_A}/api/v1/health/readiness" >/dev/null \
    && curl -sf "http://127.0.0.1:${PORT_B}/api/v1/health/readiness" >/dev/null; then
    echo "both ready after ${i}"
    break
  fi
  sleep 2
  [[ "$i" -eq 90 ]] && { tail -30 "${LOG_DIR}/replica-a.log"; tail -30 "${LOG_DIR}/replica-b.log"; exit 1; }
done

curl -sf "http://127.0.0.1:${PORT_A}/api/v1/health/readiness" | tee "${LOG_DIR}/readiness-a.json" >/dev/null
curl -sf "http://127.0.0.1:${PORT_B}/api/v1/health/readiness" | tee "${LOG_DIR}/readiness-b.json" >/dev/null

echo "==> Phase 5–6: coordination probe (mutex + DIMO on harness DB)"
REDIS_DB="$HARNESS_REDIS_DB" DIMO_GLOBAL_MAX_IN_FLIGHT=10 \
  node scripts/ops/two-replica-coordination-probe.mjs | tee "${LOG_DIR}/coordination-probe.log"

echo "==> Phase 4: leader election probe"
REPLICA_A_PORT="$PORT_A" REPLICA_B_PORT="$PORT_B" REPLICA_A_PID="$PID_A" REPLICA_B_PID="$PID_B" \
  REDIS_DB="$HARNESS_REDIS_DB" \
  node scripts/ops/two-replica-process-validation-probe.mjs | tee "${LOG_DIR}/leader-probe.log"

MAIN_HEAD="$(git rev-parse HEAD)"
echo "{\"validationId\":\"${VALIDATION_ID}\",\"mainHead\":\"${MAIN_HEAD}\",\"pidA\":${PID_A},\"pidB\":${PID_B},\"portA\":${PORT_A},\"portB\":${PORT_B},\"harnessRedisDb\":${HARNESS_REDIS_DB}}" >"$RESULT_FILE"
echo "==> Complete — logs in ${LOG_DIR}"
