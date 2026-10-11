#!/usr/bin/env bash
# R2.7 — Strict Phase-1 gates for webhook-safe maintenance (fail-closed).
set -euo pipefail

# shellcheck source=vps-vo5c-http-check.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vps-vo5c-http-check.lib.sh"

# Validates maintenance nginx after reload. No curl -f. No DIMO provider calls.
# Optional edge POST uses --resolve to 127.0.0.1 (local nginx), not external DIMO.
vo5c_phase1_assert_public_isolation() {
  local public_root_url="${1:-https://app.synqdrive.eu/}"
  local webhook_path="${2:-/api/v1/webhooks/dimo}"
  local webhook_edge_url="https://app.synqdrive.eu${webhook_path}"

  vo5c_http_probe GET "$public_root_url"
  export VO5C_PHASE1_ROOT_HTTP="$VO5C_HTTP_CODE"
  export VO5C_PHASE1_ROOT_CURL_EXIT="$VO5C_CURL_EXIT"
  [[ "$VO5C_HTTP_CODE" == "503" ]] || return 1

  local a_ok=0 b_ok=0
  vo5c_replica_health_ok 3001 && a_ok=1
  vo5c_replica_health_ok 3002 && b_ok=1

  vo5c_http_probe POST "$webhook_edge_url" \
    --resolve "app.synqdrive.eu:443:127.0.0.1" \
    -H 'Content-Type: application/json' \
    -d '{}'
  export VO5C_PHASE1_WEBHOOK_HTTP="$VO5C_HTTP_CODE"
  export VO5C_PHASE1_WEBHOOK_CURL_EXIT="$VO5C_CURL_EXIT"

  if [[ "$a_ok" -eq 1 || "$b_ok" -eq 1 ]]; then
    [[ "$VO5C_HTTP_CODE" =~ ^2 ]] || return 2
  else
    [[ "$VO5C_HTTP_CODE" != "200" ]] || return 3
  fi
  return 0
}
