# RFRF F6 — Canonical G2 rawDetectionMeta payload compatibility

**Date:** 2026-09-15  
**Branch:** `cursor/eed-rfrf-f6-g2-payload-compatibility-f21f`  
**Base:** `main` @ `4f21c0c167bd3ee87c1691016b12ee5d94ad44fd` (post PR #1651 F5-PR3.1)

## Scope

F6 closes the persisted fallback `VehicleEnergyEvent.rawDetectionMeta` contract gap so promoted RFRF events expose the **same canonical fuel-transition keys** consumed by `vehicleEnergyEventToRefuelRow()` as native DIMO events — without G2 special-casing or a second reconciliation stack.

F5-PR3 already delivered post-commit G2 handoff, authority conjunction, recovery bypass protection, and late-native runtime proofs. F6 does **not** rebuild those paths.

| Phase | Responsibility |
|-------|----------------|
| F5 | Convergence + promotion + post-commit G2 execution |
| F6 | Canonical persisted fallback VEE payload compatibility |

## Primary gap (confirmed on main)

Before F6, `mapRawRefuelCandidateToPromotionDraft()` wrote RFRF-only keys (`preFuelAbsoluteLiters`, `postFuelAbsoluteLiters`, …) but **not** canonical G2 keys (`fuelStartLiters`, `fuelEndLiters`, `fuelStartPercent`, `fuelEndPercent`). Native DIMO persistence and `physical-refuel-row.mapper.ts` consume only the canonical keys.

## Implementation

Single owner: `buildFallbackRawDetectionMeta()` in `fallback-raw-detection-meta.mapper.ts`.

| Canonical G2 contract | Source (RawRefuelCandidate) |
|-----------------------|----------------------------|
| `fuelStartLiters` | `preFuelAbsoluteLiters` |
| `fuelEndLiters` | `postFuelAbsoluteLiters` |
| `fuelStartPercent` | `preFuelRelativePercent` |
| `fuelEndPercent` | `postFuelRelativePercent` |

RFRF provenance retained: `rawRefuelCandidateId`, `candidateIdentityKey`, `evidenceRevisionFingerprint`, `signalChannel`, `detectorVersion`, plus aligned `preFuel*` / `postFuel*` aliases derived from the same values (must never diverge).

No Prisma schema change. No G2 mapper changes. No scientific/threshold/coordinate/BullMQ changes.

## Detection mechanism audit

| Field | Value |
|-------|-------|
| CURRENT_FALLBACK_DETECTION_MECHANISM | `raw_fuel_fallback` |
| HISTORICAL_CONTRACT_DIFFERS | YES — F1 doc proposed `synqdrive_raw_fuel_fallback` |
| RUNTIME_CONSUMERS_DEPEND_ON_EXACT_STRING | NO — consumers pass through `detectionMechanism`; discrimination uses `detectionSource=SYNQDRIVE_RAW_FUEL_FALLBACK` |
| DETECTION_MECHANISM_CHANGE_REQUIRED | NO |

## F1 stationary dwell metadata audit

| Field | Value |
|-------|-------|
| F1_STATIONARY_DWELL_META_REQUIREMENT | SUPERSEDED_BY_G2_COORDINATE_RUNTIME |
| G2_COORDINATE_RUNTIME_REMAINS_AUTHORITATIVE | YES |

Original F1 discussed `LAST_RELEVANT_STATIONARY_DWELL_BEFORE_RISE` for coordinate selection. G2 now owns mature coordinate runtime route evidence. RFRF detector does not possess bounded stationary-dwell evidence suitable for fabrication — not added in F6.

## Real PostgreSQL gate

Script: `backend/scripts/test/rfrf-f6-g2-payload-compatibility-gate.sh`  
Env: `RAW_FUEL_REFUEL_F6_INTEGRATION=1`, `RAW_FUEL_REFUEL_F6_POSTGRES_REQUIRED=1`  
Isolated DB: `rfrf_f6_*` on localhost only.

| Case | Status |
|------|--------|
| F6-P1 absolute-only canonical meta + G2 row mapper | PASS |
| F6-P2 fallback + native SAME (persisted PG rows) | PASS |
| F6-P3 fallback + native DISTINCT | PASS |
| F6-P4 insufficient fail-closed | PASS |
| F6-P5 fallback-first native-later SAME — one enrichment owner | PASS |
| F6-P6 native-first convergence — zero fallback VEE | PASS |
| F6-P7 absolute-only + native sparse percent — SAME on liters | PASS |
| F6-P8 relative percent mapping preserved | PASS |
| F6-P9 missing optional percent stays null | PASS |
| F6-P10 ALREADY_PROMOTED replay — meta stable | PASS |

**Gate result:** 11/11 PASS (0 required skips)

## Closure flags

| Flag | Value |
|------|-------|
| PRISMA_SCHEMA_CHANGED | NO |
| NEW_MIGRATION_REQUIRED | NO |
| G2_HANDOFF_REIMPLEMENTED | NO |
| FALLBACK_CANONICAL_META_FUEL_START_LITERS | YES |
| FALLBACK_CANONICAL_META_FUEL_END_LITERS | YES |
| FALLBACK_CANONICAL_META_FUEL_START_PERCENT | YES |
| FALLBACK_CANONICAL_META_FUEL_END_PERCENT | YES |
| RFRF_PROVENANCE_META_PRESERVED | YES |
| CANONICAL_AND_PROVENANCE_VALUES_CAN_DIVERGE | NO |
| MANUAL_TEST_ROW_PATCH_REQUIRED | NO |
| PRODUCTION_MUTATED | NO |
| F6_COMPLETE | YES (pending CI on final HEAD) |
| F7_START_AUTHORIZED_AFTER_MERGE | NO (await merge + explicit authorization) |

## Distinction from F5

F5-PR3 proved post-commit G2 handoff and late-native runtime behavior assuming fallback rows would participate in G2 identity. F6 ensures the **persisted metadata contract** makes that participation work through the standard row mapper without test-side row mutation.
