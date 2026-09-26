# Driving Intelligence — DI V0

## `core/` (C1D.5 S1)

Pure, deterministic kinematic evaluation for EXP-021 DI V0 shadow mode.

- **Input:** normalized position / R1 / native event observations (no provider payloads).
- **Output:** per-interval `DiV0IntervalSpeedResult` (+ pass-through native events).
- **No** Nest DI, Prisma, BullMQ, Redis, DIMO, or `process.env` in the computation path.

Entry point: `computeDiV0TripIntervals(input, { versions, calibration })`.
