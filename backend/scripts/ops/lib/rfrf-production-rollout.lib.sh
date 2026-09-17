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

rfrf_upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" >"$tmp" || true
  echo "${key}=${value}" >>"$tmp"
  mv "$tmp" "$file"
}

rfrf_remove_env_key() {
  local file="$1" key="$2"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" >"$tmp" || true
  mv "$tmp" "$file"
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
