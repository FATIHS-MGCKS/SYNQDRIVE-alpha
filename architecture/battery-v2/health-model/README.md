# Battery V2 — Health Model

**Reconstruction maturity:** PARTIAL — Stage 1 shadow LV REST reconstructed; full assessment/publication not

## Layers (conceptual)

```
Observations (LIVE_VOLTAGE, snapshots, …)
    → BatteryMeasurement (REST_60M / REST_6H / …)
    → BatteryAssessment (LV_HEALTH, …)
    → Publication / readiness read models (flag-gated)
    → UI consumers (fleet health, vehicle detail, …)
```

## Stage 1 authoritative layer

**Shadow REST measurements** under `BATTERY_V2_REST_SHADOW_ENABLED` — metrics recorded; publication/readiness **not** authoritative.

## Quality outcomes (REST)

From evaluation service (not exhaustively listed):

- `VALID`
- `CONTAMINATED`
- `MISSED` (no eligible observation — **not** fabricated zero)

## Not yet reconstructed

- Full LV assessment recompute triggers and scoring
- HV health modules
- Reference capacity / SOH authority
- Consumer mapping (`BAT-V2-GAP-CONSUMER-READ-001`)

See [legacy-compatibility.md](./legacy-compatibility.md).
