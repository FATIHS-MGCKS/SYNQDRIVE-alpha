#!/usr/bin/env bash
# EXP-021 — Enable HF Recovery V2 for Audi token 187361 only (canary), preserving existing allowlist.
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${CURRENT:-/opt/synqdrive/current}"
AUDI_TOKEN_ID="${AUDI_TOKEN_ID:-187361}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
cp "$BACKEND_ENV" "${BACKEND_ENV}.bak-exp021-hf-v2-audi-canary-${STAMP}"
echo "Backup: ${BACKEND_ENV}.bak-exp021-hf-v2-audi-canary-${STAMP}"

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  echo "${key}=${value}" >> "$tmp"
  mv "$tmp" "$file"
}

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$BACKEND_ENV" | tail -1 | cut -d= -f2- || true
}

BEFORE_ENABLED="$(read_env_value HF_RECOVERY_POLICY_V2_ENABLED)"
BEFORE_CANARY_ONLY="$(read_env_value HF_RECOVERY_POLICY_V2_CANARY_ONLY)"
BEFORE_TOKEN_IDS="$(read_env_value HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS)"

echo "HF_V2_CONFIG_BEFORE={\"HF_RECOVERY_POLICY_V2_ENABLED\":\"${BEFORE_ENABLED}\",\"HF_RECOVERY_POLICY_V2_CANARY_ONLY\":\"${BEFORE_CANARY_ONLY}\",\"HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS\":\"${BEFORE_TOKEN_IDS}\"}"

# Merge token ids (preserve existing legitimate canary tokens e.g. Mercedes 187336)
MERGED_IDS=""
declare -A seen=()
for part in ${BEFORE_TOKEN_IDS//,/ } ; do
  part="$(echo "$part" | xargs)"
  [[ -z "$part" ]] && continue
  if [[ -z "${seen[$part]:-}" ]]; then
    seen[$part]=1
    if [[ -n "$MERGED_IDS" ]]; then MERGED_IDS+=","; fi
    MERGED_IDS+="$part"
  fi
done
if [[ -z "${seen[$AUDI_TOKEN_ID]:-}" ]]; then
  if [[ -n "$MERGED_IDS" ]]; then MERGED_IDS+=","; fi
  MERGED_IDS+="$AUDI_TOKEN_ID"
fi

upsert_env "$BACKEND_ENV" HF_RECOVERY_POLICY_V2_ENABLED true
upsert_env "$BACKEND_ENV" HF_RECOVERY_POLICY_V2_CANARY_ONLY true
upsert_env "$BACKEND_ENV" HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS "$MERGED_IDS"
chmod 600 "$BACKEND_ENV"

echo "HF_V2_CONFIG_AFTER:"
grep -E '^HF_RECOVERY_POLICY_V2' "$BACKEND_ENV" || true

wait_health() {
  local port="$1" label="$2"
  local i
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${port}/api/v1/health" >/dev/null; then
      echo "Health OK: ${label} (:${port})"
      return 0
    fi
    sleep 2
  done
  echo "ERROR: health failed for ${label} (:${port})" >&2
  return 1
}

rolling_restart() {
  local app="$1" port="$2"
  echo "Restarting ${app}..."
  pm2 restart "$app" --update-env
  wait_health "$port" "$app"
}

rolling_restart synqdrive 3001
rolling_restart synqdrive-b 3002

echo "Verifying effective HF policy from running backend..."
cd "$CURRENT/backend"
set -a
# shellcheck disable=SC1090
source "$BACKEND_ENV"
set +a
npx ts-node -r tsconfig-paths/register --transpile-only scripts/ops/reference-capture-exp-021-hf-v2-policy-verify.ts
