#!/usr/bin/env bash
# Read-only blast-radius assessment before RFRF Stage 5 promotion enablement.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
BLAST_RADIUS_PASS="${RFRF_BLAST_RADIUS_PASS:-0}"
QUERY_ERRORS=0

psql_count_or_err() {
  local url="$1" sql="$2"
  local out
  out="$(psql "$url" -Atqc "$sql" 2>/dev/null || echo ERR)"
  if [[ "$out" == "ERR" || -z "$out" ]]; then
    QUERY_ERRORS=1
    echo "ERR"
    return 1
  fi
  echo "$out"
}

echo "=== RFRF BLAST-RADIUS ASSESSMENT ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "BLAST_RADIUS=BLOCKED backend.env missing" >&2
  exit 1
fi

url="$(rfrf_dotenv_database_url "$BACKEND_ENV")"

if [[ -z "$url" ]] || ! command -v psql >/dev/null 2>&1; then
  echo "BLAST_RADIUS=BLOCKED database unavailable" >&2
  exit 1
fi

fuel_capable="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM vehicles v JOIN dimo_vehicle_snapshots d ON d.vehicle_id = v.id WHERE v.deleted_at IS NULL AND d.token_id IS NOT NULL;")"
candidate_total="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM raw_refuel_candidates;")"
candidate_ready="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM raw_refuel_candidates WHERE lifecycle_state='READY_FOR_PERSIST';")"
candidate_insufficient="metric_only"
candidate_observed="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM raw_refuel_candidates WHERE lifecycle_state='OBSERVED';")"
candidate_settling="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM raw_refuel_candidates WHERE lifecycle_state='SETTLING';")"
candidate_rejected="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM raw_refuel_candidates WHERE lifecycle_state='REJECTED';")"
candidate_converged="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM raw_refuel_candidates WHERE lifecycle_state='CONVERGED_NATIVE';")"
candidate_promoted="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM raw_refuel_candidates WHERE lifecycle_state='PROMOTED';")"
fallback_vee="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM vehicle_energy_events WHERE detection_source='SYNQDRIVE_RAW_FUEL_FALLBACK';")"
collision_source="$(psql_count_or_err "$url" "SELECT COUNT(*) FROM (SELECT source_event_key FROM vehicle_energy_events WHERE detection_source='SYNQDRIVE_RAW_FUEL_FALLBACK' AND source_event_key IS NOT NULL GROUP BY source_event_key HAVING COUNT(*) > 1) s;")"

echo "FUEL_CAPABLE_VEHICLES=${fuel_capable}"
echo "RAW_REFUEL_CANDIDATES_TOTAL=${candidate_total}"
echo "CANDIDATES_READY_FOR_PERSIST=${candidate_ready}"
echo "CANDIDATES_INSUFFICIENT=${candidate_insufficient}"
echo "CANDIDATES_OBSERVED=${candidate_observed}"
echo "CANDIDATES_SETTLING=${candidate_settling}"
echo "CANDIDATES_REJECTED=${candidate_rejected}"
echo "CANDIDATES_CONVERGED_NATIVE=${candidate_converged}"
echo "CANDIDATES_PROMOTED=${candidate_promoted}"
echo "FALLBACK_VEE_TOTAL=${fallback_vee}"
echo "SOURCE_EVENT_KEY_COLLISION_GROUPS=${collision_source:-0}"

rfrf_read_flag_snapshot "$BACKEND_ENV"

echo "--- PROMETHEUS AGGREGATES (canonical) ---"
for metric in \
  'sum(synqdrive_rfrf_native_overlap_same_total)' \
  'sum(synqdrive_rfrf_native_overlap_distinct_total)' \
  'sum(synqdrive_rfrf_native_overlap_insufficient_evidence_total)' \
  'sum(synqdrive_rfrf_persist_created_total)' \
  'sum(synqdrive_rfrf_persist_rediscovered_total)' \
  'sum(synqdrive_rfrf_branch_error_total)' \
  'sum(synqdrive_rfrf_promotion_blocked_cutover_total)' \
  'sum(synqdrive_rfrf_sample_fetch_success_total)' \
  'sum(synqdrive_rfrf_sample_fetch_failure_total)'; do
  val="$(rfrf_prometheus_instant_scalar "$metric" || true)"
  if [[ "$val" == "ERR" ]]; then
    QUERY_ERRORS=1
  fi
  safe_name="$(printf '%s' "$metric" | tr '():+' '____' | tr -d ' ')"
  echo "PROM_${safe_name}=${val}"
done

echo "GLOBAL_ONLY_ENABLEMENT=YES"
echo "NARROW_CANARY_SUPPORTED=NO"
echo "BLAST_RADIUS_OPERATOR_APPROVAL_REQUIRED=YES before Stage 5"

if (( QUERY_ERRORS )); then
  echo "BLAST_RADIUS_ASSESSMENT_COMPLETE=NO"
  echo "BLAST_RADIUS_ASSESSMENT=BLOCKED"
  echo "ERROR: blast-radius SQL/metrics query errors — Stage 5 blocked" >&2
  exit 1
fi

echo "BLAST_RADIUS_ASSESSMENT_COMPLETE=YES"

if [[ "$BLAST_RADIUS_PASS" == "1" ]]; then
  echo "BLAST_RADIUS_OPERATOR_PASS=RECORDED"
  echo "BLAST_RADIUS_ASSESSMENT=PASS"
  exit 0
fi

echo "BLAST_RADIUS_ASSESSMENT=PENDING_OPERATOR_PASS"
echo "Set RFRF_BLAST_RADIUS_PASS=1 after operator review to authorize Stage 5 tooling."
exit 2
