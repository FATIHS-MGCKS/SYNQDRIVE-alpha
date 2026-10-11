#!/usr/bin/env bash
# R2.5 — Generate nginx maintenance config that keeps DIMO webhook path proxied to healthy upstreams.
# Used by VO5C joint deploy orchestrator (VPS) — library + selftest only until owner activates on VPS.

set -euo pipefail

VO5C_WEBHOOK_LOCATION_PATH="${VO5C_WEBHOOK_LOCATION_PATH:-/api/v1/webhooks/dimo}"
VO5C_MAINTENANCE_BODY="${VO5C_MAINTENANCE_BODY:-SynqDrive scheduled maintenance}"

# Emit nginx snippet: default location returns 503; webhook location proxies to dual backend.
vo5c_emit_webhook_safe_maintenance_snippet() {
  local upstream_name="${1:-synqdrive_api}"
  cat <<EOF
# VO5C Phase-1 webhook-safe maintenance (R2.5) — generated snippet
location = ${VO5C_WEBHOOK_LOCATION_PATH} {
    proxy_pass http://${upstream_name};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;
}
location / {
    default_type text/plain;
    return 503 "${VO5C_MAINTENANCE_BODY}";
}
EOF
}

# Returns 0 if snippet contains webhook proxy before global 503 catch-all.
vo5c_validate_webhook_safe_snippet() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  grep -q "location = ${VO5C_WEBHOOK_LOCATION_PATH}" "$file" || return 2
  grep -q 'return 503' "$file" || return 3
  grep -q 'proxy_pass' "$file" || return 4
  return 0
}
