#!/usr/bin/env bash
# SynqDrive runtime end-to-end SMS validation (opt-in, staging/test org only).
#
# Validates the full SynqDrive stack:
#   SmsController → SmsService → persistence → canonical MESSAGE_SENT → webhook DELIVERED
#
# NOT a provider connectivity smoke test — see sentdm-sms-live.integration.sh for direct sent.dm curl.
#
# Prerequisites:
#   - COMMUNICATION_CENTER_SMS_ENABLED=true on target deployment
#   - Staging/test organization with OrgSmsConfig + env API keys
#   - Authenticated user with communication.write
#   - Explicit test recipient (never production customer numbers)
#
# Safety defaults OFF — never run automatically in CI.
set -euo pipefail

if [[ "${SYNQDRIVE_SMS_E2E_VALIDATION:-}" != "1" ]]; then
  echo "Set SYNQDRIVE_SMS_E2E_VALIDATION=1 to run SynqDrive SMS runtime E2E validation"
  exit 0
fi

: "${SYNQDRIVE_API_BASE_URL:?SYNQDRIVE_API_BASE_URL required (e.g. https://staging.synqdrive.eu/api/v1)}"
: "${SYNQDRIVE_AUTH_TOKEN:?SYNQDRIVE_AUTH_TOKEN required (Clerk/session bearer)}"
: "${SYNQDRIVE_TEST_ORG_ID:?SYNQDRIVE_TEST_ORG_ID required}"
: "${SYNQDRIVE_TEST_RECIPIENT:?SYNQDRIVE_TEST_RECIPIENT required}"
: "${SYNQDRIVE_TEST_IDEMPOTENCY_KEY:?SYNQDRIVE_TEST_IDEMPOTENCY_KEY required}"

echo "SynqDrive SMS runtime E2E validation starting (no phone/body/secrets logged)"

RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST \
  "${SYNQDRIVE_API_BASE_URL}/organizations/${SYNQDRIVE_TEST_ORG_ID}/sms/messages" \
  -H "Authorization: Bearer ${SYNQDRIVE_AUTH_TOKEN}" \
  -H "Idempotency-Key: ${SYNQDRIVE_TEST_IDEMPOTENCY_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"recipient\":\"${SYNQDRIVE_TEST_RECIPIENT}\",\"content\":\"SynqDrive E2E validation ${SYNQDRIVE_TEST_IDEMPOTENCY_KEY}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
  echo "SynqDrive send failed with HTTP ${HTTP_CODE}"
  exit 1
fi

MESSAGE_ID=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log((j.message&&j.message.id)||j.messageId||'');}catch{process.exit(2)}})")
if [[ -z "$MESSAGE_ID" ]]; then
  echo "SynqDrive send accepted but native message id missing in response"
  exit 1
fi

echo "SynqDrive outbound accepted. Verify manually:"
echo "  - SmsMessage status QUEUED (or accepted replay)"
echo "  - CommunicationEvent MESSAGE_SENT for org ${SYNQDRIVE_TEST_ORG_ID}"
echo "  - After webhook: DELIVERED + MESSAGE_DELIVERED"
echo "One SMS maximum per invocation. Live provider validation NOT automatic."
