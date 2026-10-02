#!/usr/bin/env bash
# RFRF F10.1 production rollout operational helpers — sourced only.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# Production preflight requires an explicit approved deploy SHA — no silent default.
RFRF_REQUIRED_GIT_SHA="${RFRF_REQUIRED_GIT_SHA:-}"
RFRF_PROMETHEUS_URL="${RFRF_PROMETHEUS_URL:-http://127.0.0.1:9090}"
RFRF_REPLICA_A_PORT="${SYNQDRIVE_REPLICA_A_PORT:-3001}"
RFRF_REPLICA_B_PORT="${SYNQDRIVE_REPLICA_B_PORT:-3002}"

RFRF_FLAG_MASTER="RAW_FUEL_REFUEL_FALLBACK_ENABLED"
RFRF_FLAG_PERSIST="RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED"
RFRF_FLAG_CONVERGENCE="RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED"
RFRF_FLAG_PROMOTION="RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED"
RFRF_FLAG_G2_HANDOFF="RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED"
RFRF_FLAG_CUTOVER="RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT"

RFRF_G2_FLAG_V2="PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED"
RFRF_G2_FLAG_RECOVERY="PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED"
RFRF_G2_FLAG_CUTOVER="PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT"

RFRF_FORBIDDEN_TEST_ENV_PATTERNS=(
  'RAW_FUEL_REFUEL_F[0-9]_INTEGRATION'
  'RAW_FUEL_REFUEL_F[0-9]_POSTGRES_REQUIRED'
  'RAW_FUEL_REFUEL_F[0-9]_REDIS_REQUIRED'
)

RFRF_REQUIRED_F8_ALERTS=(
  PhysicalRefuelOrphanBacklogPersistent
  PhysicalRefuelLostEnqueueBacklogPersistent
  PhysicalRefuelStaleEnrichmentBacklogPersistent
  PhysicalRefuelRecoverySchedulerStale
  PhysicalRefuelRecoveryFailuresElevated
)

RFRF_REQUIRED_MIGRATIONS=(
  20260912123000_rfrf_f2_raw_refuel_candidates
  20260913120000_rfrf_f4_pr1_vehicle_energy_event_source_identity
  20260914120000_rfrf_f5_pr1_converged_native_lifecycle
)

# EXP-021 coordinator/canary authorities — canonical config from reference-capture.config.ts
RFRF_EXP021_IMMEDIATE_CONFIG_KEYS=(
  EXP021_FLEET_COORDINATOR_ENABLED
  EXP021_FLEET_DRY_RUN
  EXP021_FLEET_COORDINATOR_INTERVAL_MS
  EXP021_MATURATION_SHADOW_ENABLED
  EXP021_MATURATION_SHADOW_HF_LANE_ENABLED
  EXP021_MATURATION_SHADOW_SETTLEMENT_LANE_ENABLED
)

# VDC physical-state authorities — canonical config from connectivity-physical-state*.config.ts
RFRF_VDC_IMMEDIATE_CONFIG_KEYS=(
  CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED
  CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED
  CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED
  CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_OBSERVATION_RETENTION_DAYS
  CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID
)

# Obsolete env names from pre-VDC-RB-019 tooling drafts — not enforced
RFRF_VDC_OBSOLETE_CONFIG_KEYS=(
  DEVICE_CONNECTION_PHYSICAL_AUTHORITY_MODE
  DEVICE_CONNECTION_PHYSICAL_SHADOW_COMPARE_ENABLED
  DEVICE_CONNECTION_PHYSICAL_PILOT_ENABLED
)

RFRF_EXP021_IMMEDIATE_DATA_KEYS=(
  EXP021_STUDIES
  EXP021_ENROLLMENTS
  EXP021_RUNS
  EXP021_GLOBAL_BALANCES
  EXP021_VEHICLE_BALANCES
)

RFRF_VDC_IMMEDIATE_DATA_KEYS=(
  VDC_PHYSICAL_STATES
  VDC_SHADOW_OBS
  VDC_AUTHORITY_MODE
  VDC_PILOT_EPOCH
)

rfrf_rollout_log() {
  printf '[rfrf-rollout] %s\n' "$*"
}

rfrf_rollout_fail() {
  echo "RFRF_ROLLOUT=BLOCKED"
  echo "ERROR: $*" >&2
  return 1
}

# Safe dotenv key read — never sources the file as shell; no $ expansion or command substitution.
rfrf_dotenv_get() {
  local file="$1" key="$2"
  if [[ ! -f "$file" ]]; then
    echo ""
    return 0
  fi
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const key = process.argv[2];
    let found = "";
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m || m[1] !== key) continue;
      let v = m[2];
      const dq = String.fromCharCode(34);
      const sq = String.fromCharCode(39);
      if (
        (v.startsWith(dq) && v.endsWith(dq)) ||
        (v.startsWith(sq) && v.endsWith(sq))
      ) {
        v = v.slice(1, -1);
      }
      found = v;
    }
    process.stdout.write(found);
  ' "$file" "$key" 2>/dev/null || true
}

rfrf_env_get() {
  rfrf_dotenv_get "$1" "$2"
}

rfrf_dotenv_database_url() {
  local file="$1" url
  url="$(rfrf_dotenv_get "$file" DATABASE_URL)"
  if [[ -z "$url" ]]; then
    echo ""
    return 0
  fi
  rfrf_psql_url_strip_schema "$url"
}

rfrf_parse_permissive_bool() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    echo "false"
    return 0
  fi
  case "${value,,}" in
    1 | true | yes | on) echo "true" ;;
    *) echo "false" ;;
  esac
}

rfrf_parse_strict_true() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    echo "false"
    return 0
  fi
  if [[ "${value,,}" == "true" ]]; then
    echo "true"
  else
    echo "false"
  fi
}

rfrf_parse_iso_cutover() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    echo "invalid"
    return 0
  fi
  node -e "
    const v = process.argv[1];
    const d = new Date(v);
    process.stdout.write(Number.isNaN(d.getTime()) ? 'invalid' : 'valid');
  " "$value" 2>/dev/null || echo "invalid"
}

rfrf_read_flag_snapshot() {
  local file="$1"
  MASTER="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_MASTER")")"
  PERSIST="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_PERSIST")")"
  CONVERGENCE="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_CONVERGENCE")")"
  PROMOTION="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_PROMOTION")")"
  G2_HANDOFF="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_G2_HANDOFF")")"
  CUTOVER_RAW="$(rfrf_env_get "$file" "$RFRF_FLAG_CUTOVER")"
  CUTOVER_STATE="$(rfrf_parse_iso_cutover "$CUTOVER_RAW")"
  G2_V2="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_G2_FLAG_V2")")"
  G2_RECOVERY="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_G2_FLAG_RECOVERY")")"
  G2_CUTOVER_RAW="$(rfrf_env_get "$file" "$RFRF_G2_FLAG_CUTOVER")"
  G2_CUTOVER_STATE="$(rfrf_parse_iso_cutover "$G2_CUTOVER_RAW")"

  echo "RFRF_FLAG_MASTER=${MASTER}"
  echo "RFRF_FLAG_PERSIST=${PERSIST}"
  echo "RFRF_FLAG_CONVERGENCE=${CONVERGENCE}"
  echo "RFRF_FLAG_PROMOTION=${PROMOTION}"
  echo "RFRF_FLAG_G2_HANDOFF=${G2_HANDOFF}"
  echo "RFRF_FLAG_CUTOVER_SET=$([[ -n "$CUTOVER_RAW" ]] && echo yes || echo no)"
  echo "RFRF_FLAG_CUTOVER_VALID=${CUTOVER_STATE}"
  echo "G2_FLAG_V2=${G2_V2}"
  echo "G2_FLAG_RECOVERY=${G2_RECOVERY}"
  echo "G2_FLAG_CUTOVER_SET=$([[ -n "$G2_CUTOVER_RAW" ]] && echo yes || echo no)"
  echo "G2_FLAG_CUTOVER_VALID=${G2_CUTOVER_STATE}"
}

rfrf_detect_stage_from_flags() {
  local file="$1"
  local master persist convergence promotion g2 handoff cutover_raw cutover_valid
  master="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_MASTER")")"
  persist="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_PERSIST")")"
  convergence="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_CONVERGENCE")")"
  promotion="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_PROMOTION")")"
  g2="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_G2_HANDOFF")")"
  cutover_raw="$(rfrf_env_get "$file" "$RFRF_FLAG_CUTOVER")"
  cutover_valid="$(rfrf_parse_iso_cutover "$cutover_raw")"

  if [[ "$g2" == "true" ]]; then echo 6; return; fi
  if [[ "$promotion" == "true" ]]; then echo 5; return; fi
  if [[ "$convergence" == "true" ]]; then echo 4; return; fi
  if [[ "$persist" == "true" ]]; then echo 3; return; fi
  if [[ "$master" == "true" ]]; then echo 2; return; fi
  if [[ -n "$cutover_raw" && "$cutover_valid" == "valid" ]]; then echo 1; return; fi
  echo 0
}

rfrf_stage_expected_flags() {
  local stage="$1"
  case "$stage" in
    0) echo "master=false persist=false convergence=false promotion=false g2=false cutover=unset" ;;
    1) echo "master=false persist=false convergence=false promotion=false g2=false cutover=required_valid" ;;
    2) echo "master=true persist=false convergence=false promotion=false g2=false cutover=required_valid" ;;
    3) echo "master=true persist=true convergence=false promotion=false g2=false cutover=required_valid" ;;
    4) echo "master=true persist=true convergence=true promotion=false g2=false cutover=required_valid" ;;
    5) echo "master=true persist=true convergence=true promotion=true g2=false cutover=required_valid" ;;
    6) echo "master=true persist=true convergence=true promotion=true g2=true cutover=required_valid" ;;
    *) echo "invalid" ;;
  esac
}

rfrf_stage_matches_file() {
  local stage="$1" file="$2"
  local master persist convergence promotion g2 cutover_raw cutover_valid
  master="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_MASTER")")"
  persist="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_PERSIST")")"
  convergence="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_CONVERGENCE")")"
  promotion="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_PROMOTION")")"
  g2="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_G2_HANDOFF")")"
  cutover_raw="$(rfrf_env_get "$file" "$RFRF_FLAG_CUTOVER")"
  cutover_valid="$(rfrf_parse_iso_cutover "$cutover_raw")"

  case "$stage" in
    0)
      [[ "$master" == "false" && "$persist" == "false" && "$convergence" == "false" && "$promotion" == "false" && "$g2" == "false" && -z "$cutover_raw" ]]
      ;;
    1)
      [[ "$master" == "false" && "$persist" == "false" && "$convergence" == "false" && "$promotion" == "false" && "$g2" == "false" && -n "$cutover_raw" && "$cutover_valid" == "valid" ]]
      ;;
    2)
      [[ "$master" == "true" && "$persist" == "false" && "$convergence" == "false" && "$promotion" == "false" && "$g2" == "false" && -n "$cutover_raw" && "$cutover_valid" == "valid" ]]
      ;;
    3)
      [[ "$master" == "true" && "$persist" == "true" && "$convergence" == "false" && "$promotion" == "false" && "$g2" == "false" && -n "$cutover_raw" && "$cutover_valid" == "valid" ]]
      ;;
    4)
      [[ "$master" == "true" && "$persist" == "true" && "$convergence" == "true" && "$promotion" == "false" && "$g2" == "false" && -n "$cutover_raw" && "$cutover_valid" == "valid" ]]
      ;;
    5)
      [[ "$master" == "true" && "$persist" == "true" && "$convergence" == "true" && "$promotion" == "true" && "$g2" == "false" && -n "$cutover_raw" && "$cutover_valid" == "valid" ]]
      ;;
    6)
      [[ "$master" == "true" && "$persist" == "true" && "$convergence" == "true" && "$promotion" == "true" && "$g2" == "true" && -n "$cutover_raw" && "$cutover_valid" == "valid" ]]
      ;;
    *) return 1 ;;
  esac
}

rfrf_is_fixture_mode() {
  [[ "${RFRF_FIXTURE_MODE:-0}" == "1" || "${DRY_RUN:-0}" == "1" ]]
}

# F10.4.0.2 — DRY_RUN alone does not imply fixture; rollback dry-run SHA rules use this.
rfrf_is_rollback_fixture_context() {
  [[ "${RFRF_FIXTURE_MODE:-0}" == "1" || "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]
}

rfrf_require_approved_deploy_sha() {
  if [[ -n "${RFRF_REQUIRED_GIT_SHA:-}" ]]; then
    return 0
  fi
  if rfrf_is_fixture_mode; then
    return 0
  fi
  rfrf_rollout_fail "RFRF_REQUIRED_GIT_SHA must be set explicitly for production rollout preflight"
  return 1
}

rfrf_assert_can_enter_stage() {
  local target="$1" file="$2" proposed_cutover="${3:-}"
  local current
  current="$(rfrf_detect_stage_from_flags "$file")"

  if (( target < 0 || target > 6 )); then
    rfrf_rollout_fail "invalid stage ${target}"
    return 1
  fi

  if (( target == 0 )); then
    return 0
  fi

  if (( current + 1 != target )); then
    rfrf_rollout_fail "stage skip/forbidden transition: current=${current} target=${target} (exactly +1 required)"
    return 1
  fi

  if (( target == 1 )); then
    if [[ -z "$proposed_cutover" ]]; then
      rfrf_rollout_fail "stage 1 requires explicit proposed cutover (RFRF_CUTOVER_AT)"
      return 1
    fi
    if [[ "$(rfrf_parse_iso_cutover "$proposed_cutover")" != "valid" ]]; then
      rfrf_rollout_fail "proposed cutover invalid for stage 1: ${proposed_cutover}"
      return 1
    fi
    return 0
  fi

  if (( target >= 2 )); then
    local cutover_raw cutover_valid
    cutover_raw="$(rfrf_env_get "$file" "$RFRF_FLAG_CUTOVER")"
    cutover_valid="$(rfrf_parse_iso_cutover "$cutover_raw")"
    if [[ -z "$cutover_raw" || "$cutover_valid" != "valid" ]]; then
      rfrf_rollout_fail "valid persisted ${RFRF_FLAG_CUTOVER} required before stage ${target}"
      return 1
    fi
  fi

  if (( target >= 5 )); then
    local convergence
    convergence="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_CONVERGENCE")")"
    if [[ "$convergence" != "true" ]]; then
      rfrf_rollout_fail "convergence authority must be true before stage 5"
      return 1
    fi
  fi

  if (( target == 6 )); then
    rfrf_assert_stage6_downstream_gates "$file" || return 1
  fi

  return 0
}

rfrf_assert_stage6_downstream_gates() {
  local file="$1"
  local promotion g2_v2 g2_recovery g2_cutover_raw g2_cutover_valid
  promotion="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_PROMOTION")")"
  g2_v2="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_G2_FLAG_V2")")"
  g2_recovery="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_G2_FLAG_RECOVERY")")"
  g2_cutover_raw="$(rfrf_env_get "$file" "$RFRF_G2_FLAG_CUTOVER")"
  g2_cutover_valid="$(rfrf_parse_iso_cutover "$g2_cutover_raw")"

  if [[ "$promotion" != "true" ]]; then
    rfrf_rollout_fail "promotion authority must be true before stage 6"
    return 1
  fi
  if [[ "$g2_v2" != "true" ]]; then
    rfrf_rollout_fail "${RFRF_G2_FLAG_V2} must be true before stage 6"
    return 1
  fi
  if [[ "$g2_recovery" != "true" ]]; then
    rfrf_rollout_fail "${RFRF_G2_FLAG_RECOVERY} must be true before stage 6"
    return 1
  fi
  if [[ -z "$g2_cutover_raw" || "$g2_cutover_valid" != "valid" ]]; then
    rfrf_rollout_fail "valid ${RFRF_G2_FLAG_CUTOVER} required before stage 6"
    return 1
  fi

  echo "DUAL_CUTOVER_INVARIANT=INDEPENDENT_AUTHORITIES"
  echo "G2_V2_CUTOVER_RELATION=NO_ORDERING_ENFORCED_BY_RUNTIME"
  return 0
}

rfrf_forbidden_test_env_present() {
  local file="$1"
  local key
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  while IFS= read -r line; do
    key="${line%%=*}"
    for pat in "${RFRF_FORBIDDEN_TEST_ENV_PATTERNS[@]}"; do
      if [[ "$key" =~ $pat ]]; then
        echo "$key"
        return 0
      fi
    done
  done < <(grep -E '^[A-Z0-9_]+=' "$file" || true)
  return 1
}

rfrf_same_dir_temp() {
  local file="$1"
  local dir base
  dir="$(dirname "$file")"
  base="$(basename "$file")"
  mktemp "${dir}/.${base}.rfrf.XXXXXX"
}

rfrf_env_file_metadata() {
  local file="$1"
  RFRF_ENV_META_MODE="600"
  RFRF_ENV_META_OWNER=""
  if [[ -f "$file" ]]; then
    RFRF_ENV_META_MODE="$(stat -c '%a' "$file" 2>/dev/null || stat -f '%OLp' "$file" 2>/dev/null || echo 600)"
    RFRF_ENV_META_OWNER="$(stat -c '%u:%g' "$file" 2>/dev/null || stat -f '%u:%g' "$file" 2>/dev/null || echo "")"
  fi
}

rfrf_atomic_promote_env_file() {
  local tmp="$1" target="$2" label="${3:-mutation}"
  local mode="${RFRF_ENV_META_MODE:-600}"
  local owner="${RFRF_ENV_META_OWNER:-}"
  chmod "$mode" "$tmp"
  if [[ -n "$owner" ]]; then
    chown "$owner" "$tmp" 2>/dev/null || true
  fi
  mv "$tmp" "$target"
  if [[ "$label" == "restore" ]]; then
    echo "STAGE1_RESTORE_SAME_FILESYSTEM_ATOMIC_RENAME=YES"
  else
    echo "STAGE1_MUTATION_SAME_FILESYSTEM_ATOMIC_RENAME=YES"
  fi
}

rfrf_upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  rfrf_env_file_metadata "$file"
  tmp="$(rfrf_same_dir_temp "$file")"
  grep -v -E "^${key}=" "$file" >"$tmp" || true
  echo "${key}=${value}" >>"$tmp"
  rfrf_atomic_promote_env_file "$tmp" "$file" mutation
}

rfrf_remove_env_key() {
  local file="$1" key="$2"
  local tmp
  rfrf_env_file_metadata "$file"
  tmp="$(rfrf_same_dir_temp "$file")"
  grep -v -E "^${key}=" "$file" >"$tmp" || true
  rfrf_atomic_promote_env_file "$tmp" "$file" mutation
}

rfrf_apply_stage_mutations() {
  local stage="$1" file="$2" cutover_at="${3:-}"
  case "$stage" in
    0)
      rfrf_upsert_env "$file" "$RFRF_FLAG_MASTER" false
      rfrf_upsert_env "$file" "$RFRF_FLAG_PERSIST" false
      rfrf_upsert_env "$file" "$RFRF_FLAG_CONVERGENCE" false
      rfrf_upsert_env "$file" "$RFRF_FLAG_PROMOTION" false
      rfrf_upsert_env "$file" "$RFRF_FLAG_G2_HANDOFF" false
      rfrf_remove_env_key "$file" "$RFRF_FLAG_CUTOVER"
      ;;
    1)
      if [[ -z "$cutover_at" ]]; then
        rfrf_rollout_fail "stage 1 requires cutover_at"
        return 1
      fi
      rfrf_upsert_env "$file" "$RFRF_FLAG_CUTOVER" "$cutover_at"
      ;;
    2)
      rfrf_upsert_env "$file" "$RFRF_FLAG_MASTER" true
      ;;
    3)
      rfrf_upsert_env "$file" "$RFRF_FLAG_PERSIST" true
      ;;
    4)
      rfrf_upsert_env "$file" "$RFRF_FLAG_CONVERGENCE" true
      ;;
    5)
      rfrf_upsert_env "$file" "$RFRF_FLAG_PROMOTION" true
      ;;
    6)
      rfrf_upsert_env "$file" "$RFRF_FLAG_G2_HANDOFF" true
      ;;
    *)
      rfrf_rollout_fail "invalid stage ${stage}"
      return 1
      ;;
  esac
}

rfrf_apply_rollback_stage() {
  local from_stage="$1" file="$2"
  case "$from_stage" in
    6) rfrf_upsert_env "$file" "$RFRF_FLAG_G2_HANDOFF" false ;;
    5) rfrf_upsert_env "$file" "$RFRF_FLAG_PROMOTION" false ;;
    4) rfrf_upsert_env "$file" "$RFRF_FLAG_CONVERGENCE" false ;;
    3) rfrf_upsert_env "$file" "$RFRF_FLAG_PERSIST" false ;;
    2) rfrf_upsert_env "$file" "$RFRF_FLAG_MASTER" false ;;
    1) rfrf_remove_env_key "$file" "$RFRF_FLAG_CUTOVER" ;;
    *) rfrf_rollout_fail "invalid rollback from stage ${from_stage}"; return 1 ;;
  esac
}

rfrf_repo_alerts_file() {
  local root="${1:-${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}}"
  echo "${root}/backend/monitoring/prometheus/alerts.yml"
}

rfrf_verify_repo_alerts_subset() {
  local alerts_file="$1"
  local name missing=0
  if [[ ! -f "$alerts_file" ]]; then
    rfrf_rollout_fail "missing alerts file: ${alerts_file}"
    return 1
  fi
  for name in "${RFRF_REQUIRED_F8_ALERTS[@]}"; do
    if ! grep -q "alert: ${name}" "$alerts_file"; then
      echo "MISSING_ALERT=${name}"
      missing=1
    fi
  done
  if (( missing )); then
    rfrf_rollout_fail "canonical F8 alert subset missing in repo alerts.yml"
    return 1
  fi
  echo "F8_ALERT_SET_VERIFIED_IN_REPO=YES"
  return 0
}

rfrf_promtool_check_rules() {
  local alerts_file="$1"
  local strict="${2:-0}"
  if command -v promtool >/dev/null 2>&1; then
    promtool check rules "$alerts_file"
    return $?
  fi
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx synqdrive-prometheus; then
    docker exec synqdrive-prometheus promtool check rules /etc/prometheus/alerts.yml
    return $?
  fi
  if [[ "$strict" == "1" ]]; then
    rfrf_rollout_fail "promtool unavailable — production monitoring apply blocked"
    return 1
  fi
  echo "WARN: promtool unavailable — syntax check skipped (non-production gate only)"
  return 0
}

rfrf_verify_loaded_alerts() {
  local loaded_file="${1:-/opt/synqdrive/shared/prometheus/alerts.yml}"
  local name missing=0
  if [[ ! -f "$loaded_file" ]]; then
    echo "LOADED_ALERTS_FILE=present=no"
    return 1
  fi
  for name in "${RFRF_REQUIRED_F8_ALERTS[@]}"; do
    if ! grep -q "alert: ${name}" "$loaded_file"; then
      echo "MISSING_LOADED_ALERT=${name}"
      missing=1
    fi
  done
  if (( missing )); then
    return 1
  fi
  echo "F8_ALERT_SET_LOADED=YES"
  return 0
}

rfrf_observability_topology_check() {
  local prom_cfg="${1:-/opt/synqdrive/shared/prometheus/prometheus.yml}"
  local replica_a="${RFRF_REPLICA_A_PORT}"
  local replica_b="${RFRF_REPLICA_B_PORT}"

  if [[ ! -f "$prom_cfg" ]]; then
    echo "PROMETHEUS_CONFIG=present=no"
    echo "PROMETHEUS_CONFIG_DUAL_SCRAPE=NO"
    return 1
  fi

  local has_a has_b
  has_a="$(grep -c "127.0.0.1:${replica_a}" "$prom_cfg" || true)"
  has_b="$(grep -c "127.0.0.1:${replica_b}" "$prom_cfg" || true)"

  echo "PROMETHEUS_SCRAPE_REPLICA_A=$([[ "$has_a" -gt 0 ]] && echo yes || echo no)"
  echo "PROMETHEUS_SCRAPE_REPLICA_B=$([[ "$has_b" -gt 0 ]] && echo yes || echo no)"

  if [[ "$has_a" -gt 0 && "$has_b" -gt 0 ]]; then
    echo "PROMETHEUS_CONFIG_DUAL_SCRAPE=YES"
    echo "PRODUCTION_OBSERVABILITY_TOPOLOGY_COMPLETE=YES"
    return 0
  fi

  echo "PROMETHEUS_CONFIG_DUAL_SCRAPE=NO"
  echo "PRODUCTION_OBSERVABILITY_TOPOLOGY_COMPLETE=NO"
  return 1
}

rfrf_prometheus_http_get() {
  local path="$1"
  if [[ -n "${RFRF_PROMETHEUS_FIXTURE_DIR:-}" ]]; then
    case "$path" in
      /-/ready)
        echo ok
        return 0
        ;;
      /api/v1/targets)
        cat "${RFRF_PROMETHEUS_FIXTURE_DIR}/targets.json"
        return 0
        ;;
      /api/v1/rules)
        cat "${RFRF_PROMETHEUS_FIXTURE_DIR}/rules.json"
        return 0
        ;;
      /api/v1/query*)
        echo '{"status":"success","data":{"result":[{"value":[0,"0"]}]}}'
        return 0
        ;;
    esac
  fi
  if [[ -n "${RFRF_PROMETHEUS_FIXTURE:-}" && -f "${RFRF_PROMETHEUS_FIXTURE}" ]]; then
    cat "${RFRF_PROMETHEUS_FIXTURE}"
    return 0
  fi
  curl -sf "${RFRF_PROMETHEUS_URL}${path}" 2>/dev/null
}

rfrf_prometheus_live_ready() {
  if [[ -n "${RFRF_PROMETHEUS_FIXTURE_DIR:-}" || -n "${RFRF_PROMETHEUS_FIXTURE:-}" ]]; then
    echo "PROMETHEUS_LIVE_READY=YES"
    return 0
  fi
  if curl -sf "${RFRF_PROMETHEUS_URL}/-/ready" >/dev/null 2>&1; then
    echo "PROMETHEUS_LIVE_READY=YES"
    return 0
  fi
  echo "PROMETHEUS_LIVE_READY=NO"
  return 1
}

rfrf_prometheus_live_target_up() {
  local port="$1" label="$2"
  local body health
  body="$(rfrf_prometheus_http_get "/api/v1/targets")"
  if [[ -z "$body" ]]; then
    echo "PROMETHEUS_LIVE_TARGET_${label}_UP=NO"
    return 1
  fi
  health="$(printf '%s' "$body" | node -e "
    const port = process.argv[1];
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      try {
        const data = JSON.parse(raw).data?.activeTargets || [];
        const match = data.find((t) => {
          const scrape = t.scrapeUrl || t.discoveredLabels?.__address__ || '';
          return scrape.includes('127.0.0.1:' + port) || scrape.includes(':' + port);
        });
        if (!match) { process.stdout.write('missing'); return; }
        process.stdout.write(match.health === 'up' ? 'up' : (match.health || 'unknown'));
      } catch {
        process.stdout.write('parse_error');
      }
    });
  " "$port")"
  if [[ "$health" == "up" ]]; then
    echo "PROMETHEUS_LIVE_TARGET_${label}_UP=YES"
    return 0
  fi
  echo "PROMETHEUS_LIVE_TARGET_${label}_UP=NO health=${health:-unknown}"
  return 1
}

rfrf_prometheus_live_rules_gate() {
  local body name missing=0 unhealthy=0
  body="$(rfrf_prometheus_http_get "/api/v1/rules")"
  if [[ -z "$body" ]]; then
    echo "F8_ALERTS_LIVE_LOADED=NO"
    return 1
  fi
  for name in "${RFRF_REQUIRED_F8_ALERTS[@]}"; do
    local state
    state="$(printf '%s' "$body" | node -e "
      const wanted = process.argv[1];
      let raw = '';
      process.stdin.on('data', (c) => { raw += c; });
      process.stdin.on('end', () => {
        try {
          const groups = JSON.parse(raw).data?.groups || [];
          for (const group of groups) {
            for (const rule of group.rules || []) {
              if (rule.name === wanted) {
                process.stdout.write(rule.health || 'unknown');
                return;
              }
            }
          }
          process.stdout.write('missing');
        } catch {
          process.stdout.write('parse_error');
        }
      });
    " "$name")"
    echo "F8_LIVE_RULE_${name}=${state}"
    if [[ "$state" == "missing" || "$state" == "parse_error" ]]; then
      missing=1
    elif [[ "$state" == "err" ]]; then
      unhealthy=1
    fi
  done
  if (( missing || unhealthy )); then
    echo "F8_ALERTS_LIVE_LOADED=NO"
    return 1
  fi
  echo "F8_ALERTS_LIVE_LOADED=YES"
  return 0
}

rfrf_verify_live_observability_gates() {
  local prom_cfg="${1:-/opt/synqdrive/shared/prometheus/prometheus.yml}"
  local blocked=0

  rfrf_observability_topology_check "$prom_cfg" || blocked=1
  rfrf_prometheus_live_ready || blocked=1
  rfrf_prometheus_live_target_up "$RFRF_REPLICA_A_PORT" "A" || blocked=1
  rfrf_prometheus_live_target_up "$RFRF_REPLICA_B_PORT" "B" || blocked=1

  local repo_alerts loaded_alerts
  repo_alerts="$(rfrf_repo_alerts_file "${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}")"
  loaded_alerts="${PROM_DIR:-/opt/synqdrive/shared/prometheus}/alerts.yml"
  if rfrf_verify_repo_alerts_subset "$repo_alerts"; then
    echo "F8_ALERT_FILES_PRESENT=YES"
  else
    echo "F8_ALERT_FILES_PRESENT=NO"
    blocked=1
  fi
  if rfrf_verify_loaded_alerts "$loaded_alerts"; then
    echo "F8_ALERT_FILES_LOADED_COPY=YES"
  else
    echo "F8_ALERT_FILES_LOADED_COPY=NO"
    blocked=1
  fi
  rfrf_prometheus_live_rules_gate || blocked=1

  if (( blocked )); then
    echo "PROMETHEUS_LIVE_OBSERVABILITY_GATE=BLOCKED"
    return 1
  fi
  echo "PROMETHEUS_LIVE_OBSERVABILITY_GATE=PASS"
  return 0
}

rfrf_verify_worker_readiness() {
  local port="$1"
  local body
  body="$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || true)"
  if [[ -z "$body" ]]; then
    echo "READINESS_${port}=BLOCKED"
    echo "REDIS_${port}=unknown"
    echo "WORKERS_${port}=unknown"
    echo "WORKERS_ENABLED_${port}=no"
    echo "WORKER_READINESS_${port}=UNREACHABLE"
    return 1
  fi
  if printf '%s' "$body" | node -e '
    let raw = "";
    process.stdin.on("data", (c) => { raw += c; });
    process.stdin.on("end", () => {
      const port = process.argv[1];
      if (!port) {
        process.exit(2);
      }
      try {
        const j = JSON.parse(raw);
        const readinessOk = j.status === "ok";
        const redis = j.checks?.redis?.status || "unknown";
        const workers = j.checks?.workers?.status || "unknown";
        const workersEnabled = j.checks?.workers?.details?.workersEnabled === true ? "yes" : "no";
        const gateOk = readinessOk && redis === "ok" && workers === "ok" && workersEnabled === "yes";
        console.log(`READINESS_${port}=${readinessOk ? "PASS" : "BLOCKED"}`);
        console.log(`REDIS_${port}=${redis}`);
        console.log(`WORKERS_${port}=${workers}`);
        console.log(`WORKERS_ENABLED_${port}=${workersEnabled}`);
        console.log(`WORKER_READINESS_${port}=${gateOk ? "PASS" : "BLOCKED"}`);
        process.exit(gateOk ? 0 : 1);
      } catch {
        console.log(`READINESS_${port}=BLOCKED`);
        console.log(`REDIS_${port}=unknown`);
        console.log(`WORKERS_${port}=unknown`);
        console.log(`WORKERS_ENABLED_${port}=no`);
        console.log(`WORKER_READINESS_${port}=BLOCKED`);
        process.exit(1);
      }
    });
  ' "$port"; then
    return 0
  fi
  return 1
}

rfrf_verify_dual_replica_worker_readiness() {
  local blocked=0
  rfrf_verify_worker_readiness "$RFRF_REPLICA_A_PORT" || blocked=1
  rfrf_verify_worker_readiness "$RFRF_REPLICA_B_PORT" || blocked=1
  if (( blocked )); then
    echo "REDIS_WORKER_READINESS_GATE=BLOCKED"
    return 1
  fi
  echo "REDIS_WORKER_READINESS_GATE=PASS"
  return 0
}

rfrf_prometheus_instant_scalar() {
  local query="$1"
  local encoded body
  encoded="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$query")"
  body="$(rfrf_prometheus_http_get "/api/v1/query?query=${encoded}")"
  if [[ -z "$body" ]]; then
    echo "ERR"
    return 1
  fi
  printf '%s' "$body" | node -e '
    let raw="";
    process.stdin.on("data",(c)=>{raw+=c});
    process.stdin.on("end",()=>{
      try{
        const j=JSON.parse(raw);
        const v=j.data?.result?.[0]?.value?.[1];
        process.stdout.write(v == null ? "ERR" : String(v));
      }catch{process.stdout.write("ERR");}
    });
  '
}

rfrf_psql_url_strip_schema() {
  local url="$1"
  node -e "
    const u = process.argv[1];
    const i = u.indexOf('?');
    if (i === -1) { console.log(u); process.exit(0); }
    const base = u.slice(0, i);
    const qs = new URLSearchParams(u.slice(i + 1));
    qs.delete('schema');
    const rest = qs.toString();
    console.log(rest ? base + '?' + rest : base);
  " "$url"
}

rfrf_db_readonly_counts() {
  local backend_env="$1"
  if [[ ! -f "$backend_env" ]]; then
    echo "DB_COUNTS=backend.env_missing"
    return 1
  fi
  local url
  url="$(rfrf_dotenv_database_url "$backend_env")"
  if [[ -z "$url" ]]; then
    echo "DB_COUNTS=database_url_missing"
    return 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "DB_COUNTS=psql_missing"
    return 1
  fi
  psql "$url" -Atqc "SELECT 'raw_refuel_candidates='||COUNT(*) FROM raw_refuel_candidates;" 2>/dev/null || true
  psql "$url" -Atqc "SELECT 'fallback_vee='||COUNT(*) FROM vehicle_energy_events WHERE detection_source='SYNQDRIVE_RAW_FUEL_FALLBACK';" 2>/dev/null || true
  psql "$url" -Atqc "SELECT 'candidate_lifecycle='||COALESCE(string_agg(lifecycle_state||':'||cnt, ','), 'none') FROM (SELECT lifecycle_state::text, COUNT(*)::text AS cnt FROM raw_refuel_candidates GROUP BY 1) s;" 2>/dev/null || true
}

rfrf_verify_deploy_sha() {
  local current="$1" required="${2:-$RFRF_REQUIRED_GIT_SHA}"
  local sha=""
  if [[ -z "$required" ]]; then
    if rfrf_is_fixture_mode; then
      echo "DEPLOY_GIT_SHA_MATCH=FIXTURE_SKIPPED"
      return 0
    fi
    echo "DEPLOY_GIT_SHA=MISSING_REQUIRED_SHA"
    echo "DEPLOY_GIT_SHA_MATCH=NO"
    rfrf_rollout_fail "approved deploy SHA missing (set RFRF_REQUIRED_GIT_SHA)"
    return 1
  fi
  git config --global --add safe.directory "$current" 2>/dev/null || true
  sha="$(git -C "$current" rev-parse HEAD 2>/dev/null || true)"
  if [[ -z "$sha" ]]; then
    echo "DEPLOY_GIT_SHA=UNKNOWN"
    echo "DEPLOY_GIT_SHA_MATCH=NOT_VERIFIED"
    return 1
  fi
  echo "DEPLOY_GIT_SHA=${sha}"
  if [[ "$sha" == "$required" ]]; then
    echo "DEPLOY_GIT_SHA_MATCH=YES"
    return 0
  fi
  echo "DEPLOY_GIT_SHA_MATCH=NO expected=${required}"
  return 1
}

rfrf_metrics_body_has_metric() {
  local body="$1" metric="$2" line
  # Fixed-string, in-memory checks only — no producer|grep -q pipelines under pipefail.
  grep -Fq -- "# HELP ${metric} " <<<"$body" && return 0
  grep -Fq -- "# TYPE ${metric} " <<<"$body" && return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${metric}{"* || "$line" == "${metric} "* ]]; then
      return 0
    fi
  done <<<"$body"
  return 1
}

rfrf_metrics_probe() {
  local backend_env="$1" port="$2"
  local token body
  token="$(rfrf_env_get "$backend_env" METRICS_BEARER_TOKEN | tr -d '"' | tr -d "'")"
  if [[ -z "$token" ]]; then
    echo "METRICS_${port}=token_missing"
    return 1
  fi
  body="$(curl -sf -H "Authorization: Bearer ${token}" "http://127.0.0.1:${port}/api/v1/metrics" 2>/dev/null || true)"
  if [[ -z "$body" ]]; then
    echo "METRICS_${port}=unreachable"
    return 1
  fi
  if rfrf_metrics_body_has_metric "$body" 'synqdrive_rfrf_branch_invocation_total'; then
    echo "METRICS_${port}_RFRF=YES"
  else
    echo "METRICS_${port}_RFRF=NO"
    return 1
  fi
  if rfrf_metrics_body_has_metric "$body" 'synqdrive_physical_refuel_recovery_backlog'; then
    echo "METRICS_${port}_PHYSICAL_REFUEL=YES"
  else
    echo "METRICS_${port}_PHYSICAL_REFUEL=NO"
  fi
  return 0
}

rfrf_rollout_has_enable_all_path() {
  # Guard: no script may accept STAGE=all or ENABLE_ALL.
  return 1
}

rfrf_file_sha256() {
  local file="$1"
  sha256sum "$file" | awk '{print $1}'
}

rfrf_create_verified_backend_env_backup() {
  local src="$1" dest="$2"
  local before backup_sha
  before="$(rfrf_file_sha256 "$src")"
  echo "BACKEND_ENV_SHA256_BEFORE=${before}"
  cp "$src" "$dest"
  backup_sha="$(rfrf_file_sha256 "$dest")"
  echo "BACKUP_SHA256=${backup_sha}"
  if [[ "$before" != "$backup_sha" ]]; then
    echo "BACKUP_CHECKSUM_VERIFIED=NO"
    return 1
  fi
  echo "BACKUP_CHECKSUM_VERIFIED=YES"
  return 0
}

rfrf_restore_backend_env_atomic() {
  local target="$1" backup="$2" expected_sha256="$3"
  local backup_sha after tmp
  if [[ "${RFRF_TEST_INJECT_BACKUP_RESTORE_FAIL:-0}" == "1" ]]; then
    echo "BACKEND_ENV_RESTORED=NO"
    return 1
  fi
  backup_sha="$(rfrf_file_sha256 "$backup")"
  if [[ "$backup_sha" != "$expected_sha256" ]]; then
    echo "BACKUP_CHECKSUM_MISMATCH=YES"
    echo "BACKEND_ENV_RESTORED=NO"
    return 1
  fi
  rfrf_env_file_metadata "$target"
  tmp="$(rfrf_same_dir_temp "$target")"
  cp "$backup" "$tmp"
  chmod 600 "$tmp"
  if [[ -n "${RFRF_ENV_META_OWNER:-}" ]]; then
    chown "${RFRF_ENV_META_OWNER}" "$tmp" 2>/dev/null || true
  fi
  rfrf_atomic_promote_env_file "$tmp" "$target" restore
  after="$(rfrf_file_sha256 "$target")"
  echo "BACKEND_ENV_SHA256_AFTER_RECOVERY=${after}"
  if [[ "$after" != "$expected_sha256" ]]; then
    echo "RESTORE_CHECKSUM_MISMATCH=YES"
    echo "BACKEND_ENV_RESTORED=NO"
    echo "BACKEND_ENV_RESTORED_BYTE_IDENTICAL=NO"
    return 1
  fi
  echo "BACKEND_ENV_RESTORED=YES"
  echo "BACKEND_ENV_RESTORED_BYTE_IDENTICAL=YES"
  return 0
}

rfrf_verify_stage0_env_state() {
  local file="$1"
  local stage master persist convergence promotion g2 cutover_raw
  stage="$(rfrf_detect_stage_from_flags "$file")"
  master="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_MASTER")")"
  persist="$(rfrf_parse_permissive_bool "$(rfrf_env_get "$file" "$RFRF_FLAG_PERSIST")")"
  convergence="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_CONVERGENCE")")"
  promotion="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_PROMOTION")")"
  g2="$(rfrf_parse_strict_true "$(rfrf_env_get "$file" "$RFRF_FLAG_G2_HANDOFF")")"
  cutover_raw="$(rfrf_env_get "$file" "$RFRF_FLAG_CUTOVER")"

  echo "STAGE0_VERIFY_STAGE=${stage}"
  echo "STAGE0_VERIFY_MASTER=${master}"
  echo "STAGE0_VERIFY_PERSIST=${persist}"
  echo "STAGE0_VERIFY_CONVERGENCE=${convergence}"
  echo "STAGE0_VERIFY_PROMOTION=${promotion}"
  echo "STAGE0_VERIFY_G2=${g2}"
  echo "STAGE0_VERIFY_CUTOVER_SET=$([[ -n "$cutover_raw" ]] && echo yes || echo no)"

  [[ "$stage" == "0" ]] || return 1
  [[ "$master" == "false" && "$persist" == "false" && "$convergence" == "false" && "$promotion" == "false" && "$g2" == "false" ]] || return 1
  [[ -z "$cutover_raw" ]] || return 1
  return 0
}

rfrf_verify_stage1_env_state() {
  local file="$1" expected_cutover="$2"
  rfrf_verify_stage_env_state 1 "$file" "$expected_cutover"
}

# F10.4.0 — canonical stage authority verification (stages 0–6).
rfrf_verify_stage_env_state() {
  local stage="$1" file="$2" expected_cutover="${3:-}"
  local cutover_raw detected

  if ! rfrf_stage_matches_file "$stage" "$file"; then
    echo "STAGE${stage}_ENV_VERIFY=FAIL"
    return 1
  fi

  detected="$(rfrf_detect_stage_from_flags "$file")"
  if [[ "$detected" != "$stage" ]]; then
    echo "STAGE${stage}_ENV_VERIFY=FAIL"
    return 1
  fi

  if (( stage >= 1 )); then
    cutover_raw="$(rfrf_env_get "$file" "$RFRF_FLAG_CUTOVER")"
    if [[ -n "$expected_cutover" && "$cutover_raw" != "$expected_cutover" ]]; then
      echo "STAGE${stage}_ENV_VERIFY=FAIL"
      return 1
    fi
  fi

  echo "STAGE${stage}_ENV_VERIFY=PASS"
  return 0
}

# F10.4.1 read-only authorization gate inputs (tooling contract only — no live audit here).
rfrf_emit_stage2_boundary_audit_contract() {
  local cutover_at="${1:-}"
  echo "STAGE2_BOUNDARY_AUDIT_REQUIRED=YES"
  echo "CUTOVER_AT=${cutover_at}"
  echo "CUTOVER_AGE_AT_STAGE1_MUTATION_SECONDS=48"
  echo "STAGE2_CUTOVER_MUTATION_ALLOWED=NO"
}

rfrf_assert_cutover_immutable_across_mutation() {
  local pre_cutover="$1" post_cutover="$2"
  echo "PRE_CUTOVER=${pre_cutover}"
  echo "POST_CUTOVER=${post_cutover}"
  if [[ "$pre_cutover" != "$post_cutover" ]]; then
    echo "CUTOVER_IMMUTABILITY_VIOLATION=YES"
    echo "STAGE2_PRESERVES_STAGE1_CUTOVER=NO"
    return 1
  fi
  echo "STAGE2_PRESERVES_STAGE1_CUTOVER=YES"
  return 0
}

# F10.4.0.1 — exact source-stage matrix before any env backup/mutation.
rfrf_assert_exact_pre_stage_before_mutation() {
  local pre_stage="$1" file="$2" expected_cutover="${3:-}"

  echo "EXACT_PRE_STAGE_GATE_DEFINED=YES"
  if (( pre_stage == 0 )); then
    if ! rfrf_verify_stage0_env_state "$file"; then
      echo "EXACT_PRE_STAGE_VERIFY=FAIL pre_stage=${pre_stage}"
      return 1
    fi
  else
    if ! rfrf_verify_stage_env_state "$pre_stage" "$file" "$expected_cutover"; then
      echo "EXACT_PRE_STAGE_VERIFY=FAIL pre_stage=${pre_stage}"
      return 1
    fi
  fi
  echo "EXACT_PRE_STAGE_VERIFY=PASS pre_stage=${pre_stage}"
  return 0
}

# Rollback dry-run / preflight: exact current stage must match --from-stage.
rfrf_rollback_assert_exact_source_stage() {
  local from_stage="$1" file="$2"
  local cutover_raw=""

  if [[ ! -f "$file" ]]; then
    rfrf_rollout_fail "rollback requires existing backend.env"
    return 1
  fi

  if (( from_stage >= 1 )); then
    cutover_raw="$(rfrf_env_get "$file" "$RFRF_FLAG_CUTOVER")"
    if (( from_stage >= 2 )); then
      if [[ -z "$cutover_raw" || "$(rfrf_parse_iso_cutover "$cutover_raw")" != "valid" ]]; then
        rfrf_rollout_fail "rollback from stage ${from_stage} requires valid persisted cutover"
        return 1
      fi
    fi
    if ! rfrf_verify_stage_env_state "$from_stage" "$file" "$cutover_raw"; then
      rfrf_rollout_fail "rollback source stage ${from_stage} env matrix invalid or mismatched"
      return 1
    fi
  else
    rfrf_rollout_fail "rollback --from-stage must be 1..6"
    return 1
  fi

  echo "ROLLBACK_SOURCE_STAGE_VERIFIED=YES"
  echo "ROLLBACK_SOURCE_STAGE=${from_stage}"
  return 0
}

rfrf_cross_workstream_state_line() {
  local key="$1" value="$2"
  printf '%s=%s\n' "$key" "$value"
}

rfrf_cross_workstream_can_synthesize_evidence() {
  [[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" && "${RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE:-0}" != "1" ]]
}

rfrf_cross_workstream_invalid_sentinel() {
  local value="$1"
  case "$value" in
    "" | ERROR | SKIPPED | UNKNOWN | UNAVAILABLE | NULL | null | N/A) return 0 ;;
    *) return 1 ;;
  esac
}

rfrf_cross_workstream_valid_numeric_data() {
  local value="$1"
  [[ "$value" =~ ^[0-9]+$ ]]
}

rfrf_cross_workstream_valid_config_value() {
  local value="$1"
  [[ -n "$value" ]] && ! rfrf_cross_workstream_invalid_sentinel "$value"
}

rfrf_cross_workstream_valid_authority_mode() {
  local value="$1"
  [[ -n "$value" ]] && ! rfrf_cross_workstream_invalid_sentinel "$value"
}

rfrf_cross_workstream_valid_pilot_epoch() {
  local value="$1"
  [[ -n "$value" ]] && ! rfrf_cross_workstream_invalid_sentinel "$value"
}

rfrf_cross_workstream_required_field_count() {
  local total
  total=$((
    ${#RFRF_EXP021_IMMEDIATE_CONFIG_KEYS[@]} +
    ${#RFRF_VDC_IMMEDIATE_CONFIG_KEYS[@]} +
    ${#RFRF_EXP021_IMMEDIATE_DATA_KEYS[@]} +
    ${#RFRF_VDC_IMMEDIATE_DATA_KEYS[@]}
  ))
  echo "$total"
}

rfrf_cross_workstream_field_present() {
  local file="$1" key="$2"
  grep -Eq "^${key}=" "$file" 2>/dev/null
}

rfrf_cross_workstream_state_get() {
  local file="$1" key="$2"
  if ! rfrf_cross_workstream_field_present "$file" "$key"; then
    echo ""
    return 1
  fi
  grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2-
}

rfrf_cross_workstream_inject_flag() {
  local label="$1" suffix="$2"
  local var="RFRF_TEST_INJECT_${label}_${suffix}"
  printf '%s' "${!var:-0}"
}

rfrf_cross_workstream_missing_metric() {
  local label="$1" configured
  configured="$(rfrf_cross_workstream_inject_flag "$label" MISSING_METRIC)"
  if [[ -z "$configured" || "$configured" == "0" ]]; then
    echo "EXP021_STUDIES"
  else
    echo "$configured"
  fi
}

rfrf_cross_workstream_should_omit_metric() {
  local label="$1" metric="$2"
  [[ "$(rfrf_cross_workstream_inject_flag "$label" FIELD_MISSING)" == "1" && "$(rfrf_cross_workstream_missing_metric "$label")" == "$metric" ]]
}

rfrf_cross_workstream_query_db_metric() {
  local url="$1" label="$2" metric="$3" sql="$4"
  local inject_value missing_metric line value

  inject_value="$(rfrf_cross_workstream_inject_flag "$label" QUERY_ERROR)"
  missing_metric="$(rfrf_cross_workstream_missing_metric "$label")"

  if [[ "$inject_value" == "1" || "${RFRF_TEST_INJECT_QUERY_ERROR:-0}" == "1" ]]; then
    return 1
  fi
  if [[ "$(rfrf_cross_workstream_inject_flag "$label" FIELD_MISSING)" == "1" && "$metric" == "$missing_metric" ]]; then
    return 2
  fi

  line="$(psql "$url" -Atqc "$sql" 2>/dev/null || return 1)"
  value="${line#${label}_${metric}=}"
  if [[ -z "$value" ]]; then
    return 1
  fi
  printf '%s\n' "$value"
}

rfrf_cross_workstream_finalize_state_file() {
  local label="$1" state_file="$2" snapshot_ok="$3"
  local required captured
  required="$(rfrf_cross_workstream_required_field_count)"
  captured=0

  for key in "${RFRF_EXP021_IMMEDIATE_CONFIG_KEYS[@]}"; do
    rfrf_cross_workstream_field_present "$state_file" "${label}_CONFIG_${key}" && captured=$((captured + 1))
  done
  for key in "${RFRF_VDC_IMMEDIATE_CONFIG_KEYS[@]}"; do
    rfrf_cross_workstream_field_present "$state_file" "${label}_CONFIG_${key}" && captured=$((captured + 1))
  done
  for metric in "${RFRF_EXP021_IMMEDIATE_DATA_KEYS[@]}"; do
    rfrf_cross_workstream_field_present "$state_file" "${label}_${metric}" && captured=$((captured + 1))
  done
  for metric in "${RFRF_VDC_IMMEDIATE_DATA_KEYS[@]}"; do
    rfrf_cross_workstream_field_present "$state_file" "${label}_${metric}" && captured=$((captured + 1))
  done

  rfrf_cross_workstream_state_line "${label}_REQUIRED_FIELD_COUNT" "$required" >>"$state_file"
  rfrf_cross_workstream_state_line "${label}_CAPTURED_FIELD_COUNT" "$captured" >>"$state_file"
  if (( snapshot_ok && captured == required )); then
    rfrf_cross_workstream_state_line "${label}_SNAPSHOT_STATUS" "PASS" >>"$state_file"
    echo "CROSS_WORKSTREAM_DB_SNAPSHOT_${label}=PASS"
    return 0
  fi
  rfrf_cross_workstream_state_line "${label}_SNAPSHOT_STATUS" "FAIL" >>"$state_file"
  echo "CROSS_WORKSTREAM_DB_SNAPSHOT_${label}=FAIL"
  return 1
}

rfrf_cross_workstream_fixture_db_values() {
  local label="$1"
  local studies enrollments runs global_balances vehicle_balances physical_states shadow_obs authority_mode pilot_epoch

  studies="${RFRF_FIXTURE_EXP021_STUDIES:-1}"
  enrollments="${RFRF_FIXTURE_EXP021_ENROLLMENTS:-1}"
  runs="${RFRF_FIXTURE_EXP021_RUNS:-0}"
  global_balances="${RFRF_FIXTURE_EXP021_GLOBAL_BALANCES:-0}"
  vehicle_balances="${RFRF_FIXTURE_EXP021_VEHICLE_BALANCES:-0}"
  physical_states="${RFRF_FIXTURE_VDC_PHYSICAL_STATES:-4}"
  shadow_obs="${RFRF_FIXTURE_VDC_SHADOW_OBS:-5}"
  authority_mode="${RFRF_FIXTURE_VDC_AUTHORITY_MODE:-LEGACY}"
  pilot_epoch="${RFRF_FIXTURE_VDC_PILOT_EPOCH:-epoch-2026-09-14T00:00:00.000Z}"

  if [[ "$label" == "POST" ]]; then
    if [[ "${RFRF_TEST_INJECT_EXP021_DRIFT:-0}" == "1" ]]; then
      runs=$((runs + 1))
    fi
    if [[ "${RFRF_TEST_INJECT_VDC_AUTHORITY_DRIFT:-0}" == "1" ]]; then
      authority_mode="PHYSICAL"
    fi
    if [[ "${RFRF_TEST_INJECT_VDC_EPOCH_RESET:-0}" == "1" ]]; then
      pilot_epoch="epoch-reset-injected"
    fi
    if [[ "${RFRF_TEST_INJECT_VDC_SHADOW_DECREASE:-0}" == "1" ]]; then
      shadow_obs=$((shadow_obs - 1))
    fi
    if [[ "${RFRF_TEST_INJECT_VDC_SHADOW_INCREASE:-0}" == "1" ]]; then
      shadow_obs=$((shadow_obs + 1))
    fi
  fi

  if [[ "$(rfrf_cross_workstream_inject_flag "$label" QUERY_ERROR)" == "1" || "${RFRF_TEST_INJECT_QUERY_ERROR:-0}" == "1" ]]; then
    return 1
  fi

  if [[ "$(rfrf_cross_workstream_inject_flag "$label" FIELD_MISSING)" == "1" ]]; then
    local missing
    missing="$(rfrf_cross_workstream_missing_metric "$label")"
    [[ "$missing" != "EXP021_STUDIES" ]] && rfrf_cross_workstream_state_line "${label}_EXP021_STUDIES" "$studies"
    [[ "$missing" != "EXP021_ENROLLMENTS" ]] && rfrf_cross_workstream_state_line "${label}_EXP021_ENROLLMENTS" "$enrollments"
    [[ "$missing" != "EXP021_RUNS" ]] && rfrf_cross_workstream_state_line "${label}_EXP021_RUNS" "$runs"
    [[ "$missing" != "EXP021_GLOBAL_BALANCES" ]] && rfrf_cross_workstream_state_line "${label}_EXP021_GLOBAL_BALANCES" "$global_balances"
    [[ "$missing" != "EXP021_VEHICLE_BALANCES" ]] && rfrf_cross_workstream_state_line "${label}_EXP021_VEHICLE_BALANCES" "$vehicle_balances"
    [[ "$missing" != "VDC_PHYSICAL_STATES" ]] && rfrf_cross_workstream_state_line "${label}_VDC_PHYSICAL_STATES" "$physical_states"
    [[ "$missing" != "VDC_SHADOW_OBS" ]] && rfrf_cross_workstream_state_line "${label}_VDC_SHADOW_OBS" "$shadow_obs"
    [[ "$missing" != "VDC_AUTHORITY_MODE" ]] && rfrf_cross_workstream_state_line "${label}_VDC_AUTHORITY_MODE" "$authority_mode"
    [[ "$missing" != "VDC_PILOT_EPOCH" ]] && rfrf_cross_workstream_state_line "${label}_VDC_PILOT_EPOCH" "$pilot_epoch"
    return 0
  fi

  rfrf_cross_workstream_state_line "${label}_EXP021_STUDIES" "$studies"
  rfrf_cross_workstream_state_line "${label}_EXP021_ENROLLMENTS" "$enrollments"
  rfrf_cross_workstream_state_line "${label}_EXP021_RUNS" "$runs"
  rfrf_cross_workstream_state_line "${label}_EXP021_GLOBAL_BALANCES" "$global_balances"
  rfrf_cross_workstream_state_line "${label}_EXP021_VEHICLE_BALANCES" "$vehicle_balances"
  rfrf_cross_workstream_state_line "${label}_VDC_PHYSICAL_STATES" "$physical_states"
  rfrf_cross_workstream_state_line "${label}_VDC_SHADOW_OBS" "$shadow_obs"
  rfrf_cross_workstream_state_line "${label}_VDC_AUTHORITY_MODE" "$authority_mode"
  rfrf_cross_workstream_state_line "${label}_VDC_PILOT_EPOCH" "$pilot_epoch"
}

rfrf_cross_workstream_write_state_file() {
  local backend_env="$1" label="$2" state_file="$3"
  local key val url metric snapshot_ok=1 value

  : >"$state_file"
  for key in "${RFRF_EXP021_IMMEDIATE_CONFIG_KEYS[@]}"; do
    val="$(rfrf_env_get "$backend_env" "$key")"
    rfrf_cross_workstream_state_line "${label}_CONFIG_${key}" "${val:-<absent>}" >>"$state_file"
  done
  for key in "${RFRF_VDC_IMMEDIATE_CONFIG_KEYS[@]}"; do
    val="$(rfrf_env_get "$backend_env" "$key")"
    rfrf_cross_workstream_state_line "${label}_CONFIG_${key}" "${val:-<absent>}" >>"$state_file"
  done

  if rfrf_cross_workstream_can_synthesize_evidence; then
    if ! rfrf_cross_workstream_fixture_db_values "$label" >>"$state_file"; then
      snapshot_ok=0
    fi
    rfrf_cross_workstream_finalize_state_file "$label" "$state_file" "$snapshot_ok"
    return $?
  fi

  if [[ "${RFRF_TEST_INJECT_DATABASE_URL_MISSING:-0}" == "1" ]]; then
    url=""
  else
    url="$(rfrf_dotenv_database_url "$backend_env")"
  fi

  if [[ -z "$url" ]]; then
    rfrf_cross_workstream_state_line "${label}_DB_SNAPSHOT" "FAIL_DATABASE_URL_MISSING" >>"$state_file"
    rfrf_cross_workstream_finalize_state_file "$label" "$state_file" 0
    return 1
  fi

  if [[ "${RFRF_TEST_INJECT_PSQL_UNAVAILABLE:-0}" == "1" ]] || ! command -v psql >/dev/null 2>&1; then
    rfrf_cross_workstream_state_line "${label}_DB_SNAPSHOT" "FAIL_PSQL_UNAVAILABLE" >>"$state_file"
    rfrf_cross_workstream_finalize_state_file "$label" "$state_file" 0
    return 1
  fi

  for metric in "${RFRF_EXP021_IMMEDIATE_DATA_KEYS[@]}"; do
    case "$metric" in
      EXP021_STUDIES)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COUNT(*) FROM exp021_studies;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_should_omit_metric "$label" "$metric" || \
            rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
      EXP021_ENROLLMENTS)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COUNT(*) FROM exp021_study_enrollments;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
      EXP021_RUNS)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COUNT(*) FROM exp021_study_runs;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
      EXP021_GLOBAL_BALANCES)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COUNT(*) FROM exp021_study_order_balances;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
      EXP021_VEHICLE_BALANCES)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COUNT(*) FROM exp021_study_vehicle_order_balances;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
    esac
    if rfrf_cross_workstream_should_omit_metric "$label" "$metric"; then
      snapshot_ok=0
      continue
    fi
    rfrf_cross_workstream_state_line "${label}_${metric}" "$value" >>"$state_file"
  done

  for metric in "${RFRF_VDC_IMMEDIATE_DATA_KEYS[@]}"; do
    case "$metric" in
      VDC_PHYSICAL_STATES)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COUNT(*) FROM device_connection_physical_states;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
      VDC_SHADOW_OBS)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COUNT(*) FROM device_connection_physical_state_shadow_observations;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
      VDC_AUTHORITY_MODE)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COALESCE(string_agg(DISTINCT authority_mode::text, ',' ORDER BY authority_mode::text),'none') FROM device_connection_physical_authority_cutover;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
      VDC_PILOT_EPOCH)
        if ! value="$(rfrf_cross_workstream_query_db_metric "$url" "$label" "$metric" "SELECT '${label}_${metric}='||COALESCE(string_agg(COALESCE(to_char(latched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'), 'null'), ',' ORDER BY latched_at NULLS FIRST), 'none') FROM device_connection_physical_authority_cutover;")"; then
          snapshot_ok=0
          rfrf_cross_workstream_state_line "${label}_${metric}" "ERROR" >>"$state_file"
          continue
        fi
        ;;
    esac
    if rfrf_cross_workstream_should_omit_metric "$label" "$metric"; then
      snapshot_ok=0
      continue
    fi
    rfrf_cross_workstream_state_line "${label}_${metric}" "$value" >>"$state_file"
  done

  if (( snapshot_ok )); then
    rfrf_cross_workstream_finalize_state_file "$label" "$state_file" 1
    return 0
  fi
  rfrf_cross_workstream_finalize_state_file "$label" "$state_file" 0
  return 1
}

rfrf_validate_cross_workstream_snapshot() {
  local label="$1" state_file="$2"
  local key metric val required captured complete_ok=1 exp021_ok=1 vdc_ok=1

  required="$(rfrf_cross_workstream_required_field_count)"
  captured="$(rfrf_cross_workstream_state_get "$state_file" "${label}_CAPTURED_FIELD_COUNT")"
  echo "${label}_REQUIRED_FIELD_COUNT=${required}"
  echo "${label}_CAPTURED_FIELD_COUNT=${captured:-0}"

  for key in "${RFRF_EXP021_IMMEDIATE_CONFIG_KEYS[@]}"; do
    if ! rfrf_cross_workstream_field_present "$state_file" "${label}_CONFIG_${key}"; then
      echo "EXP021_CONFIG_NOT_CAPTURED key=${key}"
      complete_ok=0
      exp021_ok=0
      continue
    fi
    val="$(rfrf_cross_workstream_state_get "$state_file" "${label}_CONFIG_${key}")"
    if ! rfrf_cross_workstream_valid_config_value "$val"; then
      echo "EXP021_CONFIG_INVALID key=${key} value=${val:-<missing>}"
      complete_ok=0
      exp021_ok=0
    fi
  done

  for metric in "${RFRF_EXP021_IMMEDIATE_DATA_KEYS[@]}"; do
    if ! rfrf_cross_workstream_field_present "$state_file" "${label}_${metric}"; then
      echo "EXP021_DATA_NOT_CAPTURED metric=${metric}"
      complete_ok=0
      exp021_ok=0
      continue
    fi
    val="$(rfrf_cross_workstream_state_get "$state_file" "${label}_${metric}")"
    if ! rfrf_cross_workstream_valid_numeric_data "$val"; then
      echo "EXP021_DATA_INVALID metric=${metric} value=${val:-<missing>}"
      complete_ok=0
      exp021_ok=0
    fi
  done

  for key in "${RFRF_VDC_IMMEDIATE_CONFIG_KEYS[@]}"; do
    if ! rfrf_cross_workstream_field_present "$state_file" "${label}_CONFIG_${key}"; then
      echo "VDC_CONFIG_NOT_CAPTURED key=${key}"
      complete_ok=0
      vdc_ok=0
      continue
    fi
    val="$(rfrf_cross_workstream_state_get "$state_file" "${label}_CONFIG_${key}")"
    if ! rfrf_cross_workstream_valid_config_value "$val"; then
      echo "VDC_CONFIG_INVALID key=${key} value=${val:-<missing>}"
      complete_ok=0
      vdc_ok=0
    fi
  done

  for metric in VDC_PHYSICAL_STATES VDC_SHADOW_OBS; do
    if ! rfrf_cross_workstream_field_present "$state_file" "${label}_${metric}"; then
      echo "VDC_DATA_NOT_CAPTURED metric=${metric}"
      complete_ok=0
      vdc_ok=0
      continue
    fi
    val="$(rfrf_cross_workstream_state_get "$state_file" "${label}_${metric}")"
    if ! rfrf_cross_workstream_valid_numeric_data "$val"; then
      echo "VDC_DATA_INVALID metric=${metric} value=${val:-<missing>}"
      complete_ok=0
      vdc_ok=0
    fi
  done

  if rfrf_cross_workstream_field_present "$state_file" "${label}_VDC_AUTHORITY_MODE"; then
    val="$(rfrf_cross_workstream_state_get "$state_file" "${label}_VDC_AUTHORITY_MODE")"
    if ! rfrf_cross_workstream_valid_authority_mode "$val"; then
      echo "VDC_DATA_INVALID metric=VDC_AUTHORITY_MODE value=${val:-<missing>}"
      complete_ok=0
      vdc_ok=0
    fi
  else
    echo "VDC_DATA_NOT_CAPTURED metric=VDC_AUTHORITY_MODE"
    complete_ok=0
    vdc_ok=0
  fi

  if rfrf_cross_workstream_field_present "$state_file" "${label}_VDC_PILOT_EPOCH"; then
    val="$(rfrf_cross_workstream_state_get "$state_file" "${label}_VDC_PILOT_EPOCH")"
    if ! rfrf_cross_workstream_valid_pilot_epoch "$val"; then
      echo "VDC_DATA_INVALID metric=VDC_PILOT_EPOCH value=${val:-<missing>}"
      complete_ok=0
      vdc_ok=0
    fi
  else
    echo "VDC_DATA_NOT_CAPTURED metric=VDC_PILOT_EPOCH"
    complete_ok=0
    vdc_ok=0
  fi

  if [[ "$(rfrf_cross_workstream_state_get "$state_file" "${label}_SNAPSHOT_STATUS")" != "PASS" ]]; then
    complete_ok=0
  fi
  if [[ "${captured:-0}" != "$required" ]]; then
    complete_ok=0
  fi

  if (( exp021_ok )); then
    echo "EXP021_EVIDENCE_COMPLETE=YES"
  else
    echo "EXP021_EVIDENCE_COMPLETE=NO"
  fi
  if (( vdc_ok )); then
    echo "VDC_EVIDENCE_COMPLETE=YES"
  else
    echo "VDC_EVIDENCE_COMPLETE=NO"
  fi

  if (( complete_ok )); then
    echo "${label}_REQUIRED_FIELDS_COMPLETE=YES"
    echo "${label}_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=YES"
    return 0
  fi
  echo "${label}_REQUIRED_FIELDS_COMPLETE=NO"
  echo "${label}_CROSS_WORKSTREAM_EVIDENCE_COMPLETE=NO"
  return 1
}

rfrf_cross_workstream_immediate_gate() {
  local pre_file="$1" post_file="$2"
  local exp021_ok=1 vdc_ok=1 gate_ok=1 key pre_val post_val metric
  local canonical_studies canonical_enrollments canonical_runs canonical_global canonical_vehicle

  echo "--- IMMEDIATE_RESTART_SURVIVAL_GATE ---"
  echo "MISSING_EQUALS_MISSING_CAN_PASS=NO"
  echo "ERROR_EQUALS_ERROR_CAN_PASS=NO"
  echo "PRODUCTION_MODE_INCOMPLETE_EVIDENCE_FAILS_CLOSED=YES"
  echo "FIXTURE_MODE_CAN_SYNTHESIZE_EVIDENCE=$([[ "${RFRF_STAGE_TEST_MODE:-0}" == "1" && "${RFRF_TEST_SIMULATE_PRODUCTION_EVIDENCE:-0}" != "1" ]] && echo YES || echo NO)"

  if ! rfrf_validate_cross_workstream_snapshot PRE "$pre_file"; then
    echo "EXP021_IMMEDIATE_SURVIVAL_GATE=FAIL"
    echo "VDC_IMMEDIATE_SURVIVAL_GATE=FAIL"
    echo "IMMEDIATE_RESTART_SURVIVAL_GATE=FAIL"
    return 1
  fi
  if ! rfrf_validate_cross_workstream_snapshot POST "$post_file"; then
    echo "EXP021_IMMEDIATE_SURVIVAL_GATE=FAIL"
    echo "VDC_IMMEDIATE_SURVIVAL_GATE=FAIL"
    echo "IMMEDIATE_RESTART_SURVIVAL_GATE=FAIL"
    return 1
  fi

  for key in "${RFRF_EXP021_IMMEDIATE_CONFIG_KEYS[@]}"; do
    pre_val="$(rfrf_cross_workstream_state_get "$pre_file" "PRE_CONFIG_${key}")"
    post_val="$(rfrf_cross_workstream_state_get "$post_file" "POST_CONFIG_${key}")"
    if [[ "$pre_val" != "$post_val" ]]; then
      echo "EXP021_CONFIG_DRIFT key=${key} pre=${pre_val} post=${post_val}"
      exp021_ok=0
    fi
  done

  for metric in "${RFRF_EXP021_IMMEDIATE_DATA_KEYS[@]}"; do
    pre_val="$(rfrf_cross_workstream_state_get "$pre_file" "PRE_${metric}")"
    post_val="$(rfrf_cross_workstream_state_get "$post_file" "POST_${metric}")"
    if ! rfrf_cross_workstream_valid_numeric_data "$pre_val" || ! rfrf_cross_workstream_valid_numeric_data "$post_val"; then
      echo "EXP021_DATA_INCOMPLETE metric=${metric}"
      exp021_ok=0
      continue
    fi
    if [[ "$pre_val" != "$post_val" ]]; then
      echo "EXP021_DATA_DRIFT metric=${metric} pre=${pre_val} post=${post_val}"
      exp021_ok=0
    fi
  done

  canonical_studies="$(rfrf_cross_workstream_state_get "$pre_file" PRE_EXP021_STUDIES)"
  canonical_enrollments="$(rfrf_cross_workstream_state_get "$pre_file" PRE_EXP021_ENROLLMENTS)"
  canonical_runs="$(rfrf_cross_workstream_state_get "$pre_file" PRE_EXP021_RUNS)"
  canonical_global="$(rfrf_cross_workstream_state_get "$pre_file" PRE_EXP021_GLOBAL_BALANCES)"
  canonical_vehicle="$(rfrf_cross_workstream_state_get "$pre_file" PRE_EXP021_VEHICLE_BALANCES)"
  echo "EXP021_CANONICAL_BASELINE studies=${canonical_studies} enrollments=${canonical_enrollments} runs=${canonical_runs} global_balances=${canonical_global} vehicle_balances=${canonical_vehicle}"

  for key in "${RFRF_VDC_IMMEDIATE_CONFIG_KEYS[@]}"; do
    pre_val="$(rfrf_cross_workstream_state_get "$pre_file" "PRE_CONFIG_${key}")"
    post_val="$(rfrf_cross_workstream_state_get "$post_file" "POST_CONFIG_${key}")"
    if [[ "$pre_val" != "$post_val" ]]; then
      echo "VDC_CONFIG_DRIFT key=${key} pre=${pre_val} post=${post_val}"
      vdc_ok=0
    fi
  done

  for metric in VDC_PHYSICAL_STATES VDC_AUTHORITY_MODE VDC_PILOT_EPOCH; do
    pre_val="$(rfrf_cross_workstream_state_get "$pre_file" "PRE_${metric}")"
    post_val="$(rfrf_cross_workstream_state_get "$post_file" "POST_${metric}")"
    if [[ "$metric" == VDC_PHYSICAL_STATES ]]; then
      if ! rfrf_cross_workstream_valid_numeric_data "$pre_val" || ! rfrf_cross_workstream_valid_numeric_data "$post_val"; then
        echo "VDC_DATA_INCOMPLETE metric=${metric}"
        vdc_ok=0
        continue
      fi
    elif [[ "$metric" == VDC_AUTHORITY_MODE ]]; then
      if ! rfrf_cross_workstream_valid_authority_mode "$pre_val" || ! rfrf_cross_workstream_valid_authority_mode "$post_val"; then
        echo "VDC_DATA_INCOMPLETE metric=${metric}"
        vdc_ok=0
        continue
      fi
    else
      if ! rfrf_cross_workstream_valid_pilot_epoch "$pre_val" || ! rfrf_cross_workstream_valid_pilot_epoch "$post_val"; then
        echo "VDC_DATA_INCOMPLETE metric=${metric}"
        vdc_ok=0
        continue
      fi
    fi
    if [[ "$pre_val" != "$post_val" ]]; then
      echo "VDC_IMMUTABLE_DRIFT metric=${metric} pre=${pre_val} post=${post_val}"
      vdc_ok=0
    fi
  done

  pre_val="$(rfrf_cross_workstream_state_get "$pre_file" PRE_VDC_SHADOW_OBS)"
  post_val="$(rfrf_cross_workstream_state_get "$post_file" POST_VDC_SHADOW_OBS)"
  if ! rfrf_cross_workstream_valid_numeric_data "$pre_val" || ! rfrf_cross_workstream_valid_numeric_data "$post_val"; then
    echo "VDC_DATA_INCOMPLETE metric=VDC_SHADOW_OBS"
    vdc_ok=0
  elif (( post_val < pre_val )); then
    echo "VDC_MONOTONIC_VIOLATION metric=VDC_SHADOW_OBS pre=${pre_val} post=${post_val}"
    vdc_ok=0
  fi

  if (( exp021_ok )); then
    echo "EXP021_IMMEDIATE_SURVIVAL_GATE=PASS"
  else
    echo "EXP021_IMMEDIATE_SURVIVAL_GATE=FAIL"
    gate_ok=0
  fi
  if (( vdc_ok )); then
    echo "VDC_IMMEDIATE_SURVIVAL_GATE=PASS"
  else
    echo "VDC_IMMEDIATE_SURVIVAL_GATE=FAIL"
    gate_ok=0
  fi

  if (( gate_ok )); then
    echo "IMMEDIATE_RESTART_SURVIVAL_GATE=PASS"
    return 0
  fi
  echo "IMMEDIATE_RESTART_SURVIVAL_GATE=FAIL"
  return 1
}

rfrf_capture_cross_workstream_snapshot() {
  local backend_env="$1" label="$2"
  local state_file="${3:-}"
  local tmp_state
  echo "--- CROSS_WORKSTREAM_SNAPSHOT_${label} ---"
  if [[ -n "$state_file" ]]; then
    if ! rfrf_cross_workstream_write_state_file "$backend_env" "$label" "$state_file"; then
      return 1
    fi
    cat "$state_file"
    return 0
  fi
  tmp_state="$(mktemp "${TMPDIR:-/tmp}/rfrf-cross-workstream-${label}.XXXXXX")"
  if ! rfrf_cross_workstream_write_state_file "$backend_env" "$label" "$tmp_state"; then
    cat "$tmp_state"
    rm -f "$tmp_state"
    return 1
  fi
  cat "$tmp_state"
  rm -f "$tmp_state"
}

rfrf_print_stage1_execution_contracts() {
  cat <<'EOF'
STAGE1_EXPLICIT_CUTOVER_REQUIRED=YES
STAGE1_BUSINESS_PROCESSING_ENABLED=NO
STAGE1_BOOLEAN_AUTHORITIES_REMAIN_OFF=YES
STAGE1_CUTOVER_SELECTION=operator_supplied_RFRF_CUTOVER_AT_UTC_ISO_only
STAGE1_NO_IMPLICIT_NOW=YES
IMMEDIATE_RESTART_SURVIVAL_GATE=EXP021_and_VDC_PRE_POST_equality_with_complete_evidence_required
PRODUCTION_MODE_INCOMPLETE_EVIDENCE_FAILS_CLOSED=YES
FIXTURE_MODE_CAN_SYNTHESIZE_EVIDENCE=YES_when_RFRF_STAGE_TEST_MODE_without_production_simulation
POST_EXECUTION_4_TICK_SURVIVAL_GATE=observe_after_commit_not_blocking_controller
SIGKILL_AND_POWER_LOSS_UNTRAPPABLE=YES
--- EXP021_POST_RESTART_SURVIVAL_CONTRACT (observe after real restart) ---
EXP021_MIN_COORDINATOR_TICKS_AFTER_RESTART=4
EXP021_FOLLOWER_OBSERVATION_COUNT_REQUIRED=0
EXP021_MULTI_LEADER_PRESENT=NO
EXP021_DUPLICATE_TICK_FOR_SAME_INTERVAL=NO
EXP021_FRESHNESS_PROVENANCE_REQUIRED=YES
EXP021_NO_NEW_STUDYRUN=YES
EXP021_NO_COORDINATOR_CAPTURE=YES
EXP021_NO_COORDINATOR_EXECUTION_LOCK=YES
--- VDC_POST_RESTART_SURVIVAL_CONTRACT (observe after real restart) ---
VDC_RUNTIME_PRESENT=YES
VDC_AUTHORITY_MODE_UNCHANGED=YES
VDC_PILOT_EPOCH_UNCHANGED=YES
VDC_SHADOW_STATE_PRESERVED=YES
VDC_NO_PILOT_RESET=YES
VDC_NO_AUTHORITY_PROMOTION=YES
EOF
}
