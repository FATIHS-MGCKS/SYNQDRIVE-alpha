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
| P17 queue recovery (required isolated Redis) | PASS with required isolated Redis proof |
| P18 replay idempotent | PASS |
| P19 concurrent handoff dedupe (required Redis) | PASS with required isolated Redis proof |
| P20 A1 late native pre-completion runtime E2E | PASS |
| P21 A2 late native post-completion sticky runtime E2E | PASS (`lateSiblingConflict` persisted on native reconciliation row) |
| P22 late native DISTINCT independent | PASS |
| P23 late native INSUFFICIENT fail-closed | PASS |
| P24 A3 multi-late runtime fail-closed | PASS |
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
| F5_PR3_BULLMQ_REACHABLE_IN_TEST | YES (P17/P19 required Redis; no silent skip) |
| F5_PR3_COORDINATE_HOLD_PROVEN | YES (P14/P15) |
| F5_PR3_POST_COMMIT_FAILURE_RECOVERABLE | YES (P8/P9) |
| F5_PR3_LATE_NATIVE_POLICY_PROVEN | YES (P20–P24 real runtime persistence E2E) |
| F5_PR3_COMPLETED_ENRICHMENT_STICKY | YES (P21 A2 persisted `lateSiblingConflict`) |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_DEPLOYED | NO |
| FEATURE_FLAGS_ENABLED_IN_PRODUCTION | NO |
| HISTORICAL_BACKFILL | NO |

## Regression gates run

- F5-PR3.1 PG+Redis required gate: 30/30 PASS
- F5-PR2 PG: 50/50 PASS
- F5-PR1 PG: 19/19 PASS
- F4-PR3 / F4-PR2 / F3→F2 gates: PASS
- Backend build + Prisma validate + module registry + EED graph validator: PASS

---

## F5-PR3.1 pre-merge micro-closure

**Prior PR HEAD (pre-hardening):** `1b4e1589241db04ae900854622136f7a668f9e01`
**Synced main during closure:** `87347ec8094d7317cc16dd65f0161d849c799c33` → `5bd1b266c06c9ce0989dbac0b23c3d5b27cb8e07` (VDC RB-019 P2.5 audit #1650; no EED/G2 overlap)
**Final PR HEAD:** recorded at commit time in PR CI

### Proof gaps closed

| Gap | Closure |
|-----|---------|
| A — late-native runtime persistence | P20/P21/P24 rewritten as real `reconcileAndEnqueueAfterPersist` E2E with PostgreSQL assertions (A1/A2/A3) |
| A2 — `lateSiblingConflict` persisted | Native reconciliation row persists `lateSiblingConflict=true` + `INSUFFICIENT_EVIDENCE` after COMPLETED fallback enrichment |
| B — BullMQ silent skip | `RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1` + `RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED=1`; gate starts/probes localhost Redis; P17/P19 assert exactly one effective BullMQ job |
| G2 prior-bridge | `loadPriorFinalizationBridgeContext` includes in-window FINAL reconciled rows in prior bridge even when still in active candidate set (L8/L9 incremental native trigger) |

### Required gate env

```
RAW_FUEL_REFUEL_F5_PR3_INTEGRATION=1
RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED=1
RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1
```

Redis: localhost `127.0.0.1:56379` (non-production proven). Unavailable Redis → FAIL (never PASS/skip).

### Closure contract

```
KNOWN_P0_F5_PR3_BLOCKERS = 0
KNOWN_P1_F5_PR3_BLOCKERS = 0
F5_PR3_COMPLETE = YES
```

Hard rule preserved: `F5_PR3_COMPLETE=YES` forbidden while any P0/P1 remains.
