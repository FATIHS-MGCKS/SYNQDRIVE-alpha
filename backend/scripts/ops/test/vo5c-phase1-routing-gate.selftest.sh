#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
SITE="$TMP/site.conf"
MOCK_BIN="$TMP/bin"
export PATH="$MOCK_BIN:$PATH"
mkdir -p "$MOCK_BIN"

# shellcheck source=../lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$ROOT/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"
vo5c_emit_phase1_maintenance_nginx_file synqdrive_backend /api/v1/webhooks/dimo >"$SITE"

cat >"$MOCK_BIN/curl" <<'SH'
#!/usr/bin/env bash
if [[ "$*" == *"app.synqdrive.eu/"* ]]; then
  echo "503"
  exit 0
fi
if [[ "$*" == *":3001"* ]] || [[ "$*" == *":3002"* ]]; then
  echo "200"
  exit 0
fi
echo "000"
exit 0
SH
chmod +x "$MOCK_BIN/curl"

# shellcheck source=../lib/vps-vo5c-phase1-webhook-safe-gates.lib.sh
source "$ROOT/lib/vps-vo5c-phase1-webhook-safe-gates.lib.sh"
vo5c_phase1_assert_read_only_routing_gate "$SITE" /api/v1/webhooks/dimo "https://app.synqdrive.eu/"
[[ "$VO5C_PHASE1_ROUTING_GATE" == "PASS" ]]
[[ "$VO5C_PHASE1_WEBHOOK_AUTHENTICATED_DELIVERY" == "NOT_PROBED" ]]
rm -rf "$TMP"
echo "PASS vo5c-phase1-routing-gate selftest"
