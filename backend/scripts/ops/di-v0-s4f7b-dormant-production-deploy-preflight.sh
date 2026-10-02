#!/usr/bin/env bash
# EXP-021 S4F-7B — read-only dormant S4 Production deploy preflight.
# Does NOT deploy, mutate env, restart PM2, run migrations, or write Production DB.
set -euo pipefail

TARGET_SHA="${DI_S4F7B_TARGET_DEPLOY_SHA:-ee9588548845c8077aa0cba0684b06eac7c9d4d2}"
BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

ENV_READ=(cat)
if [[ ! -r "$BACKEND_ENV" ]]; then
  if sudo -n test -r "$BACKEND_ENV" 2>/dev/null; then
    ENV_READ=(sudo -n cat)
  fi
fi

release_dir="$(vps_replica_current_release_dir)"
prod_sha="$(vps_replica_current_sha)"
release_id="$(basename "$release_dir" 2>/dev/null || echo UNKNOWN)"

health_a=FAIL
health_b=FAIL
vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_A_PORT}" && health_a=OK || true
vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_B_PORT}" && health_b=OK || true

leader_count="$(vps_replica_count_scheduler_leaders)"
scheduler_single=NO
[[ "$leader_count" == "1" ]] && scheduler_single=YES

nginx_dual=NO
vps_replica_nginx_dual_upstream_ok 2>/dev/null && nginx_dual=YES || true

env_sha=UNREADABLE
if "${ENV_READ[@]}" "$BACKEND_ENV" >/dev/null 2>&1; then
  env_sha="$(sudo -n sha256sum "$BACKEND_ENV" 2>/dev/null | awk '{print $1}' || sha256sum "$BACKEND_ENV" | awk '{print $1}')"
fi

classify_flag() {
  local key=$1
  local line
  line="$("${ENV_READ[@]}" "$BACKEND_ENV" 2>/dev/null | grep -E "^${key}=" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    echo "${key}=MISSING"
    return
  fi
  local val
  val="$(echo "$line" | cut -d= -f2- | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$val" in true | 1 | yes | on) echo "${key}=TRUTHY" ;; false | 0 | no | off | "") echo "${key}=FALSE_OR_EMPTY" ;; *) echo "${key}=SET" ;; esac
}

redis_reachable=NO
rh="$("${ENV_READ[@]}" "$BACKEND_ENV" 2>/dev/null | grep -E '^REDIS_HOST=' | tail -1 | cut -d= -f2- || echo localhost)"
rp="$("${ENV_READ[@]}" "$BACKEND_ENV" 2>/dev/null | grep -E '^REDIS_PORT=' | tail -1 | cut -d= -f2- || echo 6379)"
if redis-cli -h "${rh:-localhost}" -p "${rp:-6379}" ping 2>/dev/null | grep -q PONG; then
  redis_reachable=YES
fi

s4_runtime_on_release=NO
if [[ -d "${release_dir}/backend/src/modules/vehicle-intelligence/driving-intelligence/s4-runtime" ]]; then
  s4_runtime_on_release=YES
fi

cat <<EOF
EXP021_S4F7B_VPS_READONLY_SNAPSHOT
TARGET_DEPLOY_SHA=${TARGET_SHA}
CURRENT_PRODUCTION_SHA=${prod_sha}
CURRENT_PRODUCTION_RELEASE_ID=${release_id}
REPLICA_A_HEALTH=${health_a}
REPLICA_B_HEALTH=${health_b}
SCHEDULER_SINGLE_LEADER=${scheduler_single}
SCHEDULER_LEADER_COUNT=${leader_count}
NGINX_DUAL_UPSTREAM=${nginx_dual}
PRODUCTION_BACKEND_ENV_SHA256=${env_sha}
$(classify_flag DIMO_GLOBAL_BUDGET_ENABLED)
$(classify_flag DI_V0_S4_MASTER_ENABLED)
$(classify_flag DI_V0_S4_DISCOVERY_ENABLED)
$(classify_flag DI_V0_S4_WORKER_ENABLED)
$(classify_flag DI_V0_S4_POSITION_ENABLED)
$(classify_flag DI_V0_S4_R1_ENABLED)
$(classify_flag DI_V0_S4_NATIVE_ENABLED)
REDIS_REACHABLE=${redis_reachable}
S4_RUNTIME_DIR_ON_CURRENT_RELEASE=${s4_runtime_on_release}
EOF

if sudo -n -u postgres psql -d synqdrive -At -c "SELECT 1" >/dev/null 2>&1; then
  sudo -n -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT 'GLOBAL_ROW_COUNT=' || COUNT(*)::text FROM di_v0_s4_control WHERE id='GLOBAL';
SELECT 'PIPELINE_VERSION_ROWS=' || COUNT(*)::text FROM di_v0_s4_pipeline_versions;
SELECT 'WORK_ITEM_ROWS=' || COUNT(*)::text FROM di_v0_s4_work_items;
SELECT 'EVIDENCE_SNAPSHOT_ROWS=' || COUNT(*)::text FROM di_v0_s4_evidence_snapshots;
SELECT 'ACTIVE_INCOMPLETE_MIGRATIONS=' || COUNT(*)::text FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
SQL
fi
