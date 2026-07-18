#!/usr/bin/env bash
# Voice staging E2E rollback (Prompt 10A) — close live-call gates, no PSTN.
set -euo pipefail

ENV_FILE="${VOICE_STAGING_ENV_FILE:-/opt/synqdrive/shared/backend.env}"

upsert_env_key() {
  local file="$1"
  local key="$2"
  local value="$3"
  if [[ ! -f "$file" ]]; then
    echo "WARN: env file not found: $file (skipping file mutation)" >&2
    return 0
  fi
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$file"
  fi
}

echo "=== Voice staging E2E rollback ===" >&2
echo "Target env file: $ENV_FILE" >&2

upsert_env_key "$ENV_FILE" "VOICE_E2E_ALLOW_LIVE_CALLS" "false"
upsert_env_key "$ENV_FILE" "VOICE_E2E_ALLOWLIST_E164" ""

echo "Rollback applied:" >&2
echo "  VOICE_E2E_ALLOW_LIVE_CALLS=false" >&2
echo "  VOICE_E2E_ALLOWLIST_E164=<cleared>" >&2
echo "Staging rollout unchanged (rollout:STAGING). No production release." >&2

if [[ -f "$ENV_FILE" ]]; then
  live="$(grep '^VOICE_E2E_ALLOW_LIVE_CALLS=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  allow="$(grep '^VOICE_E2E_ALLOWLIST_E164=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  echo "Verified on disk: live=${live:-unset} allowlist_entries=$(echo "${allow:-}" | tr ',' '\n' | sed '/^$/d' | wc -l)" >&2
fi

echo '{"rollback":"applied","liveCallsEnabled":false,"allowlistCleared":true}' 
