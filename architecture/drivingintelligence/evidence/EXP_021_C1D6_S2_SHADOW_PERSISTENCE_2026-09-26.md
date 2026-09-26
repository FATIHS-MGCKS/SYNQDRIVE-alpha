# EXP-021 C1D.6 — DI V0 shadow persistence (S2)

**Date:** 2026-09-26  
**Base main:** `6200be1f244d8b75259bc947a28ce16600db5e94`  
**Gate:** `C1D6_GATE_READY_FOR_PREMERGE_REVIEW` (storage only; no deploy / no prod migration).

## Scope

- Prisma models + migration `20260926193000_di_v0_shadow_persistence`
- `shadow-persistence/` repository + service (persist pre-computed S1 output only)
- Tests: schema validation, idempotency, validation guards, public API isolation; optional Postgres integration (`DI_V0_SHADOW_PERSISTENCE_INTEGRATION=1`)

## Out of scope

Runtime worker, BullMQ, DIMO fetch, customer controllers, legacy trip mutation, production migration execution.

## Idempotency

- **Run:** `sha256(tripId|sourceFamily|4 version fields|inputEvidenceVersion)` stored as `idempotency_key`; unique per `organization_id`.
- **Interval:** unique `(shadow_run_id, interval_start)`; batch `createMany({ skipDuplicates: true })`.

## Rollback (conceptual)

Drop `di_v0_shadow_intervals`, then `di_v0_shadow_runs` — no canonical trip columns touched.
