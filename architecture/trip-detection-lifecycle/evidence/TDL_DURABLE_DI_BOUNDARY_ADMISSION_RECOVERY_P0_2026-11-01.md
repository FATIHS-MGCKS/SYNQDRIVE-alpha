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
- **Shadow strict read-only:** when writer is OFF, recovery performs no `INSERT`/`UPDATE`/`DELETE` (including scan cursor/carrier operational metadata on `vehicle_trips.raw_detection_meta`).
- **Scan fairness:** missing-admission lane capped via `computeMissingAdmissionScanCap` (reserves ≥8 keyset slots per 32-trip cap) so guarded missing rows cannot consume the entire batch; keyset cursor advances only from keyset lane when writer is ON.
- **Cursor:** single carrier row per vehicle (`diV0BoundaryAdmissionRecoveryCursorCarrierV1` + `scanCursor`); transactional `FOR UPDATE` writes; invalid cursor timestamps ignored; documented as operational metadata only (not boundary/admission fingerprints).
- Eligibility lower bound: `max(activationHorizon, now − lookbackHours)`; S4 org/vehicle allowlists; per-vehicle cap 32; global cap 64 per pass.
- PR #2293 partial-extension hook preserved as fast path; recovery independent of boundary-scanned trip ids.

## Metrics (bounded labels)

`synqdrive_trip_di_boundary_admission_recovery_*` — pass mode, candidates scanned, attempts, successes, guard codes, transient errors, oldest unadmitted age (**per-vehicle batch**, labels `vehicle_id` + `coverage=batch`; not emitted in shadow mode), pass duration.

## Activation write matrix (deploy without env changes)

| Path | Recovery `ACTIVATED_AT` | Recovery `WRITER` | Production writes on deploy |
|------|-------------------------|-------------------|-----------------------------|
| A. Partial extension direct hook (`tryReleaseAfterPartialTripBoundaryExtension`) | not required | not required | **Possible today** when reconciliation applies a committed partial extension (existing #2293 behavior unchanged) |
| B. Recovery shadow scan | required | OFF (default) | **No** admission writes; metrics/logs only |
| C. Recovery writer (`tryReleaseForTripTransactional` via sweeper) | required | ON (operator) | **Yes** — bounded `diV0BoundaryAdmissionV1` patches only |

Deploying this PR alone does **not** set activation or writer flags. Historical trips before activation horizon are never scanned for recovery.

## Validation

- Unit: `trip-di-boundary-admission-recovery.policy.unit.spec.ts`, `trip-di-boundary-admission-recovery.util.unit.spec.ts`, `trip-di-boundary-admission-recovery.cursor.unit.spec.ts`
- PostgreSQL (gated `S4A_POSTGRES_LIVE`): `trip-di-boundary-admission-recovery.postgres.integration.spec.ts`, `trip-di-boundary-admission-recovery.reliability.postgres.integration.spec.ts` (strict shadow DB diff, guarded-missing + **true stale revision** via committed `boundaryRepair` drift, S4 PRIMARY duplicate guard, cursor concurrency, keyset restart)

## Recovery scheduling coverage (read-only, repository)

Durable recovery runs in `TripReconciliationService.executeReconcileWindow` **`finally`** (every tier that reaches reconcile), bounded by recovery policy lookback (default 48h) and S4 org/vehicle allowlists when activated.

| Provider cohort | Representative vehicle | DIMO token (authority) | Recurring reconcile entry |
|-----------------|------------------------|-------------------------|---------------------------|
| Tiguan `RUPTELA_R1` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | **192922** (TDL P1B) | **Fast** when `vehicle_latest_state.lastSeenAt` or trip FSM activity within recency window; **Warm/Cold** when `vehicle_latest_state.dimo_token_id` is set (same gate as `getVehiclesWithDimoTokens`) |
| Audi A4 `RUPTELA_R1` | `c10351f8-b6a2-4258-947f-631aeaa6d359` | **187361** (KS MS 661 evidence) | Same as Tiguan |
| Tesla `API_SYNTHETIC` | link `805b271c-ba87-4776-9e39-23e24d595c53` / token **186946** (VO-SIG B1) | **186946** | **Warm/Cold** only if `vehicle_latest_state.dimo_token_id` is populated (scheduler does not filter on source family). **Fast** via recent `lastSeenAt`/FSM activity regardless of token. Additional non-scheduler entry: `reconcileAdmissionAfterFinalization` after trip finalize |

**Tesla gap (conditional):** If `vehicle_latest_state.dimo_token_id` is null while the DIMO link token exists, Tesla is excluded from warm/cold cohorts until VLS is backfilled; fast tier + post-finalize reconcile still invoke recovery when those paths run. Minimal correction before relying on warm/cold-only coverage: ensure snapshot/VLS writers persist `dimoTokenId` for API_SYNTHETIC-linked vehicles (no recovery-specific scheduler fork required).
