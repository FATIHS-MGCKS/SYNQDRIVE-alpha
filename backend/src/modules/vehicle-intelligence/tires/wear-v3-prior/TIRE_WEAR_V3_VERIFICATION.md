# Tire Wear V3 — manual verification policy (P1)

## Purpose

Deterministic **per-wheel km + time** cadence for manual tread verification, attached to
`tire-wear-v3-prior-0.2.0` compute output only. Does **not** change V2
`TIRE_HEALTH_CONFIG.measurementFreshness`, alerts, or `TireHealthSummary`.

## Per-wheel cadence authority

For each wheel position (`FL`, `FR`, `RL`, `RR`):

1. Consider only **accepted** measurements that include a finite tread mm for that wheel.
2. Select the **latest** such row by `measuredAt` within the active mount period.
3. Compute `kmSince`, calendar-month age, `nextDueOdometerKm`, and `verificationStatus` from **that wheel’s anchor only**.

A partial measurement (e.g. FL-only) resets cadence **only** for wheels present on that row. Other wheels keep older anchors.

## Setup status aggregation

`verification.status` is the **maximum precedence** across wheel statuses:

`INSUFFICIENT_EVIDENCE` → `OVERDUE` → `DUE` → `DUE_SOON` → `CURRENT`

Tie-break among equal precedence: higher `kmSinceAcceptedMeasurement` wins. One `CURRENT` wheel cannot mask `OVERDUE` or `INSUFFICIENT_EVIDENCE` on another.

Top-level `acceptedMeasurement*` fields mirror the wheel that drives aggregated `status`.

## State machine (per wheel)

1. No mount period → all wheels `INSUFFICIENT_EVIDENCE` (setup flag `VERIFICATION_NO_ACTIVE_MOUNT_PERIOD`)
2. No accepted anchor for this wheel → `INSUFFICIENT_EVIDENCE` (`VERIFICATION_NO_ACCEPTED_ANCHOR`)
3. Rotation during mount period → `INSUFFICIENT_EVIDENCE` (`VERIFICATION_ROTATION_IDENTITY_UNVERIFIED`) — **no `CURRENT`**
4. Current odometer missing → `INSUFFICIENT_EVIDENCE`
5. `currentOdometer < wheelAnchorOdometer` → `INSUFFICIENT_EVIDENCE` (no clamp)
6. UTC calendar months since anchor `measuredAt` ≥ `timeFallbackMonths` → `OVERDUE`
7. Setup odometer quality flags block km cadence → `INSUFFICIENT_EVIDENCE` (month rule still wins)
8. Km thresholds: `overdueKm` / `dueKm` / `remindKm` → `OVERDUE` / `DUE` / `DUE_SOON`
9. Else → `CURRENT`

## Accepted verification measurement (≠ posterior calibration)

**Acceptance** (eligible to anchor **only wheels with tread on that row**):

- `evidenceSource` ∈ ground truth (`MANUAL_MEASUREMENT`, `WORKSHOP`, `DOCUMENT`, `MANUFACTURER`, `USER_CONFIRMED`) **after** verification-only legacy exclusions
- Legacy `source` not in `calibration`, `ai_estimate`, `ai_agent`, **`ai_confirmed`** (V3-only exclusion; V2 mapping unchanged)
- `odometer_at_measurement` finite
- `measuredAt` inside active mount period
- At least one wheel tread mm present

**Not accepted:** `AI_ESTIMATED`, `MODEL_ESTIMATED`, `DEFAULT_ASSUMPTION`, calibration projections, `ai_confirmed`.

**Posterior rate fusion** remains gated separately in `tire-wear-v3-prior.math` / lifecycle
(≥2 odometer points, span L2+, no rotation block, no contradictory series). Verification acceptance does **not** imply calibration.

## Rotation fail-closed

When `hasRotationDuringMountPeriod` is true, tire identity across positions is not trusted. Every wheel is `INSUFFICIENT_EVIDENCE` with `VERIFICATION_ROTATION_IDENTITY_UNVERIFIED`. Posterior rotation blocking in the wear path is unchanged.

## Defaults (`tire-wear-v3-verification.config.ts`)

| Field | Value |
|-------|------|
| remindKm | 4500 |
| dueKm | 5000 |
| overdueKm | 6000 |
| timeFallbackMonths | 6 |

Monotonic: `remindKm < dueKm < overdueKm`.

## Replacement / mount period

Measurements before mount `installedAt` are excluded (`filterMeasurementsForMountPeriod`).
