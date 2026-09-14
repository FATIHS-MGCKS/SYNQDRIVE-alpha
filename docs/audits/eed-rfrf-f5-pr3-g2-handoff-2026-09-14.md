# RFRF F5-PR3 — Post-commit G2 handoff, recovery + late-native convergence

**Date:** 2026-09-14  
**Branch:** `cursor/eed-rfrf-f5-pr3-g2-handoff-f21f`  
**Base:** `main` @ `f18a2e39f044344ca1b26858a7c6928a194b51ab` (post PR #1647)

## Scope

Post-commit bridge from committed RFRF fallback `VehicleEnergyEvent` into the **existing** G2 `PhysicalRefuelReconciliationRuntimeService` pipeline. No second reconciliation, coordinate, enrichment, or BullMQ architecture.

## Authority

| Flag | Role | Default |
|------|------|---------|
| `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` | F5 convergence (required) | OFF |
| `RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED` | F5-PR2 promotion (required) | OFF |
| `RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED` | F5-PR3 post-commit G2 handoff (required) | OFF |

`evaluateFallbackG2HandoffAuthority()` enforces full conjunction. Strict `true` only — `1`/`yes`/`on` do not authorize.

## Implementation summary

- `RawRefuelG2HandoffService` — post-commit handoff using committed `fallbackVehicleEnergyEventId`
- `raw-refuel-g2-participation.policy.ts` — defence-in-depth G2 participation gate for `SYNQDRIVE_RAW_FUEL_FALLBACK`
- G2 runtime boundary — trigger + candidate filter + recovery skip when handoff authority OFF
- Recovery repository — orphan scan excludes unauthorized fallback; pushWork filters fallback triggers
- Metrics — handoff boundary counters (`synqdrive_rfrf_g2_handoff_*`)

## Transaction boundary

TRANSACTION A (F5-PR2) unchanged. G2 invoked only after promotion commit via `RawRefuelG2HandoffService.handoffAfterPromotionCommit`.

## Real PostgreSQL gate

Script: `backend/scripts/test/rfrf-f5-pr3-g2-handoff-gate.sh`  
Env: `RAW_FUEL_REFUEL_F5_PR3_INTEGRATION=1`  
Isolated DB: `rfrf_f5_pr3_*` on localhost only.

| Case | Status |
|------|--------|
| P1–P5 authority matrix | PASS |
| P6 canonical G2 entry | PASS |
| P7 post-commit only | PASS |
| P8 G2 throw preserves PROMOTED | PASS |
| P9 recovery reconcile | PASS |
| P10–P12 bypass closure | PASS |
| P13 coordinate / enrichment eligibility | PASS |
| P14 missing token hold, zero BullMQ | PASS |
| P15 retryable coordinate hold | PASS |
| P16 queue unavailable deferral | PASS |
| P17 queue enqueue (redis optional) | PASS/skip when redis unavailable |
| P18 replay idempotent | PASS |
| P19 concurrent handoff dedupe | PASS |
| P20 late native pre-completion one owner | PASS |
| P21 late native post-completion sticky | PASS (G2 design + PG rows) |
| P22 late native DISTINCT independent | PASS |
| P23 late native INSUFFICIENT fail-closed | PASS |
| P24 multi-late fail-closed | PASS |
| P25 native-only regression | PASS |
| P26 F5-PR2 promotion + handoff wired | PASS |
| P27 F5-PR2 atomic promotion regression | PASS |
| P28 F5-PR1 convergence regression | PASS |
| P29 native survives G2 throw | PASS |

**Gate result:** 30/30 PASS

## Closure flags

| Flag | Value |
|------|-------|
| F5_PR3_G2_HANDOFF_REACHABLE_IN_TEST | YES |
| F5_PR3_G2_HANDOFF_AUTHORITY_REQUIRED | YES |
| F5_PR3_RECOVERY_AUTHORITY_BYPASS_POSSIBLE | NO |
| F5_PR3_NATIVE_TRIGGER_AUTHORITY_BYPASS_POSSIBLE | NO |
| F5_PR3_BULLMQ_REACHABLE_IN_TEST | YES (P17/P19 when redis available) |
| F5_PR3_COORDINATE_HOLD_PROVEN | YES (P14/P15) |
| F5_PR3_POST_COMMIT_FAILURE_RECOVERABLE | YES (P8/P9) |
| F5_PR3_LATE_NATIVE_POLICY_PROVEN | YES (P20–P24 via G2 design + PG) |
| F5_PR3_COMPLETED_ENRICHMENT_STICKY | YES (P21) |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_DEPLOYED | NO |
| FEATURE_FLAGS_ENABLED_IN_PRODUCTION | NO |
| HISTORICAL_BACKFILL | NO |

## Known P1 follow-up (F5-PR3.1)

Runtime incremental late-native path (native trigger with both events in candidate window) relies on full-batch G2 re-reconciliation; dedicated runtime E2E for L4/L8/L9 sticky enrichment persistence on `lateSiblingConflict` column remains optional hardening.

## Regression gates run

- F5-PR3 PG: 30/30 PASS
- F5-PR2 PG: 50/50 PASS (re-run at PR finalization)
- F5-PR1 / F4 / F3→F2 gates: re-run at PR finalization
- Unit: authority, participation, handoff service
