# Driving Intelligence — DI V0

## `core/` (C1D.5 S1)

Pure, deterministic kinematic evaluation for EXP-021 DI V0 shadow mode.

- **Input:** normalized position / R1 / native event observations (no provider payloads).
- **Output:** per-interval `DiV0IntervalSpeedResult` (+ pass-through native events).
- **No** Nest DI, Prisma, BullMQ, Redis, DIMO, or `process.env` in the computation path.

Entry point: `computeDiV0TripIntervals(input, { versions, calibration })`.

## `shadow-persistence/` (C1D.6 S2)

Isolated Postgres persistence for **pre-computed** DI V0 shadow outputs.

- Tables: `di_v0_shadow_runs`, `di_v0_shadow_intervals` (non-authoritative; FK to trip/org/vehicle only).
- **No** kinematic recompute, provider fetch, queue worker, or customer API exposure.
- Idempotency: unique `(organization_id, idempotency_key)` per run; unique `(shadow_run_id, interval_start)` per interval.
- Entry: `DiV0ShadowPersistenceService.persistCompletedRun({ identity, computeOutput, versions })`.
