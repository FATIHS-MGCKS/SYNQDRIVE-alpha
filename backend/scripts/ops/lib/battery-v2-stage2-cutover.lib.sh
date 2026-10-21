#!/usr/bin/env bash
# Battery V2 Stage-2 cutover contract helpers (shell + CI selftests).
set -euo pipefail

battery_v2_stage2_contract_expected() {
  cat <<'EOF'
BATTERY_V2_REST_SHADOW_ENABLED=true
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
EOF
}

battery_v2_stage2_contract_is_valid() {
  local rest_shadow="${1:-}"
  local publication="${2:-}"
  local reconciliation="${3:-true}"
  [[ "$rest_shadow" == "true" && "$publication" == "true" && "$reconciliation" == "true" ]]
}

battery_v2_invalid_m31_contract_is_active() {
  local rest_shadow="${1:-}"
  local publication="${2:-}"
  [[ "$rest_shadow" == "false" && "$publication" == "true" ]]
}

battery_v2_stage2_contract_reject_invalid() {
  local rest_shadow="${1:-}"
  local publication="${2:-}"
  if battery_v2_invalid_m31_contract_is_active "$rest_shadow" "$publication"; then
    echo "ERROR: invalid M3.1 contract REST_SHADOW=false + PUBLICATION=true disables canonical REST pipeline" >&2
    echo "Use vps-enable-battery-v2-stage2-production.sh (Stage-2: REST_SHADOW=true + PUBLICATION=true)" >&2
    return 1
  fi
  if ! battery_v2_stage2_contract_is_valid "$rest_shadow" "$publication"; then
    echo "ERROR: Stage-2 contract requires REST_SHADOW=true, PUBLICATION=true, RECONCILIATION=true" >&2
    return 1
  fi
}

# Canonical PKG-01 guard marker (must match lv-rest-assessment-handoff.policy.ts).
BATTERY_V2_PKG01_GUARD_VERSION_EXPECTED='2026-09-03-valid-only-handoff'

battery_v2_stage2_read_replica_role() {
  local port="$1"
  if [[ -n "${BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT:-}" ]]; then
    local mapped
    mapped="$(printf '%s' "${BATTERY_V2_TEST_REPLICA_ROLE_BY_PORT}" | tr ',' '\n' | sed -n "s/^${port}://p")"
    if [[ -n "$mapped" ]]; then
      echo "$mapped"
      return 0
    fi
  fi
  local body
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || true)
  if [[ -z "$body" ]]; then
    echo "UNREACHABLE"
    return 0
  fi
  printf '%s' "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('checks',{}).get('schedulerLeader',{}).get('details',{}).get('role','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN"
}

battery_v2_stage2_scheduler_topology_preflight() {
  local script_dir replica_count port_a port_b role_a role_b leaders=0
  script_dir="${BATTERY_V2_OPS_SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  replica_count="${SYNQDRIVE_PRODUCTION_REPLICA_COUNT:-2}"
  # shellcheck source=../vps-production-replica-topology.config.sh
  source "${script_dir}/vps-production-replica-topology.config.sh"
  port_a="${SYNQDRIVE_REPLICA_A_PORT}"
  port_b="${SYNQDRIVE_REPLICA_B_PORT}"

  role_a="$(battery_v2_stage2_read_replica_role "$port_a")"
  echo "port_${port_a}_role=${role_a}"
  if [[ "$role_a" == "UNKNOWN" || "$role_a" == "UNREACHABLE" ]]; then
    echo "SCHEDULER_TOPOLOGY_PREFLIGHT=FAIL"
    echo "ERROR: replica A readiness role=${role_a}" >&2
    return 1
  fi
  [[ "$role_a" == "LEADER" ]] && leaders=$((leaders + 1))

  if [[ "$replica_count" -ge 2 ]]; then
    role_b="$(battery_v2_stage2_read_replica_role "$port_b")"
    echo "port_${port_b}_role=${role_b}"
    if [[ "$role_b" == "UNKNOWN" || "$role_b" == "UNREACHABLE" ]]; then
      echo "SCHEDULER_TOPOLOGY_PREFLIGHT=FAIL"
      echo "ERROR: replica B readiness role=${role_b}" >&2
      return 1
    fi
    [[ "$role_b" == "LEADER" ]] && leaders=$((leaders + 1))
  else
    echo "port_${port_b}_role=N/A"
  fi

  echo "SCHEDULER_LEADERS=${leaders}"
  if [[ "$leaders" -ne 1 ]]; then
    echo "SCHEDULER_TOPOLOGY_PREFLIGHT=FAIL"
    echo "ERROR: expected exactly 1 scheduler leader, got ${leaders}" >&2
    return 1
  fi
  echo "SCHEDULER_TOPOLOGY_PREFLIGHT=PASS"
  return 0
}

battery_v2_stage2_verify_pkg01_guard_deployed() {
  local current="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
  local guard_file="${current}/backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-assessment-handoff.policy.ts"
  local deployed_sha

  if [[ ! -f "$guard_file" ]]; then
    echo "PKG01_GUARD_DEPLOYED=NO"
    echo "ERROR: guard policy file missing at ${guard_file}" >&2
    return 1
  fi
  if ! grep -q "BATTERY_V2_PKG01_PRE_CUTOVER_GUARD_VERSION" "$guard_file" \
    || ! grep -q "${BATTERY_V2_PKG01_GUARD_VERSION_EXPECTED}" "$guard_file"; then
    echo "PKG01_GUARD_DEPLOYED=NO"
    echo "ERROR: PKG-01 guard marker not present in deployed release" >&2
    return 1
  fi

  deployed_sha="$(git -C "$current" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "DEPLOYED_SHA=${deployed_sha}"
  if [[ -n "${BATTERY_V2_STAGE2_MIN_DEPLOYED_SHA:-}" && "$deployed_sha" != "unknown" ]]; then
    if ! git -C "$current" merge-base --is-ancestor "${BATTERY_V2_STAGE2_MIN_DEPLOYED_SHA}" HEAD 2>/dev/null; then
      echo "PKG01_GUARD_DEPLOYED=NO"
      echo "ERROR: deployed SHA ${deployed_sha} does not contain min guard SHA ${BATTERY_V2_STAGE2_MIN_DEPLOYED_SHA}" >&2
      return 1
    fi
    echo "PKG01_GUARD_MIN_SHA=${BATTERY_V2_STAGE2_MIN_DEPLOYED_SHA}"
  fi

  echo "PKG01_GUARD_DEPLOYED=YES"
  echo "PKG01_GUARD_VERSION=${BATTERY_V2_PKG01_GUARD_VERSION_EXPECTED}"
  return 0
}

battery_v2_stage2_pkg01_sql_counts() {
  local psql_url="$1"
  psql "$psql_url" -t -A <<'SQL'
SELECT
  COUNT(*)::text AS total,
  COUNT(*) FILTER (
    WHERE m.quality = 'VALID'
      AND COALESCE(m.provenance->>'sourceObservationId', '') <> ''
  )::text AS valid_cnt,
  COUNT(*) FILTER (
    WHERE m.quality <> 'VALID'
      AND COALESCE(m.provenance->>'sourceObservationId', '') <> ''
  )::text AS non_valid_cnt,
  COUNT(*) FILTER (
    WHERE COALESCE(m.provenance->>'sourceObservationId', '') = ''
  )::text AS unresolved_cnt
FROM battery_measurements m
INNER JOIN battery_measurement_sessions s
  ON s.id = m.session_id AND s.organization_id = m.organization_id
WHERE m.type IN ('REST_60M', 'REST_6H')
  AND COALESCE(
    s.metadata #>> ARRAY['scheduledTargets', m.type::text, 'assessmentHandoff', 'status'],
    'MISSING'
  ) = 'ENQUEUED';
SQL
}

battery_v2_stage2_read_env_flag() {
  local file="$1"
  local key="$2"
  local default="${3:-}"
  if [[ -f "$file" ]]; then
    grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || echo "$default"
  else
    echo "$default"
  fi
}

battery_v2_stage2_env_has_stage2_contract() {
  local file="$1"
  battery_v2_stage2_contract_is_valid \
    "$(battery_v2_stage2_read_env_flag "$file" BATTERY_V2_REST_SHADOW_ENABLED false)" \
    "$(battery_v2_stage2_read_env_flag "$file" BATTERY_V2_PUBLICATION_ENABLED false)" \
    "$(battery_v2_stage2_read_env_flag "$file" BATTERY_V2_RECONCILIATION_ENABLED true)"
}

battery_v2_stage2_pkg01_preflight_backlog_gate() {
  local valid_cnt="${1:-ERR}"
  local unresolved_cnt="${2:-ERR}"

  if [[ "$unresolved_cnt" != "0" ]]; then
    echo "PKG01_PREFLIGHT=FAIL"
    echo "PKG01_PRE_T0_VALID_BACKLOG_GATE=FAIL"
    echo "ERROR: unresolved PKG-01 ENQUEUED identities=${unresolved_cnt}" >&2
    return 1
  fi
  if [[ "$valid_cnt" != "0" ]]; then
    echo "PKG01_PREFLIGHT=FAIL"
    echo "PKG01_PRE_T0_VALID_BACKLOG_GATE=FAIL"
    echo "ERROR: VALID ENQUEUED PKG-01 backlog=${valid_cnt} requires forensic classification before Stage-2 recovery activation" >&2
    return 1
  fi
  echo "PKG01_PRE_T0_VALID_BACKLOG_GATE=PASS"
  return 0
}

battery_v2_stage2_rolling_deploy() {
  if declare -F battery_v2_stage2_test_rolling_deploy_hook >/dev/null 2>&1; then
    battery_v2_stage2_test_rolling_deploy_hook "$@"
    return $?
  fi
  vps_replica_rolling_deploy "$@"
}

battery_v2_stage2_verify_post_deploy() {
  if declare -F battery_v2_stage2_test_verify_post_deploy_hook >/dev/null 2>&1; then
    battery_v2_stage2_test_verify_post_deploy_hook "$@"
    return $?
  fi
  vps_replica_verify_post_deploy "$@"
}

# Atomic env rollback: restore backend.env then restart ALL replicas on unchanged release SHA.
battery_v2_stage2_execute_atomic_env_rollback() {
  local backend_env="$1"
  local backup_file="$2"
  local current="$3"
  local target_sha="$4"

  echo "=== ATOMIC ENV ROLLBACK BEGIN ==="
  echo "ROLLBACK_TARGET_SHA=${target_sha}"

  if [[ ! -f "$backup_file" ]]; then
    echo "ROLLBACK_ENV_RESTORED=NO"
    echo "ROLLBACK_REPLICAS_RESTARTED=NO"
    echo "ROLLBACK_SCHEDULER_CONVERGED=NO"
    echo "ROLLBACK_RUNTIME_VERIFIED=NO"
    return 1
  fi

  cp "$backup_file" "$backend_env"
  chmod 600 "$backend_env"
  if ! cmp -s "$backup_file" "$backend_env"; then
    echo "ROLLBACK_ENV_RESTORED=NO"
    echo "ROLLBACK_RUNTIME_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_ENV_RESTORED=YES"

  export BATTERY_V2_STAGE2_ROLLBACK_PHASE=1
  if ! battery_v2_stage2_rolling_deploy "$current" "$target_sha"; then
    unset BATTERY_V2_STAGE2_ROLLBACK_PHASE
    echo "ROLLBACK_REPLICAS_RESTARTED=NO"
    echo "ROLLBACK_SCHEDULER_CONVERGED=NO"
    echo "ROLLBACK_RUNTIME_VERIFIED=NO"
    return 1
  fi
  echo "ROLLBACK_REPLICAS_RESTARTED=YES"

  if ! battery_v2_stage2_verify_post_deploy "$current" "$target_sha"; then
    unset BATTERY_V2_STAGE2_ROLLBACK_PHASE
    echo "ROLLBACK_SCHEDULER_CONVERGED=NO"
    echo "ROLLBACK_RUNTIME_VERIFIED=NO"
    return 1
  fi

  if ! battery_v2_stage2_scheduler_topology_preflight; then
    unset BATTERY_V2_STAGE2_ROLLBACK_PHASE
    echo "ROLLBACK_SCHEDULER_CONVERGED=NO"
    echo "ROLLBACK_RUNTIME_VERIFIED=NO"
    return 1
  fi
  unset BATTERY_V2_STAGE2_ROLLBACK_PHASE
  echo "ROLLBACK_SCHEDULER_CONVERGED=YES"

  if ! cmp -s "$backup_file" "$backend_env"; then
    echo "ROLLBACK_MIXED_CONFIG_DETECTED=YES"
    echo "ROLLBACK_RUNTIME_VERIFIED=NO"
    return 1
  fi
  if battery_v2_stage2_env_has_stage2_contract "$backend_env" \
    && ! battery_v2_stage2_env_has_stage2_contract "$backup_file"; then
    echo "ROLLBACK_MIXED_CONFIG_DETECTED=YES"
    echo "ROLLBACK_RUNTIME_VERIFIED=NO"
    return 1
  fi

  if declare -F battery_v2_stage2_test_runtime_mixed_check >/dev/null 2>&1; then
    if ! battery_v2_stage2_test_runtime_mixed_check; then
      echo "ROLLBACK_MIXED_RUNTIME_DETECTED=YES"
      echo "ROLLBACK_RUNTIME_VERIFIED=NO"
      return 1
    fi
  fi

  echo "ROLLBACK_RUNTIME_VERIFIED=YES"
  echo "ATOMIC_ROLLBACK_SUCCESSFUL=YES"
  return 0
}

battery_v2_stage2_emit_manual_recovery() {
  local backup_file="$1"
  local backend_env="$2"
  cat <<EOF
MANUAL_RECOVERY_REQUIRED=YES
MANUAL_RECOVERY_STEPS:
  1. cp ${backup_file} ${backend_env}
  2. chmod 600 ${backend_env}
  3. rolling-restart ALL production replicas from ${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}
  4. verify exactly one scheduler leader and external health
  5. confirm no replica retains Stage-2 env in memory while backend.env is restored
EOF
}
