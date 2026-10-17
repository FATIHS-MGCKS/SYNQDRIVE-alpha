# LDI02 — Ruptela Multi-Signal Fusion Feasibility (GPS-L3-First)

**HEAD:** `dfa6d2af98a8bd32a38fcf1528ddc088c23a8327` · **Mode:** read-only architecture amendment · **No production changes**

## Owner rules (LDI-02)

### Path A — Software-only / Tesla

- **GPS-L3/QC** remains primary motion reference.
- Additional HF/EV signals only if availability, cadence, and quality are **proven** per trip pin.
- **No** assumed OBD or pedal signals.

### Path B — Ruptela R1

Evaluate **together** (not HF-only or native-only):

1. GPS-L3/QC reconstruction
2. Ruptela native `behavior.*` events
3. R1 OBD five-field subset
4. R1 1 Hz HF stream

GPS-L3 is the **primary reference candidate** — not a mandate to ignore better-resolved evidence when pinned.

## Epistemic output classes

| Class | Use |
|-------|-----|
| `ACCELERATION_OBSERVED` | Trusted L3 Δv/Δt or corroborated HF segment |
| `DECELERATION_OBSERVED` | Same |
| `BRAKE_ACTUATION_CONFIRMED` | Requires pedal/switch — **unsupported** in current pins |
| `NATIVE_BRAKING_EVENT_REPORTED` | DIMO `behavior.harsh*` / `extreme*` — **not** physical GT |
| `REGEN_CONFIRMED` | HF positive traction power while moving — **not** SOC/GPS decel alone |
| `UNKNOWN` | Gaps, conflict, or sparse OBD |

## Evidence matrix

| Dimension | GPS-L3/QC | R1 OBD | HF 1 Hz | Native behavior | Path A (Tesla) | Path B (Ruptela) |
|-----------|-----------|--------|---------|-----------------|----------------|------------------|
| Timestamp alignment / clock drift | 1s calendar bucket labels; pinned snapshot acquisition window | INTERVAL_ONLY; R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN (r1-temporal-containment.ts) | DIMO query interval 1s — observed spacing variable (CURRENT_STATE.md) | providerTimestamp = DrivingEvent.recordedAt; wallet source metadata | POSITION pin only — no R1/native clock cross-check on 186946 pin | Must align four streams on bucket grid + native event windows |
| Sampling cadence | ~1 label/s when POSITION PRESENT | Sparse vs trip length (e.g. 109/1090 numeric OBD buckets on f502a4a0) | Requested 1 Hz; not guaranteed | Event-based (sparse) | L3 trusted numeric 775/1136 on dev pin | Cannot treat HF as full-trip coverage when OBD buckets << shadow count |
| GPS/OBD speed agreement | Primary L3 estimate | Corroboration band max(5 km/h, 10% L3) | HF speedKmh separate channel | No speed in native event payload (classification only) | N/A — R1 channel NOT_APPLICABLE on frozen pin | QC sets r1CorroboratesL3; conflict → UNTRUSTED or CONFLICTING relation |
| HF vs L3 acceleration agreement | Leg-implied m/s from ±1s positions + QC accel cap | Not direct accel — derived from speed deltas in HF path only | hf-acceleration.ts / hf-braking.ts on clean HF segments | Independent severity class — no m/s² ground truth | HF schema exists; not in EXP021 S4 pin — prove before use | Dedupe: HF kinematic events vs native harsh* in ±2s window (design) |
| Native event temporal overlap | No native channel on Tesla pin | Orthogonal | May coincide — risk double count | Max claim L1 UNCALIBRATED (native-event-evidence) | DISABLED in channel manifest | Classify as NATIVE_BRAKING_EVENT_REPORTED not BRAKE_ACTUATION_CONFIRMED |
| Missing signal behavior | ROW_ABSENT → abstention; no interpolation | ROW_ABSENT / SIGNAL_NULL per S3B | INSUFFICIENT_POINTS skip in enrichment | Empty read ≠ proof of no event | 269 ROW_ABSENT on Tesla pin | 24deb8af ~52% present — fusion must degrade to UNKNOWN |
| Regeneration | DECELERATION_OBSERVED only | No regen field in R1 OBD V0_3 | tractionBatteryPowerKw + hf-recuperation integration | Not regen-specific | Not in frozen pin | REGEN_CONFIRMED only with HF power series + speed gate |

### Code paths (fusion-related)

- `backend/src/modules/vehicle-intelligence/r1-temporal-containment.ts` (Timestamp alignment / clock drift)
- `backend/src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo.ts` (Timestamp alignment / clock drift)
- `architecture/.../PER_TRIP_GAP_EVENTS.json trip f502a4a0` (Sampling cadence)
- `architecture/drivingintelligence/CURRENT_STATE.md § cadence` (Sampling cadence)
- `backend/.../speed-qc/evaluate-di-v0-speed-qc-interval.ts` (GPS/OBD speed agreement)
- `backend/.../core/claims/cross-source-relation.ts` (GPS/OBD speed agreement)
- `backend/src/modules/vehicle-intelligence/trips/hf-acceleration.ts` (HF vs L3 acceleration agreement)
- `backend/.../native-event-evidence/di-v0-native-event-evidence.types.ts` (Native event temporal overlap)
- `backend/src/modules/dimo/queries/driving-events.query.ts` (Native event temporal overlap)
- `EXP021 P22E baseline` (Missing signal behavior)
- `PER_TRIP_GAP_EVENTS.json 24deb8af` (Missing signal behavior)
- `backend/src/modules/vehicle-intelligence/trips/hf-recuperation.ts` (Regeneration)

## Temporal examples (repository evidence)

### Synthetic QC corroboration (unit contract)

```json
{
  "note": "From unit-test contract (not a production trip export)",
  "centerBucket": "2030-01-01T00:05:00Z",
  "l3SpeedKmh": 80,
  "r1SpeedKmh": 80,
  "expected": "r1CorroboratesL3=true → elevated leg speed cap (evaluate-di-v0-speed-qc-interval)",
  "epistemicClass": "ACCELERATION_OBSERVED or DECELERATION_OBSERVED only after contiguous trusted L3"
}
```

### Ruptela `f502a4a0…` (transferability export)

```json
{
  "tripId": "f502a4a0-02d2-421d-bb39-7c9af25ba38e",
  "presentFraction": 0.9963302752293578,
  "shadowIntervals": 1090,
  "r1ObdNumericBuckets": 109,
  "cadenceNote": "OBD numeric ~10% of shadow seconds — HF-only or native-only views are incomplete",
  "exampleGap": {
    "eventId": "GAP_EVT_001",
    "windowUtc": {
      "from": "2026-10-14T19:04:00Z",
      "to": "2026-10-14T19:04:03Z"
    },
    "gapDurationSec": 4,
    "classification": "NOT_DISTINGUISHABLE",
    "decisiveFeatures": [
      {
        "feature": "legOutOfGapKmh",
        "value": null,
        "role": "calendar leg 2026-10-14T19:04:04Z→2026-10-14T19:04:05Z"
      }
    ],
    "supportingAndContradicting": [],
    "metrics": {
      "endpointDisplacementM": null,
      "impliedChordKmh": null,
      "legIntoGapKmh": null,
      "legOutOfGapKmh": null,
      "legIntoGapClass": null,
      "legOutOfGapClass": "INCONCLUSIVE_SCATTER",
      "distantBeforeMeanKmh": null,
      "distantAfterMeanKmh": null
    },
    "anomalyFlags": [
      "LOW_CONFIDENCE_CLASSIFICATION"
    ]
  },
  "fusionRead": "UNKNOWN during 4s POSITION gap; native/HF must not fill without pinned samples"
}
```

### Ruptela `24deb8af…` (sparse POSITION)

```json
{
  "tripId": "24deb8af-d9fd-4341-8b10-1b43fca70e52",
  "presentFraction": 0.5243243243243243,
  "positionAbsent": 88,
  "fusionRead": "GPS-L3 primary but frequently absent — dynamic priority must fall back to UNKNOWN not HF guess",
  "exampleGaps": [
    {
      "eventId": "GAP_EVT_001",
      "windowUtc": {
        "from": "2026-10-13T18:13:04Z",
        "to": "2026-10-13T18:13:15Z"
      },
      "gapDurationSec": 12,
      "classification": "LIKELY_HALT",
      "decisiveFeatures": [
        {
          "feature": "endpointChordM",
          "value": 0,
          "role": "gap endpoints (calendar-adjacent present)"
        },
        {
          "feature": "gapDurationSec",
          "value": 12,
          "role": "ROW_ABSENT span"
        },
        {
          "feature": "impliedChordKmh",
          "value": 0,
          "role": "average over gap — not standstill duration"
        },
        {
          "feature": "legIntoGapKmh",
          "value": null,
          "role": "calendar leg 2026-10-13T18:13:02Z→2026-10-13T18:13:03Z"
        },
        {
          "feature": "legOutOfGapKmh",
          "value": null,
          "role": "calendar leg 2026-10-13T18:13:16Z→2026-10-13T18:13:17Z"
        }
      ],
      "supportingAndContradicting": [
        {
          "tier": "NEUTRAL",
          "text": "Chord-implied 0.0 km/h averages displacement over entire 12s gap — compatible with halt+departure inside gap.",
          "epistemic": "INFERRED"
        },
        {
          "tier": "SUPPORTS",
          "text": "Small endpoint chord 0.0 m across 12s gap.",
          "epistemic": "INFERRED"
        }
      ],
      "metrics": {
        "endpointDisplacementM": 0,
        "impliedChordKmh": 0,
        "legIntoGapKmh": null,
        "legOutOfGapKmh": null,
        "legIntoGapClass": "INCONCLUSIVE_SCATTER",
        "legOutOfGapClass": "INCONCLUSIVE_SCATTER",
        "distantBeforeMeanKmh": null,
        "distantAfterMeanKmh": null
      },
      "anomalyFlags": []
    },
    {
      "eventId": "GAP_EVT_002",
      "windowUtc": {
        "from": "2026-10-13T18:14:44Z",
        "to": "2026-10-13T18:15:50Z"
      },
      "gapDurationSec": 67,
      "classification": "LIKELY_HALT",
      "decisiveFeatures": [
        {
          "feature": "endpointChordM",
          "value": 4.4147239556702464,
          "role": "gap endpoints (calendar-adjacent present)"
        },
        {
          "feature": "gapDurationSec",
          "value": 67,
          "role": "ROW_ABSENT span"
        },
        {
          "feature": "impliedChordKmh",
          "value": 0.2,
          "role": "average over gap — not standstill duration"
        },
        {
          "feature": "legIntoGapKmh",
          "value": null,
          "role": "calendar leg 2026-10-13T18:14:42Z→2026-10-13T18:14:43Z"
        },
        {
          "feature": "legOutOfGapKmh",
          "value": null,
          "role": "calendar leg 2026-10-13T18:15:51Z→2026-10-13T18:15:55Z"
        }
      ],
      "supportingAndContradicting": [
        {
          "tier": "NEUTRAL",
          "text": "Chord-implied 0.2 km/h averages displacement over entire 67s gap — compatible with halt+departure inside gap.",
          "epistemic": "INFERRED"
        },
        {
          "tier": "SUPPORTS",
          "text": "Small endpoint chord 4.4 m across 67s gap.",
          "epistemic": "INFERRED"
        },
        {
          "tier": "NEUTRAL",
          "text": "Distant approach context mean leg 4.6 km/h (not gap-edge).",
          "epistemic": "INFERRED"
        },
        {
          "tier": "NEUTRAL",
          "text": "Distant depart context mean leg 47.6 km/h (includes post-halt driving).",
          "epistemic": "INFERRED"
        }
      ],
      "metrics": {
        "endpointDisplacementM": 4.4147239556702464,
        "impliedChordKmh": 0.23720904836437146,
        "legIntoGapKmh": null,
        "legOutOfGapKmh": null,
        "legIntoGapClass": "INCONCLUSIVE_SCATTER",
        "legOutOfGapClass": "INCONCLUSIVE_SCATTER",
        "distantBeforeMeanKmh": 4.578822544540788,
        "distantAfterMeanKmh": 47.61203866258911
      },
      "anomalyFlags": []
    }
  ]
}
```

### Tesla Path A (`186946` / EXP021 pin)

```json
{
  "tripId": "358d0158-b2a9-47ed-af26-33926c5770b4",
  "channels": "POSITION only; NATIVE_EVENT off; R1 N/A",
  "exampleDecelWindow": {
    "from": "2026-10-16T03:41:42Z",
    "to": "2026-10-16T03:41:47Z",
    "class": "DECELERATION_OBSERVED from video tacho only (dev)"
  },
  "regen": "UNKNOWN — no HF power in pin"
}
```

## Dynamic source prioritization (recommendation — design only)

1. **Tier 0 — Kinematic truth surface:** `TRUSTED` / `TRUSTED_LIMITED` L3/QC per bucket (no interpolation across `ROW_ABSENT`).
2. **Tier 1 — Corroboration:** R1 OBD speed at same calendar label **only if** `r1CorroboratesL3` and not `R1_INTERVAL_ONLY`.
3. **Tier 2 — HF kinematics:** `hf-acceleration` / `hf-braking` on clean HF runs; label `ACCELERATION_OBSERVED` / `DECELERATION_OBSERVED`; downgrade when cadence gaps >5s.
4. **Tier 3 — Native provider:** Map to `NATIVE_BRAKING_EVENT_REPORTED` / harsh accel analog; **max claim L1**; dedupe against Tier 2 within ±2s.
5. **Tier 4 — Regen:** `REGEN_CONFIRMED` only when HF `tractionBatteryPowerKw` integrated per `hf-recuperation.ts` rules; else `UNKNOWN`.
6. **Conflict rule:** If R1 disagrees beyond `r1Disagrees` threshold or `CONFLICT_EXPLAINED` relation → withhold numeric promotion; do not auto-pick HF.
7. **Double-count guard:** One physical maneuver → at most one kinematic event + optional native report flag (metadata), not duplicate stress counters.

## Path A vs B summary

| | Tesla software | Ruptela R1 |
|---|----------------|------------|
| Primary | L3/QC POSITION pin | L3/QC + mandatory multi-stream review |
| Native events | Off on EXP021 pin | Ingested (`lte-r1-behavior-enrichment`) |
| OBD | N/A | Sparse vs shadow — fusion required |
| Regen | Prove HF power first | Same |

## Explicit non-goals (LDI-02)

- No new production fusion worker
- No harsh threshold tuning
- No provider API calls in this document run
