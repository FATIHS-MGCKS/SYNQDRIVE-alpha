#!/usr/bin/env bash
# EXP-021D — Enable settlement shadow on production with rolling PM2 restart.
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${CURRENT:-/opt/synqdrive/current}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
cp "$BACKEND_ENV" "${BACKEND_ENV}.bak-exp021d-shadow-${STAMP}"
echo "Backup: ${BACKEND_ENV}.bak-exp021d-shadow-${STAMP}"

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  echo "${key}=${value}" >> "$tmp"
  mv "$tmp" "$file"
}

upsert_env "$BACKEND_ENV" REFERENCE_CAPTURE_ENABLED true
upsert_env "$BACKEND_ENV" REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED true
chmod 600 "$BACKEND_ENV"

echo "RC flags:"
grep -E '^REFERENCE_CAPTURE' "$BACKEND_ENV" || true

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

echo "Post-restart audit:"
cd "$CURRENT/backend"
node scripts/ops/reference-capture-exp-021d-production-audit.cjs 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
  const j=JSON.parse(s);
  console.log(JSON.stringify({
    REFERENCE_CAPTURE_ENABLED_EFFECTIVE: j.REFERENCE_CAPTURE_ENABLED_EFFECTIVE,
    SETTLEMENT_SHADOW_ENABLED_EFFECTIVE: j.SETTLEMENT_SHADOW_ENABLED_EFFECTIVE,
    SETTLEMENT_QUEUE_WAITING: j.SETTLEMENT_QUEUE_WAITING,
    SETTLEMENT_QUEUE_ACTIVE: j.SETTLEMENT_QUEUE_ACTIVE,
    SETTLEMENT_QUEUE_DELAYED: j.SETTLEMENT_QUEUE_DELAYED,
    ACTIVE_RC_SESSIONS: j.ACTIVE_RC_SESSIONS,
    ACTIVE_SETTLEMENT_EXPERIMENTS: j.ACTIVE_SETTLEMENT_EXPERIMENTS,
  }, null, 2));
});
'
