#!/usr/bin/env bash
# PROVIDER CONNECTIVITY SMOKE TEST — direct sent.dm API only.
# Does NOT validate SynqDrive SmsController, persistence, idempotency, or canonical projection.
# Opt-in: SENT_DM_LIVE_INTEGRATION=1. Never runs in CI.
set -euo pipefail

if [[ "${SENT_DM_LIVE_INTEGRATION:-}" != "1" ]]; then
  echo "Set SENT_DM_LIVE_INTEGRATION=1 to run sent.dm provider connectivity smoke test"
  exit 0
fi

: "${SENT_DM_API_KEY:?SENT_DM_API_KEY required}"
: "${SENT_DM_TEST_RECIPIENT:?SENT_DM_TEST_RECIPIENT required}"
: "${SENT_DM_TEST_SENDER_PROFILE_ID:?SENT_DM_TEST_SENDER_PROFILE_ID required}"

BUSINESS_OP="synqdrive-provider-smoke-$(date +%s)"

echo "Running sent.dm provider connectivity smoke test (no credentials/phone/body logged)"

RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "https://api.sent.dm/v3/messages" \
  -H "x-api-key: ${SENT_DM_API_KEY}" \
  -H "x-profile-id: ${SENT_DM_TEST_SENDER_PROFILE_ID}" \
  -H "Idempotency-Key: ${BUSINESS_OP}" \
  -H "Content-Type: application/json" \
  -d "{\"to\":[\"${SENT_DM_TEST_RECIPIENT}\"],\"channel\":[\"sms\"],\"text\":\"SynqDrive provider smoke ${BUSINESS_OP}\",\"sandbox\":${SENT_DM_SANDBOX:-false}}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "202" ]]; then
  echo "Provider smoke test failed with HTTP ${HTTP_CODE}"
  exit 1
fi

MESSAGE_ID=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const r=(j.data&&j.data.recipients&&j.data.recipients[0])||{};console.log(r.message_id||'');}catch{process.exit(2)}})")
if [[ -z "$MESSAGE_ID" ]]; then
  echo "Provider smoke accepted but message id missing"
  exit 1
fi

echo "Provider connectivity smoke test passed (providerMessageId present)"
