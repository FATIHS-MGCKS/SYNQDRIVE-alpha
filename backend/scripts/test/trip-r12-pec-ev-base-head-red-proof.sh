#!/usr/bin/env bash
# Reproduces BASE vs HEAD PEC/EV lock-order evidence using isolated git worktrees.
# Requires: Postgres + Redis (same as trip-r11 postgres-redis CI).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_SHA="${BASE_SHA:-24c2632a1bad2d72a97442d45285ddb6c530def9}"
HEAD_SHA="${HEAD_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
WORKTREE_ROOT="${TMPDIR:-/tmp}/trip-r12-pec-ev-red-proof-$$"
BASE_DIR="$WORKTREE_ROOT/base"
HEAD_DIR="$WORKTREE_ROOT/head"

cleanup() {
  git -C "$ROOT" worktree remove --force "$BASE_DIR" 2>/dev/null || true
  git -C "$ROOT" worktree remove --force "$HEAD_DIR" 2>/dev/null || true
  rm -rf "$WORKTREE_ROOT"
}
trap cleanup EXIT

mkdir -p "$WORKTREE_ROOT"
git -C "$ROOT" worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null
git -C "$ROOT" worktree add --detach "$HEAD_DIR" "$HEAD_SHA" >/dev/null

run_lock_order_probe() {
  local dir="$1"
  local label="$2"
  cd "$dir/backend"
  TRIP_R12_POSTGRES_REDIS_INTEGRATION=1 \
  TRIP_R12_POSTGRES_REDIS_REQUIRED=1 \
  npx jest trip-r12-pec-ev-lock-collision.postgres-redis.integration.spec.ts \
    -t "lock-order regression" \
    --runInBand --forceExit --verbose 2>&1 | tee "/tmp/trip-r12-lock-order-${label}.log"
}

echo "=== BASE lock-order probe @ ${BASE_SHA} ==="
if run_lock_order_probe "$BASE_DIR" base; then
  BASE_LOCK_ORDER_PASS=YES
else
  BASE_LOCK_ORDER_PASS=NO
fi

echo "=== HEAD lock-order probe @ ${HEAD_SHA} ==="
if run_lock_order_probe "$HEAD_DIR" head; then
  HEAD_LOCK_ORDER_PASS=YES
else
  HEAD_LOCK_ORDER_PASS=NO
fi

cat <<EOF
BASE_SHA=${BASE_SHA}
HEAD_SHA=${HEAD_SHA}
BASE_LOCK_ORDER_TEST_PASS=${BASE_LOCK_ORDER_PASS:-UNKNOWN}
HEAD_LOCK_ORDER_TEST_PASS=${HEAD_LOCK_ORDER_PASS:-UNKNOWN}
NOTE=On BASE pre-fix code the lock-order test is expected to FAIL (scheduleWhileLockHeld=true). On HEAD it must PASS.
EOF
