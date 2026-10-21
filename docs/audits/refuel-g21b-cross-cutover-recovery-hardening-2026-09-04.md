# G2.1b Physical Refuel Cross-Cutover + Recovery Hardening — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531 (DRAFT)  
**G2.1a head (before G2.1b):** `1064e69efe0d197d1db14ecbf71303ea4294259b`

## Executive verdict

| Gate | Value |
|------|-------|
| **G2_1B_CROSS_CUTOVER_RECOVERY_HARDENING** | PASS |
| **G2_2_SHADOW_ROLLOUT_AUTHORIZED** | YES (shadow only; flag default OFF) |
| **MULTI_REPLICA_DB_LOCK_PROVEN** | YES (isolated local PostgreSQL 16) |

## Clock domains (explicit authority)

| Clock | Authority | Used for |
|-------|-----------|----------|
| **OBSERVATION** | `VehicleEnergyEvent.createdAt` | V2 ownership, settlement `firstObservedAt`, V2 enqueue eligibility |
| **EVENT** | `VehicleEnergyEvent.startTime` | Legacy fuel-station cutover only |
| **V2 OWNERSHIP** | `PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT` → `FUEL_STATION_ENRICHMENT_CUTOVER_AT` | `createdAt >= cutover` → V2_OWNED |
| **LEGACY ENRICHMENT** | `FUEL_STATION_ENRICHMENT_CUTOVER_AT` + `event.startTime` | Legacy producer path only |

V2 producer path uses **observation-time** cutover (`eventObservedAt`), not provider `startTime`.

## Blockers closed

| Blocker | Fix |
|---------|-----|
| B1 Cross-cutover ownership leak | V2 candidates restricted to `createdAt >= cutover`; legacy rows bridge-only |
| B2 Semantic reconciliation requires token | Reconciliation phase DB-only; token required only for coordinate resolution |
| B3 Cutover clock mismatch | V2 producer skips legacy `startTime` gate; uses `eventObservedAt` |
| B4 Orphan query unbounded | `computeOrphanCreatedAtRange`: `max(cutover, lookback) .. asOf` |
| B5 Coordinate hold hot loop | `coordinateRetryCount`, `nextCoordinateRetryAt`, fair recovery quotas |
| B6 Context failure silent | `physical_refuel_recovery_context_hold` structured log |
| B7 PG lock proof | Executed on isolated `synqdrive_g21b_test` database |
| B8 Enqueue crash window | BullMQ deterministic job id dedupe test (B8) |
| B9 One-way ownership | `LEGACY_OWNED` never enters V2 candidate set; no implicit transition |

## Ownership model

- **LEGACY_OWNED**: `createdAt < v2OwnershipCutoverAt` — never V2 reconciliation member
- **V2_OWNED**: `createdAt >= cutover` — only current reconciliation candidates
- **BRIDGE_HISTORY**: pre-cutover enriched legacy within identity bridge — prior-final evidence only

## Coordinate retry lifecycle

```
FINAL_* + enrichmentEligible
  → coordinate attempt (requires token + DIMO route)
  → SELECTED → enqueue
  → RETRYABLE HOLD → nextCoordinateRetryAt + exponential backoff
  → TERMINAL (MISSING_FUEL_RISE_ONSET, NO_DWELL_FOUND, etc.) → no hot-loop
```

Recovery priorities (fair quotas): settlement_due → orphan_refuel → lost_enqueue (coords ready) → coordinate_retry (due).

## PostgreSQL concurrency evidence

```
DATABASE_URL=postgresql://synqdrive_test:***@localhost:5432/synqdrive_g21b_test
PHYSICAL_REFUEL_RECONCILIATION_POSTGRES_INTEGRATION=1
→ 2 passed (same-vehicle serialization, different-vehicle parallelism)
```

**Not production database.** Isolated test DB created for this run only.

## Migration

`20260904160000_physical_refuel_g21b_coordinate_retry` — additive columns + index on `next_coordinate_retry_at`. Not executed in production.

## Test evidence

```
physical-refuel + producer + recovery + energy-events-g21: 17 suites, 150+ passed
PostgreSQL integration: 2 passed (not skipped)
build: PASS
FST + EED validators: PASS
```

## Remaining risks

- Coordinate retry backoff tuning under production load not validated
- Fair recovery quotas may need ops adjustment at fleet scale
- Shadow rollout still requires ops monitoring of `coordinateRetryDue` backlog

## Evidence nodes

- `FST-EVID-G21B-CROSS-CUTOVER-RECOVERY-HARDENING-2026-09-04-001`
- `EED-EV-0034`
