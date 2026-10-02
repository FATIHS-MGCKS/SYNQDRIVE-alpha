#!/usr/bin/env bash
# EXP-021 S4F-7C — read-only exact-SHA dormant deploy authorization gate snapshot.
# Does NOT deploy or mutate Production.
set -euo pipefail

FROZEN_TARGET_SHA="${DI_S4F7C_AUTHORIZED_DORMANT_DEPLOY_TARGET_SHA:-ee9588548845c8077aa0cba0684b06eac7c9d4d2}"
S4F7B_ENV_SHA256="${DI_S4F7B_BACKEND_ENV_SHA256:-6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7}"
S4F7B_PROD_SHA="${DI_S4F7B_PRODUCTION_SHA:-8fa531b275bc4dca02c09b279c0d2b806e544007}"
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

prod_sha="$(vps_replica_current_sha)"
release_id="$(basename "$(vps_replica_current_release_dir)")"
env_sha="$(sudo -n sha256sum "$BACKEND_ENV" 2>/dev/null | awk '{print $1}' || sha256sum "$BACKEND_ENV" | awk '{print $1}')"

health_a=FAIL; health_b=FAIL
vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_A_PORT}" && health_a=OK || true
vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_B_PORT}" && health_b=OK || true

pid_a="$(sudo -n pm2 pid "${SYNQDRIVE_REPLICA_A_PM2_NAME}" 2>/dev/null || echo "")"
pid_b="$(sudo -n pm2 pid "${SYNQDRIVE_REPLICA_B_PM2_NAME}" 2>/dev/null || echo "")"
up_a="$(vps_replica_pm2_uptime_sec "${SYNQDRIVE_REPLICA_A_PM2_NAME}" 2>/dev/null || echo -1)"
up_b="$(vps_replica_pm2_uptime_sec "${SYNQDRIVE_REPLICA_B_PM2_NAME}" 2>/dev/null || echo -1)"

prod_unchanged=NO
[[ "$prod_sha" == "$S4F7B_PROD_SHA" ]] && prod_unchanged=YES
env_match=NO
[[ "$env_sha" == "$S4F7B_ENV_SHA256" ]] && env_match=YES

cat <<EOF
EXP021_S4F7C_READONLY_SNAPSHOT
AUTHORIZED_DORMANT_DEPLOY_TARGET_SHA=${FROZEN_TARGET_SHA}
CURRENT_PRODUCTION_SHA=${prod_sha}
CURRENT_PRODUCTION_RELEASE_ID=${release_id}
PRODUCTION_SHA_UNCHANGED_SINCE_S4F7B=${prod_unchanged}
PRE_REPLICA_A_SHA=${prod_sha}
PRE_REPLICA_B_SHA=${prod_sha}
REPLICA_A_HEALTH=${health_a}
REPLICA_B_HEALTH=${health_b}
PRE_REPLICA_A_PID=${pid_a:-UNKNOWN}
PRE_REPLICA_B_PID=${pid_b:-UNKNOWN}
PRE_REPLICA_A_UPTIME_SEC=${up_a}
PRE_REPLICA_B_UPTIME_SEC=${up_b}
PRE_BACKEND_ENV_SHA256=${env_sha}
BACKEND_ENV_MATCHES_S4F7B_SNAPSHOT=${env_match}
SCHEDULER_SINGLE_LEADER=$( [[ "$(vps_replica_count_scheduler_leaders)" == "1" ]] && echo YES || echo NO )
NGINX_DUAL_UPSTREAM=$( vps_replica_nginx_dual_upstream_ok 2>/dev/null && echo YES || echo NO )
EOF
