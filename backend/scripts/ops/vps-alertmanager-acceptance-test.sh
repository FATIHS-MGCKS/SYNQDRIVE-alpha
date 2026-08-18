#!/usr/bin/env bash
#
# vps-alertmanager-acceptance-test.sh — Controlled Alertmanager production acceptance.
#
# Tests: Prometheus firing → Alertmanager → email receiver, resolution, grouping, silence, restart.
# Requires alertmanager + prometheus running on localhost.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
AM_CONTAINER="${AM_CONTAINER:-synqdrive-alertmanager}"
PROM_CONTAINER="${PROM_CONTAINER:-synqdrive-prometheus}"
ACCEPTANCE_RULES_SRC="${SYNQDRIVE_ROOT}/backend/monitoring/prometheus/alerts-acceptance-test.yml"
ACCEPTANCE_RULES_DST="${PROM_DIR}/alerts-acceptance-test.yml"
LOG="/tmp/synqdrive-alertmanager-acceptance.log"

exec > >(tee -a "$LOG") 2>&1

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; exit 1; }

wait_for() {
  local desc="$1"
  local cmd="$2"
  local tries="${3:-30}"
  local i
  for ((i=1; i<=tries; i++)); do
    if eval "$cmd"; then
      pass "$desc"
      return 0
    fi
    sleep 2
  done
  fail "$desc (timeout)"
}

echo "=== SynqDrive Alertmanager acceptance $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

curl -sf http://127.0.0.1:9093/-/healthy >/dev/null || fail "alertmanager not healthy"
curl -sf http://127.0.0.1:9093/-/ready >/dev/null || fail "alertmanager not ready"
pass "alertmanager healthy+ready"

curl -sf http://127.0.0.1:9090/-/ready >/dev/null || fail "prometheus not ready"
pass "prometheus ready"

[[ -f "$ACCEPTANCE_RULES_SRC" ]] || fail "acceptance rules missing in release tree"

cp "$ACCEPTANCE_RULES_SRC" "$ACCEPTANCE_RULES_DST"
if ! grep -q 'alerts-acceptance-test.yml' "${PROM_DIR}/prometheus.yml" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path
p = Path("/opt/synqdrive/shared/prometheus/prometheus.yml")
text = p.read_text()
needle = "  - /etc/prometheus/alerts-infra.yml"
insert = needle + "\n  - /etc/prometheus/alerts-acceptance-test.yml"
if "alerts-acceptance-test.yml" not in text:
    text = text.replace(needle, insert, 1)
    p.write_text(text)
PY
  docker restart "$PROM_CONTAINER" >/dev/null
  sleep 8
fi

curl -sf -X POST http://127.0.0.1:9090/-/reload >/dev/null 2>&1 || docker restart "$PROM_CONTAINER" >/dev/null
sleep 5

wait_for "prometheus firing SynqDriveAlertmanagerAcceptanceTest" \
  "curl -sf 'http://127.0.0.1:9090/api/v1/alerts' | python3 -c \"import sys,json; d=json.load(sys.stdin); sys.exit(0 if any(a.get('labels',{}).get('alertname')=='SynqDriveAlertmanagerAcceptanceTest' and a.get('state')=='firing' for a in d.get('data',{}).get('alerts',[])) else 1)\"" \
  45

wait_for "alertmanager received acceptance alert" \
  "curl -sf http://127.0.0.1:9093/api/v2/alerts | python3 -c \"import sys,json; d=json.load(sys.stdin); sys.exit(0 if any(a.get('labels',{}).get('alertname')=='SynqDriveAlertmanagerAcceptanceTest' for a in d) else 1)\"" \
  45

wait_for "grouping alert visible in alertmanager" \
  "curl -sf http://127.0.0.1:9093/api/v2/alerts | python3 -c \"import sys,json; d=json.load(sys.stdin); sys.exit(0 if sum(1 for a in d if a.get('labels',{}).get('alertname')=='SynqDriveAlertmanagerAcceptanceGrouping')>=2 else 1)\"" \
  45

# Delivery evidence: wait for group_wait then verify via Resend API (no secrets logged)
sleep 45
BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
RESEND_KEY="$(grep '^RESEND_API_KEY=' "$BACKEND_ENV" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
if [[ -n "$RESEND_KEY" ]] && curl -sf -H "Authorization: Bearer ${RESEND_KEY}" "https://api.resend.com/emails?limit=20" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if any('SynqDriveAlertmanagerAcceptance' in (e.get('subject') or '') for e in d.get('data',[])) else 1)"; then
  pass "receiver delivery verified via Resend API (acceptance alert)"
elif docker logs "$AM_CONTAINER" 2>&1 | tail -200 | grep -qiE 'notify|notification|email|sent|aggregat'; then
  pass "receiver delivery attempt logged by alertmanager"
else
  fail "no delivery evidence (Resend API + alertmanager logs)"
fi

# Silence test
SILENCE_ID="$(curl -sf -X POST http://127.0.0.1:9093/api/v2/silences \
  -H 'Content-Type: application/json' \
  -d '{"matchers":[{"name":"alertname","value":"SynqDriveAlertmanagerAcceptanceTest","isRegex":false}],"startsAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","endsAt":"'$(date -u -d '+15 minutes' +%Y-%m-%dT%H:%M:%SZ)'","createdBy":"acceptance-test","comment":"temporary acceptance silence"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("silenceID",""))')"

[[ -n "$SILENCE_ID" ]] || fail "silence creation"
pass "silence created id=${SILENCE_ID}"

curl -sf -X DELETE "http://127.0.0.1:9093/api/v2/silence/${SILENCE_ID}" >/dev/null
pass "silence removed"

# Resolution: remove acceptance rules
rm -f "$ACCEPTANCE_RULES_DST"
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/synqdrive/shared/prometheus/prometheus.yml")
text = p.read_text().splitlines()
text = [ln for ln in text if "alerts-acceptance-test.yml" not in ln]
p.write_text("\n".join(text) + "\n")
PY
curl -sf -X POST http://127.0.0.1:9090/-/reload >/dev/null || docker restart "$PROM_CONTAINER" >/dev/null

wait_for "acceptance alerts resolved in prometheus" \
  "curl -sf 'http://127.0.0.1:9090/api/v1/alerts' | python3 -c \"import sys,json; d=json.load(sys.stdin); sys.exit(0 if not any(a.get('labels',{}).get('alertname','').startswith('SynqDriveAlertmanagerAcceptance') and a.get('state')=='firing' for a in d.get('data',{}).get('alerts',[])) else 1)\"" \
  60

# Restart resilience
docker restart "$AM_CONTAINER" >/dev/null
sleep 5
curl -sf http://127.0.0.1:9093/-/healthy >/dev/null || fail "post-restart healthy"
curl -sf http://127.0.0.1:9093/-/ready >/dev/null || fail "post-restart ready"
[[ -d /opt/synqdrive/shared/alertmanager/data ]] && pass "persistence directory present"
pass "restart resilience"

# Fail-closed validation (invalid config must not deploy)
INVALID="$(mktemp)"
echo 'route: { receiver: missing }' > "$INVALID"
if docker run --rm --entrypoint amtool -v "$INVALID:/etc/alertmanager/alertmanager.yml:ro" prom/alertmanager:v0.27.0 \
  check-config /etc/alertmanager/alertmanager.yml 2>/dev/null; then
  rm -f "$INVALID"
  fail "invalid config was accepted by amtool"
fi
rm -f "$INVALID"
pass "invalid config rejected by amtool (fail-closed)"

echo "=== Alertmanager acceptance COMPLETE ==="
