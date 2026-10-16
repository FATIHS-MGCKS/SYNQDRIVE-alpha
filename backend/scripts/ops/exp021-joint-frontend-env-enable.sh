#!/usr/bin/env bash
set -euo pipefail
FE=/opt/synqdrive/shared/frontend.env
STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP="${FE}.bak-joint-exp021-ui-vsi-${STAMP}"
cp "$FE" "$BACKUP"
chmod 600 "$BACKUP"
TMP="$(mktemp)"
grep -v -E '^VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED=' "$FE" > "$TMP" || true
{
  cat "$TMP"
  echo ''
  echo "# EXP021 V2 GPS speed evaluation UI — joint deploy ${STAMP} UTC"
  echo 'VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED=true'
} > "$FE"
chmod 600 "$FE"
echo "FRONTEND_ENV_BACKUP=${BACKUP}"
grep -E '^VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED=' "$FE" | sed 's/=.*$/=<set>/'
