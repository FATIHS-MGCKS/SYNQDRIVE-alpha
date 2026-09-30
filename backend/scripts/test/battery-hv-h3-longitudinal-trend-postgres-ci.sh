#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/backend"
echo "[battery-hv-h3-longitudinal-trend-postgres-ci] unit tests (hv-h3)"
npm run test:battery:v2:hv-h3
echo "[battery-hv-h3-longitudinal-trend-postgres-ci] postgres integration (hv-h3 report)"
export DATABASE_URL="${DATABASE_URL:-postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public}"
npx prisma migrate deploy
BATTERY_HV_H3_REPORT_INTEGRATION=1 npm run test:battery:v2:hv-h3:postgres -- --runInBand
