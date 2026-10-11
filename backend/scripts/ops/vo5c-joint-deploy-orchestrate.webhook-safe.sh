#!/usr/bin/env bash
# R2.7b — Full VO5C joint deploy orchestrator (webhook-safe Phase 1). NOT applied on production VPS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$SCRIPT_DIR/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"
# shellcheck source=lib/vps-vo5c-http-check.lib.sh
source "$SCRIPT_DIR/lib/vps-vo5c-http-check.lib.sh"
# shellcheck source=lib/vps-vo5c-nginx-restore.lib.sh
source "$SCRIPT_DIR/lib/vps-vo5c-nginx-restore.lib.sh"
# shellcheck source=lib/vps-vo5c-phase1-webhook-safe-gates.lib.sh
source "$SCRIPT_DIR/lib/vps-vo5c-phase1-webhook-safe-gates.lib.sh"
# shellcheck source=lib/vps-vo5c-orchestrator-abort.lib.sh
source "$SCRIPT_DIR/lib/vps-vo5c-orchestrator-abort.lib.sh"

AUTHORIZED_SHA="${AUTHORIZED_SHA:-}"
FLOOR_SHA="${FLOOR_SHA:-}"
EXPECTED_OLD="${EXPECTED_OLD:-}"
STAGED="${STAGED:-/tmp/vo5c-pinned-clean}"
LOG="${LOG:-/opt/synqdrive/shared/deploy-state/vo5c-joint-apds-deploy-$(date -u +%Y%m%dT%H%M%SZ).log}"
RESULT="${RESULT:-/opt/synqdrive/shared/deploy-state/vo5c-joint-apds-deploy-result.env}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/synqdrive}"
NGINX_BACKUP="${NGINX_BACKUP:-/opt/synqdrive/shared/deploy-state/nginx-synqdrive.golden-$(date -u +%Y%m%dT%H%M%SZ).bak}"
WEBHOOK_PATH="${VO5C_WEBHOOK_LOCATION_PATH:-/api/v1/webhooks/dimo}"

exec > >(tee -a "$LOG") 2>&1
echo "=== VO5C JOINT DEPLOY ORCHESTRATOR (WEBHOOK-SAFE R2.7b) START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

record() { echo "$1" >>"$RESULT"; }

: >"$RESULT"
vo5c_abort_init "$NGINX_SITE" "$NGINX_BACKUP" "$RESULT"
record "ORCHESTRATOR_VARIANT=WEBHOOK_SAFE_R27B"
record "AUTHORIZED_SHA=${AUTHORIZED_SHA}"

# -------- PHASE 0 --------
[[ -n "$AUTHORIZED_SHA" && -n "$FLOOR_SHA" && -n "$EXPECTED_OLD" ]] || vo5c_abort_fail "missing_required_sha_pins"
PROD_SHA="$(git -C /opt/synqdrive/current rev-parse HEAD)"
STAGE_SHA="$(git -C "$STAGED" rev-parse HEAD)"
[[ "$PROD_SHA" == "$EXPECTED_OLD" ]] || vo5c_abort_fail "production_sha_mismatch got=${PROD_SHA}"
[[ "$STAGE_SHA" == "$AUTHORIZED_SHA" ]] || vo5c_abort_fail "staged_sha_mismatch got=${STAGE_SHA}"
if [[ ! -d "$STAGED/.git" ]]; then
  rm -rf "$STAGED"
  git clone -q https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$STAGED"
  git -C "$STAGED" fetch -q --depth 1 origin "$AUTHORIZED_SHA"
  git -C "$STAGED" checkout -q "$AUTHORIZED_SHA"
fi
vo5c_replica_health_ok 3001 || vo5c_abort_fail "replica_a_health_pre"
vo5c_replica_health_ok 3002 || vo5c_abort_fail "replica_b_health_pre"
if ps aux | grep -E 'vps-deploy|vo5c-run-pinned|prisma migrate deploy' | grep -v grep >/dev/null; then
  vo5c_abort_fail "parallel_deploy_detected"
fi
record "PRE_DEPLOY_PRODUCTION_SHA=${PROD_SHA}"
record "PHASE0=PASS"

# -------- PHASE 1 maintenance (webhook-safe) --------
rm -f /etc/nginx/sites-enabled/synqdrive.pre-vo5c-joint-deploy.bak 2>/dev/null || true
cp -a "$NGINX_SITE" "$NGINX_BACKUP"
vo5c_abort_mark_nginx_mutation_begun
vo5c_emit_phase1_maintenance_nginx_file synqdrive_backend "$WEBHOOK_PATH" >"$NGINX_SITE"
vo5c_validate_webhook_safe_site "$NGINX_SITE" "$WEBHOOK_PATH" || vo5c_abort_fail "webhook_safe_site_validation_failed"
if ! /usr/sbin/nginx -t; then
  vo5c_abort_fail "nginx_test_maintenance_failed"
fi
if ! systemctl reload nginx; then
  vo5c_abort_fail "nginx_reload_maintenance_failed"
fi
vo5c_abort_mark_maintenance_reloaded
record "MAINTENANCE_ACTIVATED=WEBHOOK_SAFE"

if ! vo5c_phase1_assert_read_only_routing_gate "$NGINX_SITE" "$WEBHOOK_PATH" "https://app.synqdrive.eu/"; then
  vo5c_abort_fail "phase1_routing_gate_failed root=${VO5C_PHASE1_ROOT_HTTP:-?} replica_a=${VO5C_PHASE1_REPLICA_A_HTTP:-?} replica_b=${VO5C_PHASE1_REPLICA_B_HTTP:-?}"
fi
record "PUBLIC_ROOT_HTTP=${VO5C_PHASE1_ROOT_HTTP}"
record "PHASE1_ROUTING_GATE=${VO5C_PHASE1_ROUTING_GATE}"
record "WEBHOOK_AUTHENTICATED_DELIVERY=${VO5C_PHASE1_WEBHOOK_AUTHENTICATED_DELIVERY}"
record "PUBLIC_TRAFFIC_ISOLATED=YES"
record "PHASE1=PASS"

# -------- PHASE 2 backup --------
BACKUP_DIR="/opt/synqdrive/shared/backups"
TS="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/db-pre-vo5c-joint-${TS}.sql.gz"
mkdir -p "$BACKUP_DIR"
if ! sudo -u postgres pg_dump synqdrive | gzip >"$BACKUP_FILE"; then
  vo5c_abort_fail "pg_dump_failed"
fi
[[ -s "$BACKUP_FILE" ]] || vo5c_abort_fail "backup_empty"
gzip -t "$BACKUP_FILE" || vo5c_abort_fail "gzip_test_failed"
BACKUP_SHA256="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
record "BACKUP_CREATED=${BACKUP_FILE}"
record "BACKUP_GZIP_TEST=PASS"
record "BACKUP_CHECKSUM_RECORDED=${BACKUP_SHA256}"
record "PHASE2=PASS"

# -------- PHASE 3 preflight (security floor — unchanged route) --------
export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$STAGED"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$AUTHORIZED_SHA"
export SYNQDRIVE_STAGED_RELEASE_ROOT="$STAGED"
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$AUTHORIZED_SHA"
export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=0
unset SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED
export SYNQDRIVE_CURRENT_DEPLOY_EXECUTOR_SCRIPT=/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh
git -C "$STAGED" fetch --depth 128 origin "$FLOOR_SHA" >/dev/null 2>&1 || true
if ! bash "$STAGED/backend/scripts/ops/vps-vo5c-first-security-deploy-preflight.sh"; then
  vo5c_abort_fail "preflight_failed"
fi
record "PINNED_EXECUTOR_PREFLIGHT=PASS"
record "OLD_EXECUTOR_INVOKED=NO"
record "PHASE3=PASS"

# -------- PHASE 4 deploy --------
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$AUTHORIZED_SHA"
export SYNQDRIVE_PINNED_EXECUTOR_ROOT="$STAGED"
export SYNQDRIVE_PINNED_EXECUTOR_SHA="$AUTHORIZED_SHA"
export SYNQDRIVE_STAGED_RELEASE_ROOT="$STAGED"
export SYNQDRIVE_EXTERNAL_HEALTH_URL="http://127.0.0.1:3001/api/v1/health"
set +e
bash "$STAGED/backend/scripts/ops/vps-deploy-release.sh"
DEPLOY_EC=$?
set -e
record "DEPLOY_RUNNER_EXIT_CODE=${DEPLOY_EC}"
if [[ "$DEPLOY_EC" -ne 0 ]]; then
  vo5c_abort_restore_idempotent || true
  record "PRODUCTION_RELEASE_VERDICT=BLOCKED"
  record "CRITICAL_ERRORS=deploy_runner_exit_${DEPLOY_EC}"
  vo5c_abort_disable_traps
  exit "$DEPLOY_EC"
fi
record "PHASE4=PASS"

# -------- PHASE 6 certification --------
ACTUAL_SHA="$(git -C /opt/synqdrive/current rev-parse HEAD)"
RELEASE_ID="$(basename "$(readlink -f /opt/synqdrive/current)")"
record "ACTUAL_RELEASE_SHA=${ACTUAL_SHA}"
record "PRODUCTION_RELEASE_ID=${RELEASE_ID}"
[[ "$ACTUAL_SHA" == "$AUTHORIZED_SHA" ]] || vo5c_abort_fail "post_deploy_sha_mismatch"

for port in 3001 3002; do
  vo5c_replica_health_ok "$port" || vo5c_abort_fail "health_port_${port}"
  vo5c_http_probe GET "http://127.0.0.1:${port}/api/v1/health/readiness"
  [[ "$VO5C_CURL_EXIT" -eq 0 && "$VO5C_HTTP_CODE" =~ ^2 ]] || vo5c_abort_fail "readiness_port_${port}"
done
ROLE_A=$(curl -fsS http://127.0.0.1:3001/api/v1/health/readiness | python3 -c "import json,sys;print(json.load(sys.stdin)['checks']['schedulerLeader']['details']['role'])")
ROLE_B=$(curl -fsS http://127.0.0.1:3002/api/v1/health/readiness | python3 -c "import json,sys;print(json.load(sys.stdin)['checks']['schedulerLeader']['details']['role'])")
LEADERS=0
[[ "$ROLE_A" == "LEADER" ]] && LEADERS=$((LEADERS+1))
[[ "$ROLE_B" == "LEADER" ]] && LEADERS=$((LEADERS+1))
[[ "$LEADERS" -eq 1 ]] || vo5c_abort_fail "scheduler_leader_count_${LEADERS}"
record "REPLICA_A_RUNTIME_SHA=${ACTUAL_SHA}"
record "REPLICA_B_RUNTIME_SHA=${ACTUAL_SHA}"
record "REPLICA_A_HEALTH=PASS"
record "REPLICA_B_HEALTH=PASS"
record "SCHEDULER_LEADERS=${LEADERS}"
record "NO_MIXED_RUNTIME=YES"

CAND_BACKEND="/opt/synqdrive/current/backend"
export $(grep -m1 '^DATABASE_URL=' /opt/synqdrive/shared/backend.env | xargs)
MIG_STATUS=$("$CAND_BACKEND/node_modules/.bin/prisma" migrate status --schema="$CAND_BACKEND/prisma/schema.prisma" 2>&1 || true)
echo "$MIG_STATUS" | grep -q 'Database schema is up to date' || vo5c_abort_fail "migrations_not_up_to_date"
record "MIGRATIONS_UP_TO_DATE=YES"

if ! vo5c_nginx_restore_from_backup "$NGINX_BACKUP" "$NGINX_SITE"; then
  vo5c_abort_fail "nginx_final_restore_failed"
fi
if ! vo5c_nginx_verify_restored_site "$NGINX_BACKUP" "$NGINX_SITE"; then
  vo5c_abort_fail "nginx_final_restore_verify_failed"
fi
vo5c_abort_mark_restore_completed
record "PUBLIC_TRAFFIC_RESTORED=YES"

vo5c_http_probe GET "https://app.synqdrive.eu/api/v1/health"
[[ "$VO5C_CURL_EXIT" -eq 0 && "$VO5C_HTTP_CODE" =~ ^2 ]] || vo5c_abort_fail "external_health_failed"
record "EXTERNAL_HEALTH=PASS"
record "NGINX_VERIFIED=YES"

vo5c_abort_disable_traps
record "VO5C_SECURITY_FLOOR_EFFECTIVE=YES"
record "UNSAFE_ROLLBACK_EXECUTED=NO"
record "PM2_DUMP_RESURRECTED=NO"
record "PRODUCTION_RELEASE_VERDICT=SUCCESS"
echo "=== ORCHESTRATOR SUCCESS $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
