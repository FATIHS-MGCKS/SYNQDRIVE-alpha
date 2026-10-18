# G5C-N14 — LV operational condition intelligence V1 (backend)

Production reference SHA: `d43ff450a0831be4072f6b1b5c687b5ac88f0a7b` (read-only forensics only).

## Scope

- Internal, non-authoritative LV operational condition estimator (`evaluateLvOperationalConditionV1`).
- N13 read-model semantics fix: `latestMeasured` = vehicle-global newest; historical window tail exposed separately.
- No customer publication, no SOH %, no E3/F6 activation, no C3/D3 recompute, no production writes.

## Production evidence (read-only, org `faa710c9-6d91-4079-a7d5-91fdccdec14a`)

### KS MS 661 (`c10351f8-b6a2-4258-947f-631aeaa6d359`)

| Field | Value |
|--------|--------|
| Verified chemistry | **AGM** (`VehicleBatterySpec`, MANUAL, confidence 1.0) |
| Nominal | 12 V, 70 Ah |
| GE voltage rows | 2233 |
| PARKED_REST_CANDIDATE | 30 |
| Open provider gaps | 0 |
| Latest global voltage | 14.685 V @ 2026-10-17T17:10:38Z, `ACTIVE_VEHICLE_CONTAMINATED`, **LV charging** |
| Eligible rest sample (≤200, not charging) | 30 rows; **24** with rest age ≥ 1 h |
| Rest voltage (parked, ≥1 h) | min 11.956 V, median **12.506 V**, max 13.065 V |
| Temperature on GE rows | **0** in sample |
| REST_WAKE / startability | **0** wake observations in sample |

### WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`)

| Field | Value |
|--------|--------|
| Verified chemistry | **Lead-Acid** (`VehicleBatterySpec`, MANUAL, confidence 1.0) |
| Nominal | 12 V, 60 Ah |
| GE voltage rows | 2051 |
| PARKED_REST_CANDIDATE | 54 |
| Open provider gaps | **1** |
| Latest global voltage | 14.563 V @ 2026-10-17T14:46:56Z, `CHARGING_CONTAMINATED`, **LV charging** |
| Eligible rest sample | 54 rows; **42** with rest age ≥ 1 h |
| Rest voltage (parked, ≥1 h) | min 12.032 V, median **12.556 V**, max 12.76 V |
| Temperature on GE rows | **0** in sample |
| REST_WAKE | **0** in sample |

Chemistry is taken from `VehicleBatterySpec` only — not inferred from vehicle model.

## N13 semantics correction

- `latestMeasured` always from global `findFirst` (newest `voltageObservedAt`).
- Date-range mode: `historicalMeasured` ascending after dedup; `provenance.historicalWindowLatestMeasured` = last point in window (not global latest).
- `provenance.inputCoverageIncomplete` when historical cap hit or open provider gaps.

## Model P1 (`LV_OPERATIONAL_CONDITION_V1_P1_2026-10-17`)

- **Separated outputs:** `restingVoltageBand`, `restingChargeBand` (coarse, no % SoC), `operationalRiskStatus`, `dataQuality`, `assessmentConfidence`, `actualStateOfHealth` (always UNKNOWN).
- Resting bands: `classifyRestingVoltage` in `battery-status.ts` (AGM vs DEFAULT lead-acid/EFB) — documented via `chemistry.restingThresholdAuthority`.
- Provider gaps / truncated history affect **data quality** and **confidence**, not voltage-derived operational risk.
- Charging/driving excluded; episode representatives (one per `restSessionId`) for risk; dedup by `sourceMeasurementId`.
- Startability: **UNKNOWN** unless validated pre-start rest + load signature in same session; REST_WAKE alone never GREEN.
- No pseudo SoC % (removed 90/70/45/20 mapping).

### Revised offline evaluation (episode-median logic aligned with P1)

| Vehicle | Resting band | Operational risk | Data quality | Confidence | Startability | SOH |
|---------|--------------|------------------|--------------|------------|--------------|-----|
| KS MS 661 | WATCH (AGM ~12.506 V median) | **YELLOW** | DEGRADED (no temp on GE rows; manual spec note) | LOW/MEDIUM | **UNKNOWN** | UNKNOWN |
| WOB L 7503 | GOOD (lead-acid ~12.556 V median) | **GREEN** | **DEGRADED** (open provider gap; manual spec note) | LOW | **UNKNOWN** | UNKNOWN |

Manual `VehicleBatterySpec` (confidence 1.0) is **not** treated as independent physical verification (`MANUAL_BATTERY_SPEC_NOT_PHYSICALLY_VERIFIED`).

## Adversarial cases (unit tests)

- 13.733 V while charging → excluded, risk UNKNOWN.
- Context-limited slopes −14170.9 / −23720.5 mV/h → `CONTEXT_LIMITED_SLOPE_ONLY`, no RED escalation.
- Provider gap + truncated history → reason codes set.
- Unknown chemistry → UNKNOWN.
- Short rest age → `REST_AGE_TOO_SHORT`.

## Harness

`backend/scripts/ops/lv-operational-condition-evaluation-readonly.ts` (read-only, uses N13 read model + Prisma).
