# TDL — Durable DI boundary admission recovery (Fable P0 implementation)

Date: 2026-11-01 (UTC)  
Workstream: `TRIP_LIFECYCLE_P0_DURABLE_ADMISSION_RECOVERY` (extends PR #2293 branch)  
Production activation: **OFF** (no env changes in this PR)

## Problem

Eligible `COMPLETED` trips can remain without `diV0BoundaryAdmissionV1` when direct finalize/reconciliation hooks are skipped (e.g. LIVE_FSM gap-split parent + CANCELLED suffix). No bounded eventual-consistency path existed.

## Solution (Alternative B)

- `TripDiBoundaryAdmissionService.runDurableAdmissionRecoveryPass` — bounded SQL candidate scan + `tryReleaseForTripTransactional` (FOR UPDATE, revision-bound).
- Invoked from existing `TripReconciliationService.executeReconcileWindow` after LIVE_FSM window release (same leader-controlled reconciliation scheduler; no new poller).
- Fail-closed activation: `TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC` must be set explicitly; writer `TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_WRITER_ENABLED` defaults false (shadow observe logs/metrics only).
- Eligibility lower bound: `max(activationHorizon, now − lookbackHours)`; S4 org/vehicle allowlists; per-vehicle cap 32; global cap 64 per pass.
- PR #2293 partial-extension hook preserved as fast path; recovery independent of boundary-scanned trip ids.

## Metrics (bounded labels)

`synqdrive_trip_di_boundary_admission_recovery_*` — pass mode, candidates scanned, attempts, successes, guard codes, transient errors, oldest unadmitted age, pass duration.

## Historical trips

Pre-activation trips (e.g. Tiguan `2245f107…`) are **not** auto-recovered by design; require separate operator approval and eligibility.

## Validation

- Unit: `trip-di-boundary-admission-recovery.policy.unit.spec.ts`, `trip-di-boundary-admission-recovery.util.unit.spec.ts`
- PostgreSQL (gated `S4A_POSTGRES_LIVE`): `trip-di-boundary-admission-recovery.postgres.integration.spec.ts`
