#!/usr/bin/env bash
# Voice AI staging preflight (Prompt 10B) — read-only checks, no live calls.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "=== Voice staging preflight ===" >&2
echo "Repo: $ROOT" >&2
echo "Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)" >&2
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)" >&2
echo >&2

fail=0

run_step() {
  local label="$1"
  shift
  echo "--- $label ---" >&2
  if "$@"; then
    echo "OK: $label" >&2
  else
    echo "FAIL: $label" >&2
    fail=1
  fi
  echo >&2
}

run_step "Voice secret scan" bash scripts/audits/scan-voice-secrets.sh

run_step "Backend voice security bundle" bash -c 'cd backend && npm run test:voice:security'

run_step "Voice staging E2E matrix" bash -c 'cd backend && npm run test:voice:staging-e2e'

run_step "Prisma schema validate" bash -c 'cd backend && npm run prisma:validate'

run_step "Voice staging runtime probes" bash -c 'cd backend && npm run voice:staging:probes'

if [[ "${VOICE_PREFLIGHT_SKIP_WEBHOOK_PROBE:-}" != "1" ]]; then
  run_step "Twilio webhook reachability" bash backend/scripts/ops/twilio-webhook-reachability.sh
else
  echo "SKIP: Twilio webhook reachability (VOICE_PREFLIGHT_SKIP_WEBHOOK_PROBE=1)" >&2
  echo >&2
fi

echo "--- E2E safety flags ---" >&2
echo "VOICE_E2E_ALLOW_LIVE_CALLS=${VOICE_E2E_ALLOW_LIVE_CALLS:-false}" >&2
echo "VOICE_AI_PROVISIONING_STAGING_ENABLED=${VOICE_AI_PROVISIONING_STAGING_ENABLED:-false}" >&2
echo "VOICE_E2E_ORG_ID=${VOICE_E2E_ORG_ID:-<unset>}" >&2
if [[ -n "${VOICE_E2E_ALLOWLIST_E164:-}" ]]; then
  echo "VOICE_E2E_ALLOWLIST_E164=<set, $(echo "$VOICE_E2E_ALLOWLIST_E164" | tr ',' '\n' | wc -l) entries>" >&2
else
  echo "VOICE_E2E_ALLOWLIST_E164=<unset>" >&2
fi
echo >&2

if [[ "${VOICE_E2E_ALLOW_LIVE_CALLS:-}" == "true" ]]; then
  echo "WARN: VOICE_E2E_ALLOW_LIVE_CALLS=true — live PSTN only to VOICE_E2E_ALLOWLIST_E164 targets." >&2
else
  echo "INFO: Live calls disabled (expected for CI). Set VOICE_E2E_ALLOW_LIVE_CALLS=true for manual staging calls." >&2
fi

if [[ "$fail" -ne 0 ]]; then
  echo "Voice staging preflight FAILED." >&2
  exit 1
fi

echo "Voice staging preflight PASSED." >&2
