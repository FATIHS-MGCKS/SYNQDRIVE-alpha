#!/usr/bin/env bash
# Read-only production preflight for Physical Refuel V2 cutover.
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
HEALTH_URL="${SYNQDRIVE_EXTERNAL_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "PRODUCTION_PREFLIGHT=FAIL"
  echo "ERROR: backend.env missing" >&2
  exit 1
fi

echo "DEPLOYED_BACKEND_SHA=$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
echo "REPLICA_A_PM2=${SYNQDRIVE_REPLICA_A_PM2_NAME:-synqdrive}"
echo "REPLICA_B_PM2=${SYNQDRIVE_REPLICA_B_PM2_NAME:-synqdrive-b}"

if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist 2>/dev/null | node -e '
    let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
      try{
        const apps=JSON.parse(d).filter(a=>["synqdrive","synqdrive-b"].includes(a.name));
        for(const a of apps){
          console.log(`PM2_${a.name}_status=${a.pm2_env?.status||"unknown"}`);
          console.log(`PM2_${a.name}_restarts=${a.pm2_env?.restart_time||0}`);
        }
      }catch(e){console.log("PM2_PARSE=FAIL")}
    })'
fi

# Non-secret feature flags only
grep -E '^(PHYSICAL_REFUEL_RECONCILIATION_V2_|PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_|FUEL_STATION_ENRICHMENT_ENABLED=|FUEL_STATION_ENRICHMENT_CUTOVER_AT=|FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED=)' "$BACKEND_ENV" || true

if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "EXTERNAL_HEALTH=PASS"
else
  echo "EXTERNAL_HEALTH=FAIL"
  exit 1
fi

# DB connectivity (no URL printed)
if sudo bash -lc "set -a; source ${BACKEND_ENV}; set +a; cd ${CURRENT}/backend && ./node_modules/.bin/prisma migrate status 2>/dev/null | tail -3"; then
  echo "PRISMA_MIGRATE_STATUS=OK"
else
  echo "PRISMA_MIGRATE_STATUS=WARN"
fi

echo "PRODUCTION_PREFLIGHT=PASS"
