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

## Model V1 (`LV_OPERATIONAL_CONDITION_V1_2026-10-17`)

- Statuses: `GREEN` | `YELLOW` | `RED` | `UNKNOWN`.
- Resting voltage bands reuse `classifyRestingVoltage` with spec-aware chemistry (AGM / EFB / lead-acid).
- Charging/driving observations excluded; context-limited C3 slopes do not escalate risk.
- SOC: coarse band from rest voltage only where chemistry supports it; lithium/unknown → `NOT_EVALUABLE`.
- SOH: always `UNKNOWN`.

### Provisional operational risk (offline evaluation on medians above)

| Vehicle | Provisional risk | Notes |
|---------|------------------|--------|
| KS MS 661 | **YELLOW** | AGM median rest 12.506 V → WATCH band; latest global point is charging (excluded from rest risk) |
| WOB L 7503 | **YELLOW** | Median rest 12.556 V would be GREEN for lead-acid, but open provider gap + incomplete-coverage policy avoids unconditional GREEN |

Startability: **UNKNOWN** (no REST_WAKE in bounded samples).

## Adversarial cases (unit tests)

- 13.733 V while charging → excluded, risk UNKNOWN.
- Context-limited slopes −14170.9 / −23720.5 mV/h → `CONTEXT_LIMITED_SLOPE_ONLY`, no RED escalation.
- Provider gap + truncated history → reason codes set.
- Unknown chemistry → UNKNOWN.
- Short rest age → `REST_AGE_TOO_SHORT`.

## Harness

`backend/scripts/ops/lv-operational-condition-evaluation-readonly.ts` (read-only, uses N13 read model + Prisma).
