#!/usr/bin/env bash
# Read-only RFRF production rollout preflight (F10.1).
#
# Default: non-mutating check mode.
# Usage:
#   sudo bash rfrf-production-preflight.sh
#   sudo RFRF_REQUIRED_GIT_SHA=<sha> bash rfrf-production-preflight.sh --check
#   DRY_RUN=1 bash rfrf-production-preflight.sh --check   # local fixture testing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
HEALTH_URL="${SYNQDRIVE_EXTERNAL_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
MODE="${1:---check}"
BLOCKED=0

if [[ "$MODE" != "--check" && "$MODE" != "--dry-run" ]]; then
  echo "Usage: $0 [--check|--dry-run]" >&2
  exit 2
fi

echo "=== RFRF PRODUCTION PREFLIGHT mode=${MODE} ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "RFRF_REQUIRED_GIT_SHA=${RFRF_REQUIRED_GIT_SHA}"

mark_blocked() { BLOCKED=1; echo "$1=BLOCKED"; }

echo "--- DEPLOY PROVENANCE ---"
if ! rfrf_require_approved_deploy_sha; then
  mark_blocked "DEPLOY_SHA_REQUIRED"
elif ! rfrf_verify_deploy_sha "$CURRENT" "$RFRF_REQUIRED_GIT_SHA"; then
  mark_blocked "DEPLOY_SHA"
fi
echo "CURRENT_RELEASE=$(readlink -f "$CURRENT" 2>/dev/null || echo UNKNOWN)"

echo "--- REPLICA / PM2 ---"
if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist 2>/dev/null | node -e '
    let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
      try{
        const want=new Set(["synqdrive","synqdrive-b"]);
        const apps=JSON.parse(d).filter(a=>want.has(a.name));
        for(const a of apps){
          console.log(`PM2_${a.name}_status=${a.pm2_env?.status||"unknown"}`);
          if((a.pm2_env?.status||"")!=="online") process.exitCode=2;
        }
        if(apps.length<2) process.exitCode=2;
      }catch{process.exitCode=2}
    })' || mark_blocked "PM2_REPLICAS"
else
  mark_blocked "PM2"
fi

echo "--- HEALTH ---"
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "EXTERNAL_HEALTH=PASS"
else
  mark_blocked "EXTERNAL_HEALTH"
fi

for port in "$SYNQDRIVE_REPLICA_A_PORT" "$SYNQDRIVE_REPLICA_B_PORT"; do
  body="$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || true)"
  if [[ -n "$body" ]] && echo "$body" | grep -q '"status":"ok"'; then
    echo "READINESS_${port}=PASS"
    PORT="$port" printf '%s' "$body" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const p=process.env.PORT;console.log(`REDIS_${p}=${j.checks?.redis?.status||"unknown"}`);console.log(`WORKERS_${p}=${j.checks?.workers?.status||"unknown"}`);console.log(`WORKERS_ENABLED_${p}=${j.checks?.workers?.details?.workersEnabled===true?"yes":"no"}`)}catch{}})'
  else
    mark_blocked "READINESS_${port}"
  fi
done

echo "--- RFRF FLAG SNAPSHOT ---"
if [[ ! -f "$BACKEND_ENV" ]]; then
  mark_blocked "BACKEND_ENV"
else
  rfrf_read_flag_snapshot "$BACKEND_ENV"
fi

echo "--- FORBIDDEN TEST ENV ---"
if forbidden="$(rfrf_forbidden_test_env_present "$BACKEND_ENV")"; then
  echo "FORBIDDEN_TEST_ENV=${forbidden}"
  mark_blocked "FORBIDDEN_TEST_ENV"
else
  echo "FORBIDDEN_TEST_ENV=NONE"
fi

echo "--- SCHEMA / DB READONLY ---"
if [[ -f "$BACKEND_ENV" ]]; then
  rfrf_db_readonly_counts "$BACKEND_ENV" || mark_blocked "DB_READONLY"
  set +u
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_ENV"
  set +a
  url="$(rfrf_psql_url_strip_schema "${DATABASE_URL:-}")"
  if [[ -n "$url" ]] && command -v psql >/dev/null 2>&1; then
    table="$(psql "$url" -Atqc "SELECT to_regclass('public.raw_refuel_candidates');" 2>/dev/null || true)"
    echo "RAW_REFUEL_CANDIDATES_TABLE=${table:-missing}"
    [[ "$table" == "raw_refuel_candidates" ]] || mark_blocked "RAW_REFUEL_CANDIDATES_TABLE"
    ds="$(psql "$url" -Atqc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='vehicle_energy_events' AND column_name='detection_source';" 2>/dev/null || echo 0)"
    sk="$(psql "$url" -Atqc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='vehicle_energy_events' AND column_name='source_event_key';" 2>/dev/null || echo 0)"
    echo "VEE_DETECTION_SOURCE_COL=${ds}"
    echo "VEE_SOURCE_EVENT_KEY_COL=${sk}"
    (( ds == 1 && sk == 1 )) || mark_blocked "VEE_SOURCE_IDENTITY_COLS"
    for mig in "${RFRF_REQUIRED_MIGRATIONS[@]}"; do
      applied="$(psql "$url" -Atqc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='${mig}';" 2>/dev/null || echo 0)"
      echo "MIGRATION_${mig}=${applied}"
      (( applied == 1 )) || mark_blocked "MIGRATION_${mig}"
    done
  else
    mark_blocked "DB_PSQL"
  fi
fi

echo "--- METRICS ENDPOINT ---"
if [[ -f "$BACKEND_ENV" ]]; then
  rfrf_metrics_probe "$BACKEND_ENV" "$SYNQDRIVE_REPLICA_A_PORT" || mark_blocked "METRICS_A"
  rfrf_metrics_probe "$BACKEND_ENV" "$SYNQDRIVE_REPLICA_B_PORT" || mark_blocked "METRICS_B"
fi

echo "--- PROMETHEUS / ALERTS ---"
repo_alerts="$(rfrf_repo_alerts_file "$CURRENT")"
rfrf_verify_repo_alerts_subset "$repo_alerts" || mark_blocked "REPO_ALERTS"
rfrf_promtool_check_rules "$repo_alerts" || mark_blocked "PROMTOOL_REPO"

if [[ -f "${PROM_DIR}/prometheus.yml" ]]; then
  rfrf_observability_topology_check "${PROM_DIR}/prometheus.yml" || mark_blocked "OBSERVABILITY_TOPOLOGY"
else
  mark_blocked "PROMETHEUS_CONFIG"
fi

if rfrf_verify_loaded_alerts "${PROM_DIR}/alerts.yml"; then
  echo "LOADED_F8_ALERTS=YES"
else
  echo "LOADED_F8_ALERTS=NO"
  mark_blocked "LOADED_F8_ALERTS"
fi

echo "--- STAGE DERIVATION ---"
if [[ -f "$BACKEND_ENV" ]]; then
  echo "CURRENT_STAGE=$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
fi

if (( BLOCKED )); then
  echo "RFRF_PRODUCTION_PREFLIGHT=BLOCKED"
  exit 1
fi

echo "RFRF_PRODUCTION_PREFLIGHT=PASS"
exit 0
