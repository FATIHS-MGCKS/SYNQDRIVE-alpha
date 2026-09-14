#!/usr/bin/env bash
# PR #1648 — identical BASE vs HEAD differential for failing Trip FSM CI commands.
set -euo pipefail

BASE_SHA="${BASE_SHA:-84ef68944c403c0b042cd9cec0076296fe085bd0}"
HEAD_DIR="${HEAD_DIR:-/workspace}"
BASE_DIR="${BASE_DIR:-/tmp/pr1648-base}"
OUT_DIR="${OUT_DIR:-/opt/cursor/artifacts/differential}"
DATABASE_URL="${DATABASE_URL:-postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public}"
export DATABASE_URL

mkdir -p "$OUT_DIR"

prepare_tree() {
  local dir="$1"
  cd "$dir/backend"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  npx prisma generate
}

run_r10() {
  local label="$1" dir="$2"
  prepare_tree "$dir"
  cd "$dir/backend"
  set +e
  npm test -- \
    --testPathPattern="trip-fsm-motor-off-pause-r10|trip-end-cycle-reset|trip-end-validation-r5|trip-terminal-resting-recovery-r7" \
    --no-coverage \
    > "$OUT_DIR/${label}_r10.log" 2>&1
  local code=$?
  set -e
  echo "${label}_R10_EXIT:${code}" | tee "$OUT_DIR/${label}_r10.exit"
  rg -n "^(FAIL|PASS) |Tests:|Test Suites:" "$OUT_DIR/${label}_r10.log" | tail -20 \
    > "$OUT_DIR/${label}_r10.summary" || true
}

run_finalize() {
  local label="$1" dir="$2"
  prepare_tree "$dir"
  cd "$dir/backend"
  npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1 || true
  set +e
  npm run test:trip-finalize:postgres:ci > "$OUT_DIR/${label}_finalize.log" 2>&1
  local code=$?
  set -e
  echo "${label}_FINALIZE_EXIT:${code}" | tee "$OUT_DIR/${label}_finalize.exit"
  rg -n "^(FAIL|PASS) |Tests:|Test Suites:|● " "$OUT_DIR/${label}_finalize.log" | tail -30 \
    > "$OUT_DIR/${label}_finalize.summary" || true
}

run_r11_pg() {
  local label="$1" dir="$2"
  prepare_tree "$dir"
  cd "$dir/backend"
  npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1 || true
  set +e
  npm run test:trip-r11:postgres-redis:ci > "$OUT_DIR/${label}_r11_pg.log" 2>&1
  local code=$?
  set -e
  echo "${label}_R11_PG_EXIT:${code}" | tee "$OUT_DIR/${label}_r11_pg.exit"
  rg -n "^(FAIL|PASS) |Tests:|Test Suites:|● " "$OUT_DIR/${label}_r11_pg.log" | tail -40 \
    > "$OUT_DIR/${label}_r11_pg.summary" || true
}

run_shadow_pg() {
  local label="$1" dir="$2"
  prepare_tree "$dir"
  cd "$dir/backend"
  npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1 || true
  set +e
  npm run test:trip-fsm-shadow:postgres-redis:ci > "$OUT_DIR/${label}_shadow_pg.log" 2>&1
  local code=$?
  set -e
  echo "${label}_SHADOW_PG_EXIT:${code}" | tee "$OUT_DIR/${label}_shadow_pg.exit"
  rg -n "^(FAIL|PASS) |Tests:|Test Suites:|✓|✕|● " "$OUT_DIR/${label}_shadow_pg.log" | tail -40 \
    > "$OUT_DIR/${label}_shadow_pg.summary" || true
}

echo "=== BASE_SHA=${BASE_SHA} HEAD_DIR=${HEAD_DIR} ==="

run_r10 BASE "$BASE_DIR"
run_r10 HEAD "$HEAD_DIR"

run_finalize BASE "$BASE_DIR"
run_finalize HEAD "$HEAD_DIR"

run_r11_pg BASE "$BASE_DIR"
run_r11_pg HEAD "$HEAD_DIR"

if [[ -f "$HEAD_DIR/backend/package.json" ]] && rg -q "test:trip-fsm-shadow:postgres-redis:ci" "$HEAD_DIR/backend/package.json"; then
  run_shadow_pg HEAD "$HEAD_DIR"
fi

echo "=== differential complete; artifacts in ${OUT_DIR} ==="
