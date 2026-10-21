#!/usr/bin/env bash
# R2.6 — Full nginx -t on webhook-safe Phase-1 generator (TLS stripped for offline CI).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$(mktemp)"
FULL="$(mktemp)"
# shellcheck source=../lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$ROOT/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

vo5c_emit_webhook_safe_maintenance_site synqdrive_backend /api/v1/webhooks/dimo >"$SITE"
vo5c_validate_webhook_safe_site "$SITE" /api/v1/webhooks/dimo

BODY="$(sed -e '/listen \[::\]:443/d' \
  -e '/listen 443 ssl/d' \
  -e '/ssl_certificate/d' \
  -e '/ssl_certificate_key/d' \
  -e '/options-ssl-nginx/d' \
  -e '/ssl_dhparam/d' \
  -e '/client_max_body_size 20m/a\
    listen 8080;' "$SITE")"

cat >"$FULL" <<EOF
worker_processes 1;
pid /tmp/r9-nginx-config-test.pid;
events { worker_connections 64; }
http {
${BODY}
}
EOF

nginx -t -c "$FULL"
rm -f "$SITE" "$FULL"
echo "PASS webhook-safe nginx -t (HTTP-stripped TLS)"
