#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$ROOT/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

TMP="$(mktemp)"
vo5c_emit_webhook_safe_maintenance_site synqdrive_backend /api/v1/webhooks/dimo > "$TMP"
vo5c_validate_webhook_safe_site "$TMP" /api/v1/webhooks/dimo

# Injection rejection
if vo5c_emit_webhook_safe_maintenance_site 'bad-upstream!' 2>/dev/null; then
  echo "FAIL upstream injection"
  exit 1
fi
if vo5c_emit_webhook_safe_maintenance_site synqdrive_backend $'/api/evil\n' 2>/dev/null; then
  echo "FAIL path injection"
  exit 1
fi

grep -q 'location = /api/v1/webhooks/dimo' "$TMP"
grep -q 'max_fails=2' "$TMP"
grep -q 'proxy_set_header X-Forwarded-Proto' "$TMP"
PHASE="$(mktemp)"
vo5c_emit_phase1_maintenance_nginx_file synqdrive_backend /api/v1/webhooks/dimo >"$PHASE"
vo5c_validate_webhook_safe_site "$PHASE" /api/v1/webhooks/dimo
rm -f "$PHASE"
rm -f "$TMP"
echo "PASS webhook-safe maintenance selftest"
