# Battery V2 — LV Estimated Health

**Terminology:** Explicitly **not** workshop SOH (`battery-lv-semantics.ts`, `lv-estimated-health-assessment.policy.ts`).

## Semantics

- Output type: behavioral estimated health score
- Reason code: `score_is_not_soh` — "Geschätzter Verhaltenszustand — kein Werkstatt-SOH"
- Evidence weights from REST measurements, crank proxies, chemistry curves, ambient temperature

## Assessment persistence

- `BatteryAssessment` types for LV estimated health (shadow when flags enabled)
- `publicationEligible` governed by `BATTERY_V2_PUBLICATION_ENABLED`

## Canonical read

- Exposed as `lv.estimatedHealth` in `CanonicalBatteryDto`
- Separate from `hv.providerSoh` and shadow HV SOH gate

## Invariant

`BAT-V2-INV-LV-NOT-SOH-001` — LV estimated health must not be labeled or consumed as SOH %.
