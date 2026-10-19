# G5C-N16 — Estimated 12V battery health V1 (shadow)

**Model:** `LV_ESTIMATED_BATTERY_HEALTH_V1_2026-10-19`  
**Status:** Shadow-only; `customerPublicationEnabled: false`; `measuredSOH: UNKNOWN`

## Separation from N14

| Output | N14 `LvOperationalConditionV1` | N16 shadow |
|--------|--------------------------------|------------|
| Operational voltage / charge risk | `operationalRiskStatus` | Not reused as health |
| Startability | `startabilityStatus` | Load family input only |
| Estimated battery health | — | `estimatedHealthStatus` |

N16 consumes the same qualified REST episode machinery as N14 but applies a distinct multi-family policy (rest, longitudinal trend, validated crank, charging context).

## Ops harness

`backend/scripts/ops/lv-estimated-battery-health-evaluation-readonly.ts` — 120-day window, high observation limit, restore cutoff `2026-10-17T21:55:43Z`.

Production: use `synqdrive_battery_v2_forensic_ro` via `/opt/synqdrive/shared/ops/battery-v2-forensic-ro-psql.sh` wrapper pattern for `DATABASE_URL` (credentials on VPS only).
