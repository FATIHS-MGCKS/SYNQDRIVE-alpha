#!/usr/bin/env bash
# Injectable test hooks for Stage-2 activation / atomic rollback selftests.
set -euo pipefail

BATTERY_V2_STAGE2_TEST_STATE_DIR="${BATTERY_V2_STAGE2_TEST_STATE_DIR:-$(mktemp -d)}"
export BATTERY_V2_STAGE2_TEST_STATE_DIR

battery_v2_stage2_test_state_file() {
  echo "${BATTERY_V2_STAGE2_TEST_STATE_DIR}/runtime.state"
}

battery_v2_stage2_test_write_state() {
  local key="$1"
  local value="$2"
  local file
  file="$(battery_v2_stage2_test_state_file)"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  grep -v -E "^${key}=" "$file" > "${file}.tmp" 2>/dev/null || true
  echo "${key}=${value}" >> "${file}.tmp"
  mv "${file}.tmp" "$file"
}

battery_v2_stage2_test_read_state() {
  local key="$1"
  local default="${2:-}"
  local file
  file="$(battery_v2_stage2_test_state_file)"
  if [[ -f "$file" ]]; then
    grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || echo "$default"
  else
    echo "$default"
  fi
}

battery_v2_stage2_test_rolling_deploy_hook() {
  local _current="$1"
  local _target_sha="$2"
  local phase="${BATTERY_V2_STAGE2_ROLLBACK_PHASE:-0}"
  local fail_at="${BATTERY_V2_STAGE2_TEST_FAIL_AT:-}"

  if [[ "$phase" == "1" ]]; then
    if [[ "${BATTERY_V2_STAGE2_TEST_ROLLBACK_FAIL:-}" == "yes" ]]; then
      return 1
    fi
    battery_v2_stage2_test_write_state "replica_a_config" "old"
    battery_v2_stage2_test_write_state "replica_b_config" "old"
    battery_v2_stage2_test_write_state "rollback_restarts" "2"
    return 0
  fi

  case "$fail_at" in
    pre_deploy)
      return 1
      ;;
    after_replica_a)
      battery_v2_stage2_test_write_state "replica_a_config" "stage2"
      battery_v2_stage2_test_write_state "replica_b_config" "old"
      return 1
      ;;
    post_deploy_verify)
      battery_v2_stage2_test_write_state "replica_a_config" "stage2"
      battery_v2_stage2_test_write_state "replica_b_config" "stage2"
      return 0
      ;;
    success)
      battery_v2_stage2_test_write_state "replica_a_config" "stage2"
      battery_v2_stage2_test_write_state "replica_b_config" "stage2"
      return 0
      ;;
    *)
      battery_v2_stage2_test_write_state "replica_a_config" "stage2"
      battery_v2_stage2_test_write_state "replica_b_config" "stage2"
      return 0
      ;;
  esac
}

battery_v2_stage2_test_verify_post_deploy_hook() {
  local _current="$1"
  local _target_sha="$2"
  local fail_at="${BATTERY_V2_STAGE2_TEST_FAIL_AT:-}"
  if [[ "${BATTERY_V2_STAGE2_ROLLBACK_PHASE:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "$fail_at" == "post_deploy_verify" ]]; then
    return 1
  fi
  return 0
}

battery_v2_stage2_test_runtime_mixed_check() {
  local a b
  a="$(battery_v2_stage2_test_read_state replica_a_config old)"
  b="$(battery_v2_stage2_test_read_state replica_b_config old)"
  [[ "$a" == "$b" ]]
}

battery_v2_stage2_test_reset_state() {
  rm -f "$(battery_v2_stage2_test_state_file)"
}
