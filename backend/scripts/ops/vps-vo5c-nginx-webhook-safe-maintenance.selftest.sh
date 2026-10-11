#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$ROOT/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

TMP="$(mktemp)"
vo5c_emit_webhook_safe_maintenance_snippet synqdrive_api > "$TMP"
vo5c_validate_webhook_safe_snippet "$TMP"
grep -q '/api/v1/webhooks/dimo' "$TMP"
grep -q 'return 503' "$TMP"
rm -f "$TMP"
echo "PASS webhook-safe maintenance selftest"
