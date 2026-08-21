#!/usr/bin/env bash
# Opt-in live sent.dm SMS test — requires explicit credentials. Never runs in CI.
set -euo pipefail

if [[ "${SENT_DM_LIVE_INTEGRATION:-}" != "1" ]]; then
  echo "Set SENT_DM_LIVE_INTEGRATION=1 to run live sent.dm SMS test"
  exit 0
fi

: "${SENT_DM_API_KEY:?SENT_DM_API_KEY required}"
: "${SENT_DM_TEST_RECIPIENT:?SENT_DM_TEST_RECIPIENT required}"
: "${SENT_DM_TEST_SENDER_PROFILE_ID:?SENT_DM_TEST_SENDER_PROFILE_ID required}"

BUSINESS_OP="synqdrive-live-test-$(date +%s)"

echo "Sending live sent.dm SMS test (no body/phone logged)"

RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "https://api.sent.dm/v3/messages" \
  -H "x-api-key: ${SENT_DM_API_KEY}" \
  -H "x-profile-id: ${SENT_DM_TEST_SENDER_PROFILE_ID}" \
  -H "Idempotency-Key: ${BUSINESS_OP}" \
  -H "Content-Type: application/json" \
  -d "{\"to\":[\"${SENT_DM_TEST_RECIPIENT}\"],\"channel\":[\"sms\"],\"text\":\"SynqDrive C5.2 live test ${BUSINESS_OP}\",\"sandbox\":${SENT_DM_SANDBOX:-false}}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "202" ]]; then
  echo "Live send failed with HTTP ${HTTP_CODE}"
  exit 1
fi

MESSAGE_ID=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const r=(j.data&&j.data.recipients&&j.data.recipients[0])||{};console.log(r.message_id||'');}catch{process.exit(2)}})")
if [[ -z "$MESSAGE_ID" ]]; then
  echo "Live send accepted but provider message id missing"
  exit 1
fi

echo "Live send accepted. providerMessageId=${MESSAGE_ID} businessOperationId=${BUSINESS_OP}"
