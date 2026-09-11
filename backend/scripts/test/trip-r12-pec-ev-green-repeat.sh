#!/usr/bin/env bash
# Runs the R12 PEC/EV collision integration spec N times (default 10).
# Requires Postgres + Redis (same as trip-r11 postgres-redis CI).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPEAT="${REPEAT:-10}"
SPEC="trip-r12-pec-ev-lock-collision.postgres-redis.integration.spec.ts"
FAILURES=0

cd "$ROOT/backend"

for i in $(seq 1 "$REPEAT"); do
  echo "=== iteration $i/$REPEAT ==="
  if TRIP_R12_POSTGRES_REDIS_INTEGRATION=1 TRIP_R12_POSTGRES_REDIS_REQUIRED=1 \
    npx jest "$SPEC" --runInBand --forceExit --verbose; then
    echo "iteration_${i}=PASS"
  else
    echo "iteration_${i}=FAIL"
    FAILURES=$((FAILURES + 1))
    break
  fi
done

echo "GREEN_REPEAT_COUNT=$((i - FAILURES))"
echo "GREEN_REPEAT_FAILURES=$FAILURES"
exit "$FAILURES"
