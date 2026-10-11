#!/usr/bin/env bash
# R2.6 — Version-controlled VO5C joint deploy orchestrator variant (webhook-safe Phase 1).
# NOT applied on production VPS. Reference integration aligned with read-only prod script at:
#   /opt/synqdrive/shared/deploy-state/vo5c-joint-deploy-orchestrate.sh
#
# Diff vs prod: Phase 1 uses vo5c_emit_webhook_safe_maintenance_site instead of global 503-only site.
# Phase 1 public check: GET / → 503; webhook path fail-closed via upstream health (no fake 200).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$SCRIPT_DIR/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

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
echo "=== VO5C JOINT DEPLOY ORCHESTRATOR (WEBHOOK-SAFE) START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

fail() {
  echo "!! ORCHESTRATOR_ABORT: $*"
  {
    echo "PRODUCTION_RELEASE_VERDICT=BLOCKED"
    echo "CRITICAL_ERRORS=$*"
  } >>"$RESULT"
  exit 1
}

restore_nginx_on_error() {
  if [[ -f "$NGINX_BACKUP" ]]; then
    cp -a "$NGINX_BACKUP" "$NGINX_SITE"
    nginx -t && systemctl reload nginx || true
    echo "PUBLIC_TRAFFIC_RESTORED=YES_AFTER_ABORT" >>"$RESULT"
  fi
}

record() { echo "$1" >>"$RESULT"; }

: >"$RESULT"
record "ORCHESTRATOR_VARIANT=WEBHOOK_SAFE_R26"
record "AUTHORIZED_SHA=${AUTHORIZED_SHA}"

# -------- PHASE 0 (unchanged semantics) --------
PROD_SHA="$(git -C /opt/synqdrive/current rev-parse HEAD)"
STAGE_SHA="$(git -C "$STAGED" rev-parse HEAD)"
[[ -n "$EXPECTED_OLD" ]] && [[ "$PROD_SHA" == "$EXPECTED_OLD" ]] || fail "production_sha_mismatch got=${PROD_SHA}"
[[ -n "$AUTHORIZED_SHA" ]] && [[ "$STAGE_SHA" == "$AUTHORIZED_SHA" ]] || fail "staged_sha_mismatch got=${STAGE_SHA}"
curl -fsS -m 5 http://127.0.0.1:3001/api/v1/health >/dev/null || fail "replica_a_health_pre"
curl -fsS -m 5 http://127.0.0.1:3002/api/v1/health >/dev/null || fail "replica_b_health_pre"
if ps aux | grep -E 'vps-deploy|vo5c-run-pinned|prisma migrate deploy' | grep -v grep >/dev/null; then
  fail "parallel_deploy_detected"
fi
record "PRE_DEPLOY_PRODUCTION_SHA=${PROD_SHA}"
record "PHASE0=PASS"

# -------- PHASE 1 maintenance (webhook-safe) --------
cp -a "$NGINX_SITE" "$NGINX_BACKUP"
{
  vo5c_emit_webhook_safe_maintenance_site synqdrive_backend "$WEBHOOK_PATH"
  cat <<'NGINX_HTTP'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name app.synqdrive.eu srv1374778.hstgr.cloud _;
    return 301 https://app.synqdrive.eu$request_uri;
}
NGINX_HTTP
} >"$NGINX_SITE"

vo5c_validate_webhook_safe_site "$NGINX_SITE" "$WEBHOOK_PATH" || fail "webhook_safe_site_validation_failed"
/usr/sbin/nginx -t || { restore_nginx_on_error; fail "nginx_test_maintenance_failed"; }
systemctl reload nginx
record "MAINTENANCE_ACTIVATED=WEBHOOK_SAFE"

ROOT_CODE="$(curl -fsS -m 10 -o /dev/null -w '%{http_code}' https://app.synqdrive.eu/ || echo '000')"
record "PUBLIC_ROOT_HTTP=${ROOT_CODE}"
[[ "$ROOT_CODE" == "503" ]] || record "PUBLIC_TRAFFIC_ISOLATED=WARN_CHECK_MANUALLY"

# Edge webhook routing (local nginx only — does not call DIMO provider APIs)
WH_CODE="$(curl -fsS -m 10 -o /dev/null -w '%{http_code}' -X POST --resolve "app.synqdrive.eu:443:127.0.0.1" \
  "https://app.synqdrive.eu${WEBHOOK_PATH}" -d '{}' || echo '000')"
record "WEBHOOK_EDGE_HTTP=${WH_CODE}"
if curl -fsS -m 5 http://127.0.0.1:3001/api/v1/health >/dev/null || curl -fsS -m 5 http://127.0.0.1:3002/api/v1/health >/dev/null; then
  [[ "$WH_CODE" =~ ^2 ]] || record "WEBHOOK_DURING_MAINTENANCE=WARN_EXPECT_2XX_IF_UPSTREAM_HEALTHY"
else
  [[ "$WH_CODE" != "200" ]] || fail "webhook_fake_200_with_no_healthy_upstream"
fi
record "PHASE1=PASS"

# Phases 2–6: invoke same pinned executor / deploy runner contract as production orchestrator.
# (See production file lines 94–204; this variant does not duplicate deploy logic — wire on VPS rollout.)
record "PHASE2_THROUGH_6=USE_PRODUCTION_ORCHESTRATOR_TAIL"
echo "=== WEBHOOK-SAFE PHASE1 COMPLETE — deploy phases require pinned executor checkout ==="
