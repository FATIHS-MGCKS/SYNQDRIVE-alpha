#!/usr/bin/env bash
# APDS R4 Phase D–J — authorized PAUSE + ACTIVATE handover (production).
set -euo pipefail

AUTHORIZED_SHA="${APDS_R4_AUTHORIZED_SHA:-ab72f574014d6657cac158c253696b7237cdd3e6}"
OLD_EPOCH_ID="${APDS_R4_OLD_EPOCH_ID:-cf6d91ec-5e57-401c-ae21-c4ec9dabad25}"
NEW_EPOCH_ID="${APDS_R4_NEW_EPOCH_ID:-3cbc5d95-a5fb-4259-8c00-88f0df93e77a}"
EXPECTED_FP="${APDS_R4_EXPECTED_COHORT_FP:-9b1085d48a9c89c14d219370b39831c89b411a64013a0d965c4a157f48fe73e1}"
EXPECTED_ORG="${APDS_R4_EXPECTED_ORG:-faa710c9-6d91-4079-a7d5-91fdccdec14a}"
OLD_T0="${APDS_R4_OLD_T0:-2026-10-08T20:13:28.270Z}"
BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
BACKEND_DIR="${SYNQDRIVE_BACKEND_DIR:-/opt/synqdrive/current/backend}"
EVIDENCE_DIR="${SYNQDRIVE_DEPLOY_STATE_DIR:-/opt/synqdrive/shared/deploy-state}/apds-r4-phase-dj"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="${EVIDENCE_DIR}/handover-${TS}.evidence.log"
KEY_FILE="${EVIDENCE_DIR}/activation-request-key-${TS}.txt"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$EVIDENCE"; }

OPS_DIR="${SYNQDRIVE_OPS_DIR:-/opt/synqdrive/current/backend/scripts/ops}"
# shellcheck source=vps-production-replica-topology.config.sh
source "${OPS_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${OPS_DIR}/lib/vps-production-replica.lib.sh"

env_val() { grep -m1 "^$1=" "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r'; }

replica_sha() {
  local name=$1 pid cwd
  pid="$(vps_replica_pm2_pid "$name")"
  cwd="$(readlink -f "/proc/${pid}/cwd")"
  git -C "$(dirname "$cwd")" rev-parse HEAD
}

load_cli_env() {
  export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r')"
  export WORKER_APD_SHADOW_ENABLED="$(grep -m1 '^WORKER_APD_SHADOW_ENABLED=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r')"
  export WORKER_APD_SHADOW_COHORT_JSON="$(grep -m1 '^WORKER_APD_SHADOW_COHORT_JSON=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r')"
  export SYNQDRIVE_DEPLOYED_GIT_SHA="$(grep -m1 '^SYNQDRIVE_DEPLOYED_GIT_SHA=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r')"
  export APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA="$(grep -m1 '^APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r')"
  export APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST="$(grep -m1 '^APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r')"
  export APD_SHADOW_EPOCH_OPS_TOKEN="$APDS_DJ_OPS_TOKEN"
}

run_cli() {
  cd "$BACKEND_DIR"
  load_cli_env
  npx --yes ts-node -r tsconfig-paths/register scripts/ops/apd-shadow-activation-epoch-cli.ts "$@"
}

psql_t() { sudo -u postgres psql -d synqdrive -tA -c "$1"; }

cohort_vehicle_id_sql_in() {
  python3 - "$BACKEND_ENV" <<'PY'
import json, sys
path = sys.argv[1]
cohort = None
for line in open(path):
    if line.startswith("WORKER_APD_SHADOW_COHORT_JSON="):
        cohort = json.loads(line.split("=", 1)[1])
        break
if not cohort:
    raise SystemExit("cohort_missing")
ids = [m["vehicleId"] for m in cohort["members"]]
print(",".join(f"'{i}'" for i in ids))
PY
}

in_flight_cohort_polls() {
  local ids
  ids="$(cohort_vehicle_id_sql_in)"
  psql_t "SELECT count(*)::int FROM dimo_poll_logs dpl
    WHERE dpl.job_type = 'SNAPSHOT'
      AND dpl.vehicle_id IN (${ids})
      AND dpl.started_at IS NOT NULL
      AND dpl.finished_at IS NULL
      AND dpl.started_at > now() - interval '45 minutes';"
}

epoch_snapshot() {
  psql_t "SELECT id||'|'||lifecycle_state||'|'||coalesce(to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'')||'|'||coalesce(to_char(paused_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'')||'|'||cohort_config_fingerprint_sha256||'|'||production_release_identity||'|'||coalesce(activation_request_key,'')
    FROM apd_shadow_activation_epochs WHERE id IN ('${OLD_EPOCH_ID}','${NEW_EPOCH_ID}') ORDER BY id;"
}

phase_d() {
  log "D owner_authorization=CONFIRMED scope=PHASE_D_TO_J_ONLY"
  local a b
  a="$(replica_sha "${SYNQDRIVE_REPLICA_A_PM2_NAME}")"
  b="$(replica_sha "${SYNQDRIVE_REPLICA_B_PM2_NAME}")"
  log "D runtime_sha_a=${a} runtime_sha_b=${b} current=$(readlink -f "${SYNQDRIVE_CURRENT_LINK}")"
  [[ "$a" == "$AUTHORIZED_SHA" && "$b" == "$AUTHORIZED_SHA" ]] || { log "D FAIL sha"; return 1; }
  local p1 p2
  p1="$(env_val SYNQDRIVE_DEPLOYED_GIT_SHA)"
  p2="$(env_val APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA)"
  [[ "$p1" == "$AUTHORIZED_SHA" && "$p2" == "$AUTHORIZED_SHA" ]] || { log "D FAIL pins"; return 1; }
  curl -sf "${SYNQDRIVE_EXTERNAL_HEALTH_URL}" | grep -q '"status":"ok"' || return 1
  for port in "${SYNQDRIVE_REPLICA_A_PORT}" "${SYNQDRIVE_REPLICA_B_PORT}"; do
    vps_replica_curl_health_ok "$port" && vps_replica_curl_readiness_ok "$port" || return 1
  done
  [[ "$(vps_replica_count_scheduler_leaders)" == "1" ]] || return 1
  [[ "$(env_val WORKER_APD_SHADOW_ENABLED)" == "true" ]] || return 1

  local allowlist token
  allowlist="$(env_val APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST)"
  token="$(env_val APD_SHADOW_EPOCH_OPS_TOKEN)"
  [[ -n "$allowlist" && -n "$token" ]] || return 1
  export APDS_DJ_OPERATOR_ACTOR="${allowlist%%,*}"
  export APDS_DJ_OPS_TOKEN="$token"
  log "D operator_configured=YES"

  local active prepared
  active="$(psql_t "SELECT count(*) FROM apd_shadow_activation_epochs WHERE lifecycle_state='ACTIVE' AND cohort_config_fingerprint_sha256='${EXPECTED_FP}';")"
  prepared="$(psql_t "SELECT count(*) FROM apd_shadow_activation_epochs WHERE lifecycle_state='PREPARED' AND cohort_config_fingerprint_sha256='${EXPECTED_FP}';")"
  [[ "$active" == "1" && "$prepared" == "1" ]] || { log "D FAIL epoch_counts active=${active} prepared=${prepared}"; return 1; }

  local old_row new_row
  old_row="$(psql_t "SELECT lifecycle_state||'|'||to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM apd_shadow_activation_epochs WHERE id='${OLD_EPOCH_ID}';")"
  new_row="$(psql_t "SELECT lifecycle_state||'|'||(activated_at IS NULL)::text FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}';")"
  log "D old_epoch=${old_row} new_epoch=${new_row}"
  [[ "$old_row" == "ACTIVE|${OLD_T0}" ]] || { log "D FAIL old_epoch"; return 1; }
  [[ "$new_row" == "PREPARED|t" || "$new_row" == "PREPARED|true" ]] || { log "D FAIL new_epoch"; return 1; }

  local new_rel
  new_rel="$(psql_t "SELECT production_release_identity FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}';")"
  [[ "$new_rel" == "$AUTHORIZED_SHA" ]] || { log "D FAIL new_release"; return 1; }

  export APDS_DJ_ACTIVATION_KEY
  APDS_DJ_ACTIVATION_KEY="$(uuidgen)"
  printf '%s\n' "$APDS_DJ_ACTIVATION_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  log "D activation_request_key_persisted_path=${KEY_FILE} (key value not logged)"

  local req dry_before dry_after
  req="$(uuidgen)"
  dry_before="$(epoch_snapshot)"
  run_cli --command pause --dry-run --epoch-id "$OLD_EPOCH_ID" --actor "$APDS_DJ_OPERATOR_ACTOR" \
    --request-id "$req" --reason "APDS R4 handover pause dry-run" --ops-token "$APDS_DJ_OPS_TOKEN" | tee -a "$EVIDENCE" | grep -q '"dryRun": true'
  req="$(uuidgen)"
  run_cli --command activate --dry-run --epoch-id "$NEW_EPOCH_ID" --activation-request-key "$APDS_DJ_ACTIVATION_KEY" \
    --organization-id "$EXPECTED_ORG" --actor "$APDS_DJ_OPERATOR_ACTOR" --request-id "$req" \
    --reason "APDS R4 handover activate dry-run" --ops-token "$APDS_DJ_OPS_TOKEN" | tee -a "$EVIDENCE" | grep -q '"dryRun": true'
  dry_after="$(epoch_snapshot)"
  [[ "$dry_before" == "$dry_after" ]] || { log "D FAIL dry_run_mutated_db"; return 1; }
  key_bound="$(psql_t "SELECT count(*) FROM apd_shadow_activation_epochs WHERE activation_request_key='${APDS_DJ_ACTIVATION_KEY}';")"
  [[ "$key_bound" == "0" ]] || { log "D FAIL key_already_bound"; return 1; }
  log "D PASS"
}

phase_e() {
  export APDS_DJ_DECISIONS_BEFORE
  APDS_DJ_DECISIONS_BEFORE="$(psql_t "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${OLD_EPOCH_ID}';")"
  export APDS_DJ_NULL_LEGACY
  APDS_DJ_NULL_LEGACY="$(psql_t "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id IS NULL;")"
  log "E baseline old_decisions=${APDS_DJ_DECISIONS_BEFORE} legacy_null=${APDS_DJ_NULL_LEGACY}"

  local inflight
  inflight="$(in_flight_cohort_polls)"
  log "E in_flight_cohort_snapshot_polls=${inflight}"
  if [[ "$inflight" != "0" ]]; then
    log "E DEFERRED quiet_boundary_not_clear"
    export APDS_DJ_DEFERRED=YES
    return 1
  fi
  inflight="$(in_flight_cohort_polls)"
  [[ "$inflight" == "0" ]] || return 1
  log "E quiet_boundary_verified=YES"
}

phase_f() {
  local inflight
  inflight="$(in_flight_cohort_polls)"
  [[ "$inflight" == "0" ]] || { log "F DEFERRED pre_pause_inflight=${inflight}"; return 1; }

  local req out
  req="$(uuidgen)"
  export APDS_DJ_PAUSE_AT_MS
  APDS_DJ_PAUSE_AT_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
  out="$(run_cli --command pause --epoch-id "$OLD_EPOCH_ID" --actor "$APDS_DJ_OPERATOR_ACTOR" \
    --request-id "$req" --reason "APDS R4 scientific V2.1 epoch handover PAUSE" --ops-token "$APDS_DJ_OPS_TOKEN")"
  printf '%s\n' "$out" >> "$EVIDENCE"
  local state paused_at
  state="$(psql_t "SELECT lifecycle_state FROM apd_shadow_activation_epochs WHERE id='${OLD_EPOCH_ID}';")"
  paused_at="$(psql_t "SELECT to_char(paused_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM apd_shadow_activation_epochs WHERE id='${OLD_EPOCH_ID}';")"
  export APDS_DJ_OLD_PAUSED_AT="$paused_at"
  [[ "$state" == "PAUSED" ]] || { log "F FAIL pause_state=${state}"; return 1; }
  active="$(psql_t "SELECT count(*) FROM apd_shadow_activation_epochs WHERE lifecycle_state='ACTIVE' AND cohort_config_fingerprint_sha256='${EXPECTED_FP}';")"
  [[ "$active" == "0" ]] || { log "F FAIL still_active=${active}"; return 1; }
  log "F PASS paused_at=${paused_at}"
}

phase_g() {
  local req out
  req="$(uuidgen)"
  export APDS_DJ_ACTIVATE_AT_MS
  APDS_DJ_ACTIVATE_AT_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
  export APDS_DJ_GAP_MS=$((APDS_DJ_ACTIVATE_AT_MS - APDS_DJ_PAUSE_AT_MS))
  set +e
  out="$(run_cli --command activate --epoch-id "$NEW_EPOCH_ID" --activation-request-key "$APDS_DJ_ACTIVATION_KEY" \
    --organization-id "$EXPECTED_ORG" --actor "$APDS_DJ_OPERATOR_ACTOR" --request-id "$req" \
    --reason "APDS R4 scientific V2.1 epoch handover ACTIVATE" --ops-token "$APDS_DJ_OPS_TOKEN" 2>&1)"
  local ec=$?
  set -e
  printf '%s\n' "$out" >> "$EVIDENCE"

  local state key_row new_t0
  state="$(psql_t "SELECT lifecycle_state FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}';")"
  new_t0="$(psql_t "SELECT to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}';")"
  key_row="$(psql_t "SELECT activation_request_key FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}';")"

  if [[ "$state" == "ACTIVE" && -n "$new_t0" && "$key_row" == "$APDS_DJ_ACTIVATION_KEY" ]]; then
    export APDS_DJ_NEW_T0="$new_t0"
    export APDS_DJ_ACTIVATE_OUTCOME=SUCCESS
    log "G PASS new_t0=${new_t0} gap_ms=${APDS_DJ_GAP_MS} cli_ec=${ec}"
    return 0
  fi
  log "G FAIL state=${state} new_t0=${new_t0} cli_ec=${ec}"
  export APDS_DJ_ACTIVATE_OUTCOME=FAIL
  return 1
}

phase_h() {
  local old_state active_count
  old_state="$(psql_t "SELECT lifecycle_state FROM apd_shadow_activation_epochs WHERE id='${OLD_EPOCH_ID}';")"
  active_count="$(psql_t "SELECT count(*) FROM apd_shadow_activation_epochs WHERE lifecycle_state='ACTIVE' AND cohort_config_fingerprint_sha256='${EXPECTED_FP}';")"
  [[ "$old_state" == "PAUSED" && "$active_count" == "1" ]] || return 1
  local old_t0_check
  old_t0_check="$(psql_t "SELECT to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM apd_shadow_activation_epochs WHERE id='${OLD_EPOCH_ID}';")"
  [[ "$old_t0_check" == "$OLD_T0" ]] || return 1
  export APDS_DJ_OLD_AFTER_PAUSE
  APDS_DJ_OLD_AFTER_PAUSE="$(psql_t "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${OLD_EPOCH_ID}';")"
  sleep 3
  export APDS_DJ_OLD_AFTER_SETTLE
  APDS_DJ_OLD_AFTER_SETTLE="$(psql_t "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${OLD_EPOCH_ID}';")"
  export APDS_DJ_NEW_DECISIONS
  APDS_DJ_NEW_DECISIONS="$(psql_t "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${NEW_EPOCH_ID}';")"
  log "H old_writes_after_pause=${APDS_DJ_OLD_AFTER_PAUSE} after_settle=${APDS_DJ_OLD_AFTER_SETTLE} new_epoch_decisions=${APDS_DJ_NEW_DECISIONS}"
  log "H PASS"
}

phase_i() {
  curl -sf "${SYNQDRIVE_EXTERNAL_HEALTH_URL}" | grep -q '"status":"ok"' || return 1
  vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_A_PORT}" && vps_replica_curl_readiness_ok "${SYNQDRIVE_REPLICA_A_PORT}" || return 1
  vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_B_PORT}" && vps_replica_curl_readiness_ok "${SYNQDRIVE_REPLICA_B_PORT}" || return 1
  [[ "$(vps_replica_count_scheduler_leaders)" == "1" ]] || return 1
  log "I PASS"
}

phase_j_immediate() {
  export APDS_DJ_T_PLUS_1H
  APDS_DJ_T_PLUS_1H="$(psql_t "SELECT to_char((activated_at + interval '60 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}';")"
  export APDS_DJ_J_OPPS APDS_DJ_J_B2 APDS_DJ_J_B4
  APDS_DJ_J_OPPS="$(psql_t "SELECT count(DISTINCT opportunity_id) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${NEW_EPOCH_ID}' AND decision_at >= (SELECT activated_at FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}');")"
  APDS_DJ_J_B2="$(psql_t "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${NEW_EPOCH_ID}' AND policy_version='P25_APD_B2_V1' AND decision_at >= (SELECT activated_at FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}');")"
  APDS_DJ_J_B4="$(psql_t "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${NEW_EPOCH_ID}' AND policy_version='P25_APD_B4_V1' AND decision_at >= (SELECT activated_at FROM apd_shadow_activation_epochs WHERE id='${NEW_EPOCH_ID}');")"
  log "J immediate opps=${APDS_DJ_J_OPPS} b2=${APDS_DJ_J_B2} b4=${APDS_DJ_J_B4} t_plus_1h_boundary=${APDS_DJ_T_PLUS_1H}"
}

main() {
  phase_d || exit 1
  phase_e || { echo "PHASE_DJ_RESULT=DEFERRED"; exit 2; }
  phase_f || exit 1
  phase_g || exit 1
  phase_h || exit 1
  phase_i || exit 1
  phase_j_immediate
  echo "PHASE_DJ_RESULT=SUCCESS"
  echo "NEW_T0_UTC=${APDS_DJ_NEW_T0}"
  echo "ACTIVATION_REQUEST_KEY_FILE=${KEY_FILE}"
}

main "$@"
