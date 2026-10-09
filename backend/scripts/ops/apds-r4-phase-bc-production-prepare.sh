#!/usr/bin/env bash
# APDS R4 Phase B+C — authorized PREPARED epoch only (production).
set -euo pipefail

EXPECTED_SHA="${APDS_R4_EXPECTED_SHA:-ab72f574014d6657cac158c253696b7237cdd3e6}"
OLD_EPOCH_ID="${APDS_R4_OLD_EPOCH_ID:-cf6d91ec-5e57-401c-ae21-c4ec9dabad25}"
EXPECTED_FP="${APDS_R4_EXPECTED_COHORT_FP:-9b1085d48a9c89c14d219370b39831c89b411a64013a0d965c4a157f48fe73e1}"
BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
BACKEND_DIR="${SYNQDRIVE_BACKEND_DIR:-/opt/synqdrive/current/backend}"
EVIDENCE_DIR="${SYNQDRIVE_DEPLOY_STATE_DIR:-/opt/synqdrive/shared/deploy-state}/apds-r4-phase-bc"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="${EVIDENCE_DIR}/phase-bc-${TS}.evidence.log"
mkdir -p "$EVIDENCE_DIR"

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
  export APD_SHADOW_EPOCH_OPS_TOKEN="$APDS_BC_OPS_TOKEN"
}

run_cli() {
  cd "$BACKEND_DIR"
  load_cli_env
  npx --yes ts-node -r tsconfig-paths/register scripts/ops/apd-shadow-activation-epoch-cli.ts "$@"
}

phase_b1() {
  log "B1 owner_authorization=CONFIRMED scope=PHASE_B_AND_C_ONLY"
  local a b
  a="$(replica_sha "${SYNQDRIVE_REPLICA_A_PM2_NAME}")"
  b="$(replica_sha "${SYNQDRIVE_REPLICA_B_PM2_NAME}")"
  log "B1 runtime_sha_a=${a} runtime_sha_b=${b}"
  [[ "$a" == "$EXPECTED_SHA" && "$b" == "$EXPECTED_SHA" ]] || { log "B1 FAIL runtime_sha"; return 1; }

  local pin1 pin2
  pin1="$(env_val SYNQDRIVE_DEPLOYED_GIT_SHA)"
  pin2="$(env_val APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA)"
  log "B1 pin_deployed_prefix=${pin1:0:12} pin_approved_prefix=${pin2:0:12}"
  [[ "$pin1" == "$EXPECTED_SHA" && "$pin2" == "$EXPECTED_SHA" ]] || { log "B1 FAIL pins"; return 1; }

  if ls "${SYNQDRIVE_DEPLOY_STATE_DIR}/apds-r4-step-a/"*.evidence.log >/dev/null 2>&1; then
    log "B1 step_a_evidence_present=YES"
  else
    log "B1 FAIL step_a_evidence_missing"
    return 1
  fi

  curl -sf "${SYNQDRIVE_EXTERNAL_HEALTH_URL}" | grep -q '"status":"ok"' || { log "B1 FAIL external"; return 1; }
  for port in "${SYNQDRIVE_REPLICA_A_PORT}" "${SYNQDRIVE_REPLICA_B_PORT}"; do
    vps_replica_curl_health_ok "$port" && vps_replica_curl_readiness_ok "$port" || { log "B1 FAIL replica port=$port"; return 1; }
  done
  [[ "$(vps_replica_count_scheduler_leaders)" == "1" ]] || { log "B1 FAIL leaders"; return 1; }
  [[ "$(env_val WORKER_APD_SHADOW_ENABLED)" == "true" ]] || { log "B1 FAIL shadow"; return 1; }

  local allowlist token
  allowlist="$(env_val APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST)"
  token="$(env_val APD_SHADOW_EPOCH_OPS_TOKEN)"
  [[ -n "$allowlist" && -n "$token" ]] || { log "B1 FAIL operator_config"; return 1; }
  export APDS_BC_OPERATOR_ACTOR="${allowlist%%,*}"
  export APDS_BC_OPS_TOKEN="$token"
  log "B1 operator_allowlist_entries=$(echo "$allowlist" | awk -F, '{print NF}') token_configured=YES"
  log "B1 PASS"
}

phase_b2() {
  export APDS_BC_DECISIONS_BEFORE
  APDS_BC_DECISIONS_BEFORE="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${OLD_EPOCH_ID}';")"
  export APDS_BC_PREPARED_BEFORE
  APDS_BC_PREPARED_BEFORE="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT count(*) FROM apd_shadow_activation_epochs WHERE lifecycle_state='PREPARED' AND cohort_config_fingerprint_sha256='${EXPECTED_FP}';")"
  local row
  row="$(sudo -u postgres psql -d synqdrive -tA -F'|' -c "SELECT lifecycle_state, to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), cohort_config_fingerprint_sha256, b2_policy_version, b4_policy_version, production_release_identity, organization_id FROM apd_shadow_activation_epochs WHERE id='${OLD_EPOCH_ID}';")"
  log "B2 old_epoch_row=${row}"
  echo "$row" | grep -q '^ACTIVE|' || { log "B2 FAIL not_active"; return 1; }
  echo "$row" | grep -q "${EXPECTED_FP}" || { log "B2 FAIL fingerprint"; return 1; }
  echo "$row" | grep -q 'P25_APD_B2_V1|P25_APD_B4_V1' || { log "B2 FAIL policies"; return 1; }
  [[ "$APDS_BC_PREPARED_BEFORE" == "0" ]] || { log "B2 FAIL prepared_exists count=${APDS_BC_PREPARED_BEFORE}"; return 1; }
  export APDS_BC_ORG_ID
  APDS_BC_ORG_ID="$(echo "$row" | cut -d'|' -f7)"
  log "B2 decisions_before=${APDS_BC_DECISIONS_BEFORE} prepared_before=${APDS_BC_PREPARED_BEFORE} org_id_prefix=${APDS_BC_ORG_ID:0:8}"
  log "B2 PASS"
}

phase_b3() {
  local req
  req="$(uuidgen)"
  export APDS_BC_REQUEST_ID="$req"
  log "B3 operation_request_id=${req}"
  local out
  out="$(run_cli --command status --actor "$APDS_BC_OPERATOR_ACTOR" --request-id "$req" --reason "APDS R4 phase BC preflight" --ops-token "$APDS_BC_OPS_TOKEN")"
  printf '%s\n' "$out" >> "$EVIDENCE"
  echo "$out" | grep -q "$EXPECTED_FP" || { log "B3 FAIL status_fingerprint"; return 1; }
  out="$(run_cli --command preflight --actor "$APDS_BC_OPERATOR_ACTOR" --request-id "$req" --reason "APDS R4 phase BC preflight" --ops-token "$APDS_BC_OPS_TOKEN")"
  printf '%s\n' "$out" >> "$EVIDENCE"
  echo "$out" | grep -q '"ok": true' || { log "B3 FAIL preflight"; return 1; }
  out="$(run_cli --command prepare --dry-run --actor "$APDS_BC_OPERATOR_ACTOR" --request-id "$req" \
    --reason "APDS R4 scientific V2.1 epoch preparation dry-run" --ops-token "$APDS_BC_OPS_TOKEN" \
    --organization-id "$APDS_BC_ORG_ID")"
  printf '%s\n' "$out" >> "$EVIDENCE"
  echo "$out" | grep -q '"dryRun": true' || { log "B3 FAIL prepare_dry_run"; return 1; }
  log "B3 PASS"
}

phase_c1() {
  local req out epoch_line
  req="$(uuidgen)"
  log "C1 prepare_request_id=${req}"
  set +e
  out="$(run_cli --command prepare --actor "$APDS_BC_OPERATOR_ACTOR" --request-id "$req" \
    --reason "APDS R4 scientific V2.1 epoch preparation" --ops-token "$APDS_BC_OPS_TOKEN" \
    --organization-id "$APDS_BC_ORG_ID" 2>&1)"
  local ec=$?
  set -e
  printf '%s\n' "$out" | sed 's/opsToken[^,]*//g' >> "$EVIDENCE"
  if [[ $ec -ne 0 ]]; then
    log "C1 CLI exit=${ec} — reconciling registry"
    export APDS_BC_PREPARE_OUTCOME=CLI_ERROR
    return 1
  fi
  epoch_line="$(echo "$out" | grep -oE '"epochId":\s*"[0-9a-f-]{36}"' | head -1)"
  export APDS_BC_NEW_EPOCH_ID
  APDS_BC_NEW_EPOCH_ID="$(echo "$epoch_line" | sed 's/.*"\([0-9a-f-]\{36\}\)".*/\1/')"
  if [[ -z "$APDS_BC_NEW_EPOCH_ID" ]]; then
    log "C1 FAIL ambiguous_no_epoch_id_in_output"
    export APDS_BC_PREPARE_OUTCOME=AMBIGUOUS
    return 1
  fi
  export APDS_BC_PREPARE_OUTCOME=SUCCESS
  log "C1 new_epoch_id=${APDS_BC_NEW_EPOCH_ID}"
}

phase_c2() {
  local prepared_after active_count row new_row decisions_new
  prepared_after="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT count(*) FROM apd_shadow_activation_epochs WHERE lifecycle_state='PREPARED' AND cohort_config_fingerprint_sha256='${EXPECTED_FP}';")"
  active_count="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT count(*) FROM apd_shadow_activation_epochs WHERE lifecycle_state='ACTIVE' AND cohort_config_fingerprint_sha256='${EXPECTED_FP}';")"
  new_row="$(sudo -u postgres psql -d synqdrive -tA -F'|' -c "SELECT lifecycle_state, activated_at IS NULL, production_release_identity, b2_policy_version, b4_policy_version, activation_request_key IS NULL, operator_request_id FROM apd_shadow_activation_epochs WHERE id='${APDS_BC_NEW_EPOCH_ID}';")"
  decisions_new="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${APDS_BC_NEW_EPOCH_ID}';")"
  export APDS_BC_DECISIONS_AFTER
  APDS_BC_DECISIONS_AFTER="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT count(*) FROM apd_shadow_reconciliation_decisions WHERE activation_epoch_id='${OLD_EPOCH_ID}';")"
  log "C2 prepared_after=${prepared_after} active_after=${active_count} new_row=${new_row} new_decisions=${decisions_new} old_decisions_after=${APDS_BC_DECISIONS_AFTER}"
  [[ "$prepared_after" == "1" ]] || { log "C2 FAIL prepared_count"; return 1; }
  [[ "$active_count" == "1" ]] || { log "C2 FAIL active_count"; return 1; }
  echo "$new_row" | grep -q '^PREPARED|t|' || { log "C2 FAIL new_state"; return 1; }
  echo "$new_row" | grep -q "${EXPECTED_SHA}" || { log "C2 FAIL release"; return 1; }
  [[ "$decisions_new" == "0" ]] || { log "C2 FAIL new_writes"; return 1; }
  log "C2 PASS"
}

main() {
  phase_b1 || exit 1
  phase_b2 || exit 1
  phase_b3 || exit 1
  phase_c1 || exit 1
  phase_c2 || exit 1
  echo "PHASE_BC_RESULT=SUCCESS"
  echo "NEW_EPOCH_ID=${APDS_BC_NEW_EPOCH_ID}"
}

main "$@"
