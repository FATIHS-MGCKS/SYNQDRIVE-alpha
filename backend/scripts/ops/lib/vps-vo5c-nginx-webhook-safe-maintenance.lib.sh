#!/usr/bin/env bash
# R2.6 — Webhook-safe VO5C Phase-1 nginx maintenance (offline generator + validators).
set -euo pipefail

VO5C_WEBHOOK_LOCATION_PATH="${VO5C_WEBHOOK_LOCATION_PATH:-/api/v1/webhooks/dimo}"
VO5C_MAINTENANCE_BODY="${VO5C_MAINTENANCE_BODY:-SynqDrive scheduled maintenance}"

vo5c_validate_upstream_name() {
  local name="$1"
  [[ "$name" =~ ^[a-zA-Z0-9_]+$ ]] || return 1
  return 0
}

vo5c_validate_webhook_path() {
  local path="$1"
  [[ "$path" == /* ]] || return 1
  [[ "$path" != *$'\n'* ]] || return 1
  [[ "$path" != *'"'* ]] || return 1
  [[ "$path" != *';'* ]] || return 1
  return 0
}

vo5c_sanitize_maintenance_body() {
  local body="$1"
  body="${body//$'\n'/ }"
  body="${body//$'\r'/ }"
  printf '%s' "$body"
}

# Full Phase-1 site fragment: TLS server with webhook proxy + catch-all 503.
# Upstream must exist in outer nginx context (dual replica 3001/3002).
vo5c_emit_webhook_safe_maintenance_site() {
  local upstream_name="${1:-synqdrive_backend}"
  local webhook_path="${2:-$VO5C_WEBHOOK_LOCATION_PATH}"
  local maintenance_body
  maintenance_body="$(vo5c_sanitize_maintenance_body "${3:-$VO5C_MAINTENANCE_BODY}")"

  vo5c_validate_upstream_name "$upstream_name" || return 2
  vo5c_validate_webhook_path "$webhook_path" || return 3

  cat <<EOF
upstream ${upstream_name} {
    server 127.0.0.1:3001 max_fails=2 fail_timeout=5s;
    server 127.0.0.1:3002 max_fails=2 fail_timeout=5s;
}

server {
    server_name app.synqdrive.eu srv1374778.hstgr.cloud _;
    client_max_body_size 20m;
    listen [::]:443 ssl ipv6only=on;
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/app.synqdrive.eu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.synqdrive.eu/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Exact match — higher priority than prefix location /
    location = ${webhook_path} {
        proxy_pass http://${upstream_name};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
        client_max_body_size 1m;
        proxy_intercept_errors off;
    }

    location / {
        default_type text/plain;
        return 503 "${maintenance_body}";
    }
}
EOF
}

# Returns 0 if webhook location appears before catch-all 503 and uses proxy_pass.
vo5c_validate_webhook_safe_site() {
  local file="$1"
  local webhook_path="${2:-$VO5C_WEBHOOK_LOCATION_PATH}"
  [[ -f "$file" ]] || return 1
  grep -q "location = ${webhook_path}" "$file" || return 2
  grep -q 'proxy_pass http://' "$file" || return 3
  grep -q 'return 503' "$file" || return 4
  local webhook_line catchall_line
  webhook_line="$(grep -n "location = ${webhook_path}" "$file" | head -1 | cut -d: -f1)"
  catchall_line="$(grep -n 'location / {' "$file" | head -1 | cut -d: -f1)"
  [[ -n "$webhook_line" && -n "$catchall_line" ]] || return 5
  [[ "$webhook_line" -lt "$catchall_line" ]] || return 6
  return 0
}
