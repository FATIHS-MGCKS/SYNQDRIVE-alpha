#!/usr/bin/env bash
# R2.7b — Read-only Phase-1 routing gate (no webhook POST; no NestJS mutation).
set -euo pipefail

# shellcheck source=vps-vo5c-http-check.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vps-vo5c-http-check.lib.sh"
# shellcheck source=vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

# Validates: exact webhook location in nginx file, public GET / → 503, replica GET health only.
# Does NOT prove authenticated DIMO webhook delivery (natural traffic / T+24 only).
vo5c_phase1_assert_read_only_routing_gate() {
  local nginx_site="$1"
  local webhook_path="${2:-/api/v1/webhooks/dimo}"
  local public_root_url="${3:-https://app.synqdrive.eu/}"

  vo5c_validate_webhook_safe_site "$nginx_site" "$webhook_path" || return 1

  vo5c_http_probe GET "$public_root_url"
  export VO5C_PHASE1_ROOT_HTTP="$VO5C_HTTP_CODE"
  export VO5C_PHASE1_ROOT_CURL_EXIT="$VO5C_CURL_EXIT"
  [[ "$VO5C_HTTP_CODE" == "503" ]] || return 2

  vo5c_replica_health_ok 3001
  export VO5C_PHASE1_REPLICA_A_HTTP="$VO5C_HTTP_CODE"
  local a_ok=$?

  vo5c_replica_health_ok 3002
  export VO5C_PHASE1_REPLICA_B_HTTP="$VO5C_HTTP_CODE"
  local b_ok=$?

  [[ "$a_ok" -eq 0 || "$b_ok" -eq 0 ]] || return 3

  export VO5C_PHASE1_ROUTING_GATE=PASS
  export VO5C_PHASE1_WEBHOOK_AUTHENTICATED_DELIVERY=NOT_PROBED
  return 0
}
