# Brakes Health — Current State (bootstrap)

**Registry:** `AUDIT_IN_PROGRESS` (PR-0, 2026-10-28)  
**Epistemic:** INFERRED from code pointers only — **not** Production-validated in this slice.

## Scope (inventory)

- Services under `backend/src/modules/vehicle-intelligence/brakes/`
- `BrakeHealthService.recalculate`, `brake-recalculation-input.loader.ts`
- Reads `TripDrivingImpact` with `analysisStatus IN (COMPLETE, PARTIAL)` and R1 `containFullBrakingRate`
- Triggered via `DRIVING_HEALTH_IMPACT_PUBLISH` after Driving Impact compute

## DS4 migration touchpoint

Per [`DI-DEC-DS4-AUTHORITY-001`](../drivingintelligence/decisions/DECISION_REGISTER.md), brake wear inputs will consume **Driving Impact V2** rows with `scoreAuthority=DS4` only after **PR-8** and cutover gates. Until then, legacy Impact V1 remains authoritative for brakes.

## Unknown / deferred

- Production table counts, scheduler leader behavior, fleet-scale recalc latency — **UNKNOWN** (Production audit not run).
