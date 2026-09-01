# Battery V2 — HV Capacity Methods (M2 / M3 / Cross-Session)

**Flag:** `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` (default OFF)  
**Epistemic:** CONFIRMED from shadow pipeline code

## Method overview

| Method ID | Domain enum | Role | Implementation |
|-----------|-------------|------|----------------|
| `M2_CURRENT_ENERGY_SOC` | `CURRENT_ENERGY_OVER_SOC` | Point estimate from SOC + energy | `hv-capacity-m2.policy.ts` |
| `M3_ADDED_ENERGY_DELTA_SOC` | `SEGMENT_ADDED_ENERGY_OVER_SOC` | Per-session validation | `hv-capacity-m3.policy.ts` — **VALIDATION_ONLY** |
| `SESSION_CHARGE_CAPACITY` | — | Profile eligibility only | **No compute service** |
| `GROSS_CAPACITY_REFERENCE` | `PROVIDER_GROSS_CAPACITY` | Profile eligibility only | **No compute service** |
| Cross-session | `SHADOW_ROLLING_MEDIAN` | Assessment aggregation | `hv-capacity-cross-session.policy.ts` |

## M2 — CURRENT_ENERGY_OVER_SOC

**Formula:**
```
estimatedCapacityKwh = currentEnergyKwh / (socPercent / 100)
```

**Preconditions:** `socPercent > 0`, `currentEnergyKwh > 0`, session `capacityShadowEligible`, session not ongoing.

**Quality gates (reason codes):** `SOC_NOT_POSITIVE`, `MISSING_ENERGY`, `TIMESTAMP_SKEW`, `DUPLICATE_TIMESTAMP`, `STALE_REPETITION`, `NOT_NEW_OBSERVATION`, `IMPLAUSIBLE_UNIT`, `OUT_OF_CAPACITY_BAND`, `OUTLIER`, `SESSION_NOT_ELIGIBLE`.

**Constants (CODE FACT):**

| Constant | Value |
|----------|-------|
| Preferred SOC band | 10–90% |
| Min energy | 0.05 kWh |
| Max energy | 130 kWh |
| Max timestamp skew | 60 s |
| Default capacity band | 15–120 kWh |
| Reference band tolerance | ±40% |
| Session outlier deviation | 15% vs median |
| Model version | 1 |

**Output:** `HvCapacityObservation` (shadow row); `publicationEligible: false`.

## M3 — SEGMENT_ADDED_ENERGY_OVER_SOC

**Formula:**
```
estimatedCapacityKwh = segmentAddedEnergyKwh / (deltaSocPercent / 100)
```

**Preconditions:** DIMO recharge source, session ended, `capacityValidationEligible`, min ΔSOC 20%, min added energy 0.5 kWh.

**Role:** Validates M2 session median; conflicts if >10% deviation from M2. **Does not publish SOH alone.**

## Cross-session assessment

- Requires ≥3 qualified `STABLE_SHADOW` sessions with `shadowGatePassed`
- Rolling median; max dominant session share 50%
- Max cross-session CV 3%; max intra-session CV 2%
- Zero M3 conflict sessions allowed
- Output: `BatteryAssessment` type `HV_CAPACITY_SHADOW`; `sohEligible: false`, `publicationEligible: false`

## Layer separation (mandatory)

```
raw M2 point → session median → cross-session assessment → SOH gate → publication (flag-gated)
```

Do not collapse these into a single "battery capacity" concept.

## Non-effects

- Shadow pipeline does **not** enable customer SOH publication by default
- M3 does **not** replace M2 as primary estimate
- SESSION_CHARGE_CAPACITY / GROSS_CAPACITY profile methods have **no** shadow compute path
