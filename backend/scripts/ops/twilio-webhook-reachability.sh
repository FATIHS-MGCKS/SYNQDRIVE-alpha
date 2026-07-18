#!/usr/bin/env bash
# Verify Twilio voice webhook routes are publicly reachable on the SynqDrive API.
# Read-only probe — does not purchase numbers or place calls.
set -euo pipefail

BASE_URL="${TWILIO_VOICE_WEBHOOK_BASE_URL:-${APP_URL:-https://app.synqdrive.eu}}"
BASE_URL="${BASE_URL%/}"

VOICE_URL="${BASE_URL}/api/v1/webhooks/twilio/voice"
STATUS_URL="${BASE_URL}/api/v1/webhooks/twilio/status"
HEALTH_URL="${BASE_URL}/api/v1/health"

FORM_DATA="CallSid=CA_reachability_probe&From=%2B15550001111&To=%2B15550002222&Direction=inbound&CallStatus=ringing"

probe() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local tmp
  tmp="$(mktemp)"
  local code
  if [[ -n "$data" ]]; then
    code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data "$data")"
  else
    code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url")"
  fi
  echo "[$method] $url -> HTTP $code" >&2
  head -c 240 "$tmp" >&2
  echo >&2
  rm -f "$tmp"
  echo "$code"
}

echo "Twilio webhook reachability probe" >&2
echo "Base URL: $BASE_URL" >&2
echo >&2

health_code="$(probe GET "$HEALTH_URL")"
voice_code="$(probe POST "$VOICE_URL" "$FORM_DATA")"
status_code="$(probe POST "$STATUS_URL" "$FORM_DATA")"

fail=0
[[ "$health_code" == "200" ]] || fail=1

# Unsigned POST probes: 401 = signature rejection (expected when ingestion validates Twilio HMAC).
# 200 may appear only when webhook ingestion is disabled and routes return a benign TwiML stub.
voice_ok=0
status_ok=0
[[ "$voice_code" == "401" || "$voice_code" == "200" ]] && voice_ok=1
[[ "$status_code" == "401" || "$status_code" == "200" ]] && status_ok=1
[[ "$voice_ok" -eq 1 ]] || fail=1
[[ "$status_ok" -eq 1 ]] || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo >&2
  echo "FAIL: One or more endpoints are not ready." >&2
  echo "Expected: health=200; unsigned voice/status=401 (signature rejected) or 200 (ingestion off)." >&2
  echo "404 on voice/status usually means the Twilio module is not deployed yet." >&2
  exit 1
fi

echo "OK: Twilio webhook routes are reachable (health=200; voice=$voice_code; status=$status_code)." >&2
