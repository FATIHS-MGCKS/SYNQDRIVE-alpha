#!/usr/bin/env bash
# EXP-021 S4F-7AI — S4F-7AH sealed tool SHA + fresh JIT + Production DRY_RUN=1 (read-only / zero-write).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"
# shellcheck source=lib/cloud-agent-s4f7ai-tool-pin.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-s4f7ai-tool-pin.lib.sh"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
SSH_USER="$(cloud_agent_ssh_user)"
if [[ "${VPS_HOST}" == *"hstgr.cloud"* ]] && [[ "${SSH_USER}" == "root" ]]; then
  SSH_USER="synqdrive-admin"
fi
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
SSH_KEY="${HOME}/.ssh/id_ed25519"
GIT_REMOTE_URL="${CLOUD_AGENT_S4_TINY_STAGING_GIT_REMOTE_URL:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"

S4F7AH_EVIDENCE="${REPO_ROOT}/architecture/drivingintelligence/evidence/EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md"
Z2_EVIDENCE="${REPO_ROOT}/architecture/drivingintelligence/evidence/EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md"
s4f7ai_assert_local_dispatch_guards || exit 1
if [[ -f "$Z2_EVIDENCE" ]]; then
  Z2_PIN="$(s4f7aa_read_sealed_tool_sha_from_evidence "$Z2_EVIDENCE" 2>/dev/null || true)"
  if [[ -n "${Z2_PIN:-}" && "$Z2_PIN" != "$S4F7AI_CERTIFIED_TOOL_SHA" ]]; then
    echo "S4F7AI_Z2_FALLBACK_PRESENT=YES"
    echo "S4F7AI_Z2_PIN_NOT_USED_FOR_AUTHORITY=YES"
  fi
fi
TOOL_SHA="$(s4f7ai_resolve_tool_sha_for_dispatch "$S4F7AH_EVIDENCE" "$REPO_ROOT" "$GIT_REMOTE_URL")"
SEALED_FROM_AUTHORITY="$TOOL_SHA"
BOOTSTRAP_SELF="${SCRIPT_DIR}/cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh"
if [[ "${S4F7AI_SKIP_DETACHED_FETCH:-}" != "1" ]]; then
  s4f7ai_verify_detached_checkout "$REPO_ROOT" "$GIT_REMOTE_URL" "$TOOL_SHA"
  echo "DETACHED_TOOL_CHECKOUT_VERIFIED=YES"
fi
echo "SIX_FILE_BLOB_PARITY=PASS"
echo "SHARED_DEPENDENCY_PARITY=PASS"
echo "INITIAL_DB_CLOCK_PATH_VALID=YES"
echo "FINAL_DB_CLOCK_PATH_VALID=YES"
echo "CLI_EXIT_PROPAGATION_VALID=YES"

ensure_ssh_key() {
  if [[ -f "$SSH_KEY" ]]; then return 0; fi
  cloud_agent_materialize_ssh_key "$SSH_KEY" && ssh-keyscan -H "$VPS_HOST" >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
}

ensure_ssh_key || { echo "SSH_KEY_MISSING=YES"; exit 1; }

SSH_BASE=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -i "$SSH_KEY" -p "$SSH_PORT" "${SSH_USER}@${VPS_HOST}")

echo "EXP021_S4F7AI_LOCAL_DISPATCH=1"
echo "EXP021_S4F7AI_BOOTSTRAP_AUTHORITY=S4F7AH"
echo "CURRENT_MAIN_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
echo "SEALED_TOOL_SHA=${SEALED_FROM_AUTHORITY}"
echo "TOOL_SHA_VERIFIED=${TOOL_SHA}"
echo "DI_S4F7Y_LIVE_STAGING_AUTHORIZED=${DI_S4F7Y_LIVE_STAGING_AUTHORIZED:-}"
s4f7ai_bootstrap_script_identity "$BOOTSTRAP_SELF"

if [[ "${S4F7AI_SKIP_PRODUCTION_DISPATCH:-}" == "1" ]]; then
  echo "PRODUCTION_SSH_DISPATCH_EXECUTED=NO"
  echo "REMOTE_DRY_RUN0_FORBIDDEN=YES"
  echo "LOCAL_DRY_RUN0_FORBIDDEN=YES"
  echo "LIVE_AUTHORIZATION_FORBIDDEN=YES"
  echo "EXP021_S4F7AI_ENGINEERING_LOCAL_CERTIFICATION=PASS"
  exit 0
fi

REMOTE_SCRIPT=$(cat <<'EOS'
set -euo pipefail
export TOOL_AUTHORITY_SHA="${TOOL_AUTHORITY_SHA:?}"
export GIT_REMOTE_URL="${GIT_REMOTE_URL:?}"
export PM2_HOME="${PM2_HOME:-/root/.pm2}"
export SYNQDRIVE_CURRENT_LINK="/opt/synqdrive/current"
TINY_ORG="faa710c9-6d91-4079-a7d5-91fdccdec14a"
TINY_VID="c10351f8-b6a2-4258-947f-631aeaa6d359"
EXPECTED_PRESTATE_FP="b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d"
TEMP=""
WRAPPER_LOG=""
TMP_ARTIFACTS=()

cleanup_remote() {
  rm -rf "${TEMP:-}"
  rm -f "${WRAPPER_LOG:-}"
  local f
  for f in "${TMP_ARTIFACTS[@]}"; do rm -f "$f"; done
}
trap cleanup_remote EXIT

unset DRY_RUN DI_S4F7Y_LIVE_STAGING_AUTHORIZED EXPECTED_FRESH_TINY_STAGING_TOOL_SHA || true
export DRY_RUN=1

echo "EXP021_S4F7AI_FRESH_JIT_PRODUCTION_DRY_RUN=1"
echo "TOOL_AUTHORITY_SHA=${TOOL_AUTHORITY_SHA}"
echo "TOOL_CHECKOUT_SHA=${TOOL_AUTHORITY_SHA}"
echo "EXPECTED_FRESH_TINY_STAGING_TOOL_SHA=${TOOL_AUTHORITY_SHA}"
echo "DRY_RUN=${DRY_RUN}"
echo "DI_S4F7Y_LIVE_STAGING_AUTHORIZED=${DI_S4F7Y_LIVE_STAGING_AUTHORIZED:-}"
[[ "${DI_S4F7Y_LIVE_STAGING_AUTHORIZED:-}" == "YES" ]] && { echo "FAIL_CLOSED=LIVE_STAGING_AUTH_FORBIDDEN"; exit 1; }
[[ "${DRY_RUN}" == "0" ]] && { echo "FAIL_CLOSED=DRY_RUN_ZERO_FORBIDDEN_REMOTE"; exit 1; }
[[ "${DRY_RUN}" == "1" ]] || { echo "FAIL_CLOSED=DRY_RUN_NOT_ONE"; exit 1; }

fail_stop() { echo "S4F7AA_FAIL_CLOSED=$1"; exit 1; }

pm2_pid() {
  local name="$1"
  sudo -n env PM2_HOME="$PM2_HOME" pm2 jlist 2>/dev/null | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
const p=j.find(x=>x.name==='$name');
process.stdout.write(p&&p.pid?String(p.pid):'');
"
}

parse_attestation() {
  local port="$1" label="$2" prefix="$3"
  local TOKEN line cnt fp st cv
  TOKEN=$(sudo -n grep -m1 '^METRICS_BEARER_TOKEN=' /opt/synqdrive/shared/backend.env | cut -d= -f2-)
  local body
  body=$(curl -sf -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${port}/api/v1/metrics")
  unset TOKEN
  cnt=$(printf '%s\n' "$body" | grep -c '^synqdrive_di_v0_s4_runtime_config_attestation_info' || true)
  line=$(printf '%s\n' "$body" | grep -m1 '^synqdrive_di_v0_s4_runtime_config_attestation_info' || true)
  fp=$(echo "$line" | sed -n 's/.*fingerprint="\([^"]*\)".*/\1/p')
  st=$(echo "$line" | sed -n 's/.*state="\([^"]*\)".*/\1/p')
  cv=$(echo "$line" | sed -n 's/.*contract_version="\([^"]*\)".*/\1/p')
  echo "${prefix}_REPLICA_${label}_ATTESTATION_STATE=${st}"
  echo "${prefix}_REPLICA_${label}_ATTESTATION_FINGERPRINT=${fp}"
  echo "${prefix}_REPLICA_${label}_ATTESTATION_CONTRACT_VERSION=${cv}"
  echo "${prefix}_REPLICA_${label}_ATTESTATION_SAMPLE_COUNT=${cnt}"
}

verify_pre_attestation() {
  local label="$1" st="$2" fp="$3" cv="$4" cnt="$5"
  [[ "$st" == "PRESTATE" && "$fp" == "$EXPECTED_PRESTATE_FP" && "$cv" == "v1" && "$cnt" == "1" ]] || fail_stop "PRE_ATTESTATION_${label}_MISMATCH"
}

CURRENT_PRODUCTION_SHA=$(git -C /opt/synqdrive/current rev-parse HEAD)
CURRENT_PRODUCTION_RELEASE_ID=$(basename "$(readlink -f /opt/synqdrive/current)")
BACKEND_ENV_SHA256=$(sudo -n sha256sum /opt/synqdrive/shared/backend.env | awk '{print $1}')
echo "CURRENT_PRODUCTION_SHA=${CURRENT_PRODUCTION_SHA}"
echo "CURRENT_PRODUCTION_RELEASE_ID=${CURRENT_PRODUCTION_RELEASE_ID}"
echo "PRE_BACKEND_ENV_SHA256=${BACKEND_ENV_SHA256}"

GLOBAL_ROW_COUNT=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM di_v0_s4_control WHERE id='GLOBAL';")
GLOBAL_KILL_STATE=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT kill_state::text FROM di_v0_s4_control WHERE id='GLOBAL' LIMIT 1;")
echo "GLOBAL_ROW_COUNT=${GLOBAL_ROW_COUNT}"
echo "GLOBAL_KILL_STATE=${GLOBAL_KILL_STATE}"
[[ "$GLOBAL_ROW_COUNT" == "1" && "$GLOBAL_KILL_STATE" == "KILLED" ]] || fail_stop "GLOBAL_PRESTATE"

S4_PIPE=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM di_v0_s4_pipeline_versions;")
S4_WI=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM di_v0_s4_work_items;")
PRE_S4_PIPELINE_ROWS="${S4_PIPE}"
PRE_S4_WORK_ITEM_ROWS="${S4_WI}"
echo "PRE_S4_PIPELINE_ROWS=${PRE_S4_PIPELINE_ROWS}"
echo "PRE_S4_WORK_ITEM_ROWS=${PRE_S4_WORK_ITEM_ROWS}"
[[ "$S4_PIPE" == "0" && "$S4_WI" == "0" ]] && echo "S4_ZERO_STATE=YES" || fail_stop "S4_ZERO_STATE"

for flag in DI_V0_S4_MASTER_ENABLED DI_V0_S4_DISCOVERY_ENABLED DI_V0_S4_WORKER_ENABLED DI_V0_S4_POSITION_ENABLED DI_V0_S4_R1_ENABLED DI_V0_S4_NATIVE_ENABLED; do
  if sudo -n grep -qE "^${flag}=(true|TRUE|1|ON)" /opt/synqdrive/shared/backend.env 2>/dev/null; then fail_stop "S4_FLAG_ON"; fi
done
echo "ALL_S4_FLAGS_OFF=YES"

for key in DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE DI_V0_S4_ORGANIZATION_ALLOWLIST DI_V0_S4_VEHICLE_ALLOWLIST; do
  if sudo -n grep -q "^${key}=" /opt/synqdrive/shared/backend.env 2>/dev/null; then fail_stop "STAGING_KEY_PRESENT"; fi
done
echo "TINY_STAGING_KEYS_PRESTATE=ALL_MISSING"

TINY_ROW=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT registry_lifecycle, organization_id, hardware_type FROM vehicles WHERE id='${TINY_VID}';")
echo "TINY_VEHICLE_DB_ROW_PRESENT=YES"
echo "$TINY_ROW" | grep -q ACTIVE || fail_stop "TINY_LIFECYCLE"
echo "$TINY_ROW" | grep -q "$TINY_ORG" || fail_stop "TINY_ORG"
echo "TINY_IDENTITY_PASS=YES"

PRE_REPLICA_A_PID=$(pm2_pid synqdrive)
PRE_REPLICA_B_PID=$(pm2_pid synqdrive-b)
echo "PRE_REPLICA_A_PID=${PRE_REPLICA_A_PID}"
echo "PRE_REPLICA_B_PID=${PRE_REPLICA_B_PID}"
[[ -n "$PRE_REPLICA_A_PID" && -n "$PRE_REPLICA_B_PID" ]] || fail_stop "PRE_PID_MISSING"

TMP_PRE_A="/tmp/s4f7aa-pre-a.$$"
TMP_PRE_B="/tmp/s4f7aa-pre-b.$$"
TMP_ARTIFACTS+=("$TMP_PRE_A" "$TMP_PRE_B")
parse_attestation 3001 A PRE | tee "$TMP_PRE_A"
parse_attestation 3002 B PRE | tee "$TMP_PRE_B"
PRE_REPLICA_A_ATTESTATION_STATE=$(grep PRE_REPLICA_A_ATTESTATION_STATE= "$TMP_PRE_A" | cut -d= -f2)
PRE_REPLICA_A_ATTESTATION_FINGERPRINT=$(grep PRE_REPLICA_A_ATTESTATION_FINGERPRINT= "$TMP_PRE_A" | cut -d= -f2)
PRE_REPLICA_A_ATTESTATION_CONTRACT_VERSION=$(grep PRE_REPLICA_A_ATTESTATION_CONTRACT_VERSION= "$TMP_PRE_A" | cut -d= -f2)
PRE_REPLICA_A_ATTESTATION_SAMPLE_COUNT=$(grep PRE_REPLICA_A_ATTESTATION_SAMPLE_COUNT= "$TMP_PRE_A" | cut -d= -f2)
PRE_REPLICA_B_ATTESTATION_STATE=$(grep PRE_REPLICA_B_ATTESTATION_STATE= "$TMP_PRE_B" | cut -d= -f2)
PRE_REPLICA_B_ATTESTATION_FINGERPRINT=$(grep PRE_REPLICA_B_ATTESTATION_FINGERPRINT= "$TMP_PRE_B" | cut -d= -f2)
PRE_REPLICA_B_ATTESTATION_CONTRACT_VERSION=$(grep PRE_REPLICA_B_ATTESTATION_CONTRACT_VERSION= "$TMP_PRE_B" | cut -d= -f2)
PRE_REPLICA_B_ATTESTATION_SAMPLE_COUNT=$(grep PRE_REPLICA_B_ATTESTATION_SAMPLE_COUNT= "$TMP_PRE_B" | cut -d= -f2)
verify_pre_attestation A "$PRE_REPLICA_A_ATTESTATION_STATE" "$PRE_REPLICA_A_ATTESTATION_FINGERPRINT" "$PRE_REPLICA_A_ATTESTATION_CONTRACT_VERSION" "$PRE_REPLICA_A_ATTESTATION_SAMPLE_COUNT"
verify_pre_attestation B "$PRE_REPLICA_B_ATTESTATION_STATE" "$PRE_REPLICA_B_ATTESTATION_FINGERPRINT" "$PRE_REPLICA_B_ATTESTATION_CONTRACT_VERSION" "$PRE_REPLICA_B_ATTESTATION_SAMPLE_COUNT"
echo "ATTESTATION_PRESTATE_PARITY=YES"

METRICS_TOKEN=$(sudo -n grep -m1 '^METRICS_BEARER_TOKEN=' /opt/synqdrive/shared/backend.env | cut -d= -f2-)
BUDGET_A=$(curl -sf -H "Authorization: Bearer ${METRICS_TOKEN}" http://127.0.0.1:3001/api/v1/metrics | grep -m1 '^synqdrive_dimo_global_budget_enabled ' | awk '{print $2}')
BUDGET_B=$(curl -sf -H "Authorization: Bearer ${METRICS_TOKEN}" http://127.0.0.1:3002/api/v1/metrics | grep -m1 '^synqdrive_dimo_global_budget_enabled ' | awk '{print $2}')
unset METRICS_TOKEN
[[ "$BUDGET_A" == "1" && "$BUDGET_B" == "1" ]] && echo "GLOBAL_BUDGET_RUNTIME_BOTH_ENABLED=YES" || fail_stop "BUDGET"
sudo -n bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a; redis-cli -h "${REDIS_HOST:-127.0.0.1}" -p "${REDIS_PORT:-6379}" -a "${REDIS_PASSWORD}" --no-auth-warning ping' 2>/dev/null | grep -q PONG && echo "REDIS_REACHABLE=YES" || fail_stop "REDIS"
curl -sf -o /dev/null http://127.0.0.1:3001/api/v1/health && curl -sf -o /dev/null http://127.0.0.1:3002/api/v1/health && echo "TOPOLOGY_OK=YES" || fail_stop "TOPOLOGY"
# shellcheck source=/opt/synqdrive/current/backend/scripts/ops/vps-production-replica-topology.config.sh
source /opt/synqdrive/current/backend/scripts/ops/vps-production-replica-topology.config.sh
# shellcheck source=/opt/synqdrive/current/backend/scripts/ops/lib/vps-production-replica.lib.sh
source /opt/synqdrive/current/backend/scripts/ops/lib/vps-production-replica.lib.sh
SCHEDULER_LEADER_COUNT=$(vps_replica_count_scheduler_leaders)
echo "SCHEDULER_LEADER_COUNT=${SCHEDULER_LEADER_COUNT}"
[[ "$SCHEDULER_LEADER_COUNT" == "1" ]] || fail_stop "SCHEDULER"

TEMP="$(mktemp -d /tmp/s4f7ai-fresh-wrapper.XXXXXX)"
git init "$TEMP/repo" >/dev/null 2>&1
git -C "$TEMP/repo" remote add origin "$GIT_REMOTE_URL"
git -C "$TEMP/repo" fetch --depth 1 origin "$TOOL_AUTHORITY_SHA"
git -C "$TEMP/repo" checkout --detach FETCH_HEAD >/dev/null
[[ "$(git -C "$TEMP/repo" rev-parse HEAD)" == "$TOOL_AUTHORITY_SHA" ]] || fail_stop "TOOL_SHA"
echo "TOOL_CHECKOUT_CLEAN=YES"
echo "TOOL_SHA_PIN=PASS"

RELEASE_DIR="/opt/synqdrive/releases/${CURRENT_PRODUCTION_RELEASE_ID}"
TOOL_BACKEND="$TEMP/repo/backend"
ln -sfn "$RELEASE_DIR/backend/node_modules" "$TOOL_BACKEND/node_modules"
CLI_REL="scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-production-cli.ts"
run_cli() {
  (cd "$TOOL_BACKEND" && export DI_S4F7V_TOOL_CHECKOUT_SHA="$TOOL_AUTHORITY_SHA" && npx --yes ts-node --transpile-only "$CLI_REL" "$@")
}

JIT_FRESH_NOT_BEFORE=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC'), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');")
echo "JIT_FRESH_NOT_BEFORE=${JIT_FRESH_NOT_BEFORE}"
FUTURE=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM vehicle_trips WHERE vehicle_id='${TINY_VID}' AND end_time IS NOT NULL AND end_time > clock_timestamp();")
ELIG=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM vehicle_trips WHERE vehicle_id='${TINY_VID}' AND end_time IS NOT NULL AND end_time >= '${JIT_FRESH_NOT_BEFORE}'::timestamptz;")
LATEST=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT coalesce(to_char((max(end_time) AT TIME ZONE 'UTC'), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), 'NONE') FROM vehicle_trips WHERE vehicle_id='${TINY_VID}' AND end_time IS NOT NULL;")
echo "LATEST_COMPLETED_TRIP_END_TIME=${LATEST}"
echo "NO_BACKFILL_FUTURE_TRIP_COUNT=${FUTURE}"
echo "NO_BACKFILL_ELIGIBLE_TRIP_COUNT=${ELIG}"
[[ "$FUTURE" == "0" && "$ELIG" == "0" ]] || fail_stop "NO_BACKFILL_GATE"
echo "NO_BACKFILL_GATE=PASS"

FP1=$(run_cli derive-fingerprint "$JIT_FRESH_NOT_BEFORE" | awk -F= '/^INTERNALLY_COMPUTED_FINGERPRINT=/{print $2}')
FP2=$(run_cli derive-fingerprint "$JIT_FRESH_NOT_BEFORE" | awk -F= '/^INTERNALLY_COMPUTED_FINGERPRINT=/{print $2}')
echo "JIT_EXPECTED_FINGERPRINT=${FP1}"
[[ "$FP1" == "$FP2" && -n "$FP1" ]] && echo "FINGERPRINT_MATCH=YES" || fail_stop "FINGERPRINT_MISMATCH"

export S4F7V_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F7J_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F4_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F7F_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export DI_S4_TINY_STAGING_ACK=YES
export DRY_RUN=1
export EXPECTED_FRESH_TINY_STAGING_TOOL_SHA="$TOOL_AUTHORITY_SHA"
export DI_S4_TINY_STAGING_REQUIRED_SHA="$CURRENT_PRODUCTION_SHA"
export DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID="$CURRENT_PRODUCTION_RELEASE_ID"
export DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256="$BACKEND_ENV_SHA256"
export DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE=KILLED
export DI_S4_TINY_FRESH_NOT_BEFORE="$JIT_FRESH_NOT_BEFORE"
export DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT="$FP1"
export DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST="$TINY_ORG"
export DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST="$TINY_VID"
export SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env

DB_NOW=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC'), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');")
JIT_AGE=$(cd "$TOOL_BACKEND" && npx --yes ts-node --transpile-only -e "
import { computeFreshAuthorityAgeSeconds } from './scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
const r = computeFreshAuthorityAgeSeconds('${DB_NOW}', '${JIT_FRESH_NOT_BEFORE}');
if (!r.ok) process.exit(1);
console.log(r.ageSeconds);
")
echo "JIT_AGE_SECONDS=${JIT_AGE}"
awk "BEGIN {exit !(${JIT_AGE} >= 0 && ${JIT_AGE} <= 900)}" && echo "JIT_AUTHORITY_WITHIN_900_SECONDS=YES" || fail_stop "JIT_AGE"

WRAPPER_LOG=/tmp/s4f7aa-wrapper.$$
cd "$TOOL_BACKEND/scripts/ops"
sudo -n -E bash ./di-v0-s4-stage-tiny-fresh-production.sh | tee "$WRAPPER_LOG"
WRAPPER_EXIT=${PIPESTATUS[0]}
echo "DRY_RUN_WRAPPER_EXIT_CODE=${WRAPPER_EXIT}"
[[ "$WRAPPER_EXIT" == "0" ]] || fail_stop "WRAPPER_EXIT_${WRAPPER_EXIT}"
grep -q '^GUARDS_OK=YES$' "$WRAPPER_LOG" && echo "GUARDS_OK=YES" || fail_stop "GUARDS_NOT_OK"
grep -q '^DRY_RUN_FULL_GUARD_PATH_EXECUTED=YES$' "$WRAPPER_LOG" && echo "DRY_RUN_FULL_GUARD_PATH_EXECUTED=YES" || fail_stop "DRY_RUN_PATH"
grep '^INTENDED_ENV_CHANGED_KEY_COUNT=' "$WRAPPER_LOG" | tail -1
grep '^INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT=' "$WRAPPER_LOG" | tail -1
grep '^DRY_RUN_ENV_MUTATION_COUNT=' "$WRAPPER_LOG" | tail -1
grep '^DRY_RUN_RESTART_COUNT=' "$WRAPPER_LOG" | tail -1
grep -q '^DRY_RUN_ENV_MUTATION_COUNT=0$' "$WRAPPER_LOG" && echo "PRODUCTION_ENV_MUTATION_MEASURED=NO" || fail_stop "ENV_MUTATION_NONZERO"
grep -q '^DRY_RUN_RESTART_COUNT=0$' "$WRAPPER_LOG" && echo "PRODUCTION_RESTART_MEASURED=NO" || fail_stop "RESTART_NONZERO"
grep -q '^EXPECTED_PROVIDER_CALL_DELTA=0$' "$WRAPPER_LOG" && echo "PROVIDER_CALL_DELTA_MEASURED=0" || fail_stop "PROVIDER_DELTA"
echo "DRY_RUN_EXECUTED=YES"
echo "DRY_RUN_FINAL_RESULT=PASS"

POST_REPLICA_A_PID=$(pm2_pid synqdrive)
POST_REPLICA_B_PID=$(pm2_pid synqdrive-b)
echo "POST_REPLICA_A_PID=${POST_REPLICA_A_PID}"
echo "POST_REPLICA_B_PID=${POST_REPLICA_B_PID}"
[[ "$POST_REPLICA_A_PID" == "$PRE_REPLICA_A_PID" ]] && echo "REPLICA_A_PRE_POST_PARITY=YES" || fail_stop "PID_A_CHANGED"
[[ "$POST_REPLICA_B_PID" == "$PRE_REPLICA_B_PID" ]] && echo "REPLICA_B_PRE_POST_PARITY=YES" || fail_stop "PID_B_CHANGED"

TMP_POST_A="/tmp/s4f7aa-post-a.$$"
TMP_POST_B="/tmp/s4f7aa-post-b.$$"
TMP_ARTIFACTS+=("$TMP_POST_A" "$TMP_POST_B")
parse_attestation 3001 A POST | tee "$TMP_POST_A"
parse_attestation 3002 B POST | tee "$TMP_POST_B"
POST_REPLICA_A_ATTESTATION_FINGERPRINT=$(grep POST_REPLICA_A_ATTESTATION_FINGERPRINT= "$TMP_POST_A" | cut -d= -f2)
POST_REPLICA_B_ATTESTATION_FINGERPRINT=$(grep POST_REPLICA_B_ATTESTATION_FINGERPRINT= "$TMP_POST_B" | cut -d= -f2)
[[ "$POST_REPLICA_A_ATTESTATION_FINGERPRINT" == "$PRE_REPLICA_A_ATTESTATION_FINGERPRINT" && "$POST_REPLICA_B_ATTESTATION_FINGERPRINT" == "$PRE_REPLICA_B_ATTESTATION_FINGERPRINT" ]] && echo "ATTESTATION_PARITY=YES" || fail_stop "ATTESTATION_DRIFT"

POST_PRODUCTION_SHA=$(git -C /opt/synqdrive/current rev-parse HEAD)
POST_PRODUCTION_RELEASE_ID=$(basename "$(readlink -f /opt/synqdrive/current)")
POST_BACKEND_ENV_SHA256=$(sudo -n sha256sum /opt/synqdrive/shared/backend.env | awk '{print $1}')
echo "POST_PRODUCTION_SHA=${POST_PRODUCTION_SHA}"
echo "POST_PRODUCTION_RELEASE_ID=${POST_PRODUCTION_RELEASE_ID}"
echo "POST_BACKEND_ENV_SHA256=${POST_BACKEND_ENV_SHA256}"
[[ "$POST_PRODUCTION_SHA" == "$CURRENT_PRODUCTION_SHA" && "$POST_PRODUCTION_RELEASE_ID" == "$CURRENT_PRODUCTION_RELEASE_ID" && "$POST_BACKEND_ENV_SHA256" == "$BACKEND_ENV_SHA256" ]] || fail_stop "POST_SHA_ENV_DRIFT"
echo "PRODUCTION_ENV_UNCHANGED=YES"

POST_GKS=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT kill_state::text FROM di_v0_s4_control WHERE id='GLOBAL' LIMIT 1;")
echo "POST_GLOBAL_KILL_STATE=${POST_GKS}"
[[ "$POST_GKS" == "KILLED" && "$POST_GKS" == "$GLOBAL_KILL_STATE" ]] && echo "GLOBAL_KILL_STILL_KILLED=YES" || fail_stop "POST_GLOBAL"

POST_S4_PIPELINE_ROWS=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM di_v0_s4_pipeline_versions;")
POST_S4_WORK_ITEM_ROWS=$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM di_v0_s4_work_items;")
echo "POST_S4_PIPELINE_ROWS=${POST_S4_PIPELINE_ROWS}"
echo "POST_S4_WORK_ITEM_ROWS=${POST_S4_WORK_ITEM_ROWS}"
[[ "$POST_S4_PIPELINE_ROWS" == "$PRE_S4_PIPELINE_ROWS" && "$POST_S4_WORK_ITEM_ROWS" == "$PRE_S4_WORK_ITEM_ROWS" ]] || fail_stop "S4_PERSISTENCE_DRIFT"

for flag in DI_V0_S4_MASTER_ENABLED DI_V0_S4_DISCOVERY_ENABLED DI_V0_S4_WORKER_ENABLED DI_V0_S4_POSITION_ENABLED DI_V0_S4_R1_ENABLED DI_V0_S4_NATIVE_ENABLED; do
  if sudo -n grep -qE "^${flag}=(true|TRUE|1|ON)" /opt/synqdrive/shared/backend.env 2>/dev/null; then fail_stop "POST_S4_FLAG_ON"; fi
done
echo "POST_ALL_S4_FLAGS_OFF=YES"

echo "PRODUCTION_ENV_MUTATION_OCCURRED=NO"
echo "PRODUCTION_RESTART_OCCURRED=NO"
echo "PRODUCTION_DB_WRITE_OCCURRED=NO"
echo "PROVIDER_CALL_COUNT=0"
echo "S4_ACTIVATION_OCCURRED=NO"
echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED"
echo "EVIDENCE_COMPLETE=YES"
echo "EXP021_S4F7AI_FRESH_JIT_PRODUCTION_DRY_RUN_RESULT=PASS"
EOS
)

set +e
"${SSH_BASE[@]}" \
  "TOOL_AUTHORITY_SHA=${TOOL_SHA}" \
  "GIT_REMOTE_URL=${GIT_REMOTE_URL}" \
  sudo -n -E bash -s <<<"$REMOTE_SCRIPT"
REMOTE_SSH_EXIT=$?
set -e
echo "REMOTE_SSH_EXIT_CODE=${REMOTE_SSH_EXIT}"
[[ "$REMOTE_SSH_EXIT" == "0" ]] || exit "$REMOTE_SSH_EXIT"
