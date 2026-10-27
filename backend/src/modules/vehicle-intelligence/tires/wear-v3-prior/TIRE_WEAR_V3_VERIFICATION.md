# Tire Wear V3 — manual verification policy (P1)

## Purpose

Deterministic **km + time** cadence for manual tread verification, attached to
`tire-wear-v3-prior-0.2.0` compute output only. Does **not** change V2
`TIRE_HEALTH_CONFIG.measurementFreshness`, alerts, or `TireHealthSummary`.

## State machine (precedence)

1. No active mount period → `INSUFFICIENT_EVIDENCE`
2. No **accepted** ground-truth measurement (odometer + tread in period) → `INSUFFICIENT_EVIDENCE`
3. Current odometer missing → `INSUFFICIENT_EVIDENCE`
4. `currentOdometer < acceptedOdometer` → `INSUFFICIENT_EVIDENCE` (no clamp-to-zero)
5. **Calendar months** since accepted `measuredAt` ≥ `timeFallbackMonths` (UTC year/month) → `OVERDUE` (not suppressed by low km)
6. Setup odometer quality flags block km cadence → `INSUFFICIENT_EVIDENCE` (time rule above still wins)
7. `kmSinceAccepted ≥ overdueKm` → `OVERDUE`
8. `kmSinceAccepted ≥ dueKm` → `DUE`
9. `kmSinceAccepted ≥ remindKm` → `DUE_SOON`
10. Else → `CURRENT`

`kmSinceAccepted = currentOdometerKm − acceptedOdometerKm` (last accepted by `measuredAt`).

## Accepted verification measurement (≠ posterior calibration)

**Acceptance** (resets due interval when odometer valid):

- `evidenceSource` ∈ ground truth (`MANUAL_MEASUREMENT`, `WORKSHOP`, `DOCUMENT`, `MANUFACTURER`, `USER_CONFIRMED`)
- Legacy `source` not `calibration` / `ai_*`
- `odometer_at_measurement` finite
- `measuredAt` inside active mount period
- At least one wheel tread mm present

**Not accepted:** `AI_ESTIMATED`, `MODEL_ESTIMATED`, `DEFAULT_ASSUMPTION`, calibration projections.

**Posterior rate fusion** remains gated separately in `tire-wear-v3-prior.math` / lifecycle
(≥2 odometer points, span L2+, no rotation block, no contradictory series).

## Defaults (`tire-wear-v3-verification.config.ts`)

| Field | Value |
|-------|------|
| remindKm | 4500 |
| dueKm | 5000 |
| overdueKm | 6000 |
| timeFallbackMonths | 6 |

Monotonic: `remindKm < dueKm < overdueKm`.

## Per-wheel semantics

`wheels[].hasAcceptedVerification` = union of wheels with tread mm on any **accepted** row in the mount period (not “latest row only”).

## Rotation / replacement

- Measurements before mount `installedAt` excluded (replacement).
- `rotationDuringMountPeriod` adds `VERIFICATION_ROTATION_IDENTITY_UNVERIFIED` (does not auto-reset cadence; rate fusion still blocked in wear path).
