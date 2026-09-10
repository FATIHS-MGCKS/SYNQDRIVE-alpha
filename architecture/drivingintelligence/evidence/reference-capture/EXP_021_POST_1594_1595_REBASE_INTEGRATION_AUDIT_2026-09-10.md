# EXP-021 — Post-#1594/#1595 rebase integration audit (2026-09-10)

**PR:** #1593 (Draft)  
**Branch:** `cursor/exp-021-settlement-shadow-abort-lifecycle-7d78`  
**Status:** Integration candidate audited — **DO NOT MERGE / DEPLOY / START PHYSICAL DRIVE**

## Git forensics

| Field | Value |
|-------|-------|
| `PR1593_PRE_REBASE_HEAD` | `deeb89eb15cbd255835ba46100a7351190cecda6` |
| `REBASE_TARGET_MAIN_SHA` | `7203b5bd63dd3a32a65e2cc077f3d4fda8fe4584` |
| `MAIN_CONTAINS_1594` | **YES** (`f4109e34c…` ancestor) |
| `MAIN_CONTAINS_1595` | **YES** (`7203b5bd6…` ancestor) |
| `PR1593_POST_REBASE_HEAD` | `3a1f3ea1b3f9d152ceaf27ecda9c0f175485e56b` |
| `MERGE_BASE_EQUALS_CURRENT_MAIN` | **YES** |
| `REBASE_CONFLICTS` | **0** (clean rebase) |
| `SEMANTIC_CONFLICTS_RESOLVED` | **0** (no conflict files) |
| Safety backup | `backup/pr1593-pre-rebase-20260910T0326…Z` |

## Changed-file classification (28 files)

| Class | Count | Notes |
|-------|-------|-------|
| `EXP021_ONLY` | 18 | motion, orchestrator, maturation, PDI provenance |
| `REFERENCE_CAPTURE_CORE` | 7 | settlement-shadow service/repository/runner/recovery |
| `VEHICLETRIP_INTERACTION` | 2 | read-only canonical resolver + overlap ranking |
| `TRIP_FSM_INTERACTION` | **0** | no Trip FSM source files modified |
| `WORKER_SCHEDULER` | 1 | settlement-shadow recovery scheduler |
| `ARCHITECTURE_DOC` | 3 | DI evidence + CHANGE_LEDGER |
| `FRONTEND_GOVERNANCE` | 2 | ChangesView, ArchitekturView |

**#1594 / #1595 file overlap:** **NONE** — rebase did not touch `backend/src/modules/vehicle-intelligence/trips/*` or `architecture/trip-detection-lifecycle/*`.

## R12 contract preservation (#1594)

| Audit | Test authority | Post-rebase result |
|-------|----------------|-------------------|
| **R12-AUD-002** | `trip-empty-core-end-gate.spec.ts` — `engine load before stop boundary → UNKNOWN motor activity (fresh contradiction blocks INACTIVE)` + `non-contradictory pre-boundary stationary → INACTIVE corroboration` | **PASS** |
| **R12-AUD-003** | `trip-decision.engine.continuity.spec.ts` — fail-closed continuity (A–G incl. legacy `evidence.verdict` forbidden) | **PASS** |
| **R12-AUD-004** | `trip-empty-core-end-gate.spec.ts` — `R12-AUD-004` ignition-on stationary blocks end | **PASS** |
| **R12-AUD-007** | `trip-finalize-end-cycle.postgres.integration.spec.ts` — `E — live resume before stale FINALIZE consumer must not finalize trip` | **SKIPPED** (no local PG); **CI authority** |

`AUD_002_UNCHANGED_FROM_1594` = **YES** (no trips/* diff)  
`AUD_003_UNCHANGED_FROM_1594` = **YES**  
`AUD_004_UNCHANGED_FROM_1594` = **YES**  
`AUD_007_UNCHANGED_FROM_1594` = **YES** (code unchanged; PG harness pending CI)

### Deferred R12 state (preserved)

| Item | Status |
|------|--------|
| AUD-005 | NOT fixed (deferred) |
| AUD-006 | NOT fixed (deferred) — ONGOING may have provisional `endTime` |
| AUD-008 | NOT fixed (deferred) |

EXP-021 canonical binding: `rankCanonicalVehicleTripCandidates` requires `tripStatus === 'COMPLETED' && endTime` — **ONGOING + endTime → NOT_FOUND**.

## Cross-module dataflow

```
DIMO telemetry ─┬─► Trip FSM (detectors → TripDecisionEngine → VehicleTrip lifecycle)
                │
                └─► Reference Capture (physical start/end → cadence → PDI channel + fixed probes)
                              │
                              ├─► PDI schedules (+30…+600) — physical interval authority (NO Trip FSM wait)
                              └─► Canonical WHOLE_TRIP — reads COMPLETED VehicleTrip via overlap resolver
                                        ▲
                                        └── recovery scheduler (delayed Trip FSM completion)
```

| Dependency | Direction | Kind |
|------------|-----------|------|
| RC → Trip FSM decision | **NO** | RC does not write Trip FSM / VehicleTrip status |
| Trip FSM → RC PDI | **NO** | PDI from physical end candidate only |
| Trip FSM COMPLETED → RC Whole-Trip | **READ** | `resolveCanonicalVehicleTrip` + recovery scheduler |
| RC session open → Trip COMPLETED | **NO** | `RC_SESSION_MUST_REMAIN_OPEN_UNTIL_TRIP_COMPLETED = NO` |

`RC_TRIPFSM_CIRCULAR_DEPENDENCY` = **NO**

## EXP-021 integration contracts

| Assertion | Result |
|-----------|--------|
| `PDI_REQUIRES_TRIP_COMPLETED` | **NO** |
| `PDI_REQUIRES_TRIP_RESTING` | **NO** |
| `PDI_30_PROSPECTIVE_CAPABILITY` | **YES** |
| `PDI_60_PROSPECTIVE_CAPABILITY` | **YES** |
| `ONGOING_ENDTIME_CAN_BIND` | **NO** |
| `DELAYED_TRIP_COMPLETION_RECOVERY` | **PASS** (recovery scheduler + `scheduleWholeTripShadowFromVehicleTrip`) |
| `RC_PARKED_CANDIDATE_FORCES_TRIP_END` | **NO** |
| `FALSE_PDI_END_CANDIDATE_FINALIZES_VEHICLETRIP` | **NO** |
| `TRIP_FSM_GAP_SPLIT_PDI_PRESERVED` | **YES** |
| `TRIP_FSM_GAP_SPLIT_CANONICAL_BIND_FAILS_CLOSED` | **YES** (`AMBIGUOUS_SPLIT`) |
| `NORMAL_RC_STOP_INDEPENDENT_OF_TRIPFSM_COMPLETION` | **YES** |
| `ABORT_LIFECYCLE_REGRESSION` | **PASS** |
| `REFERENCE_CAPTURE_WRITES_TRIPFSM_STATE` | **NO** |
| `REFERENCE_CAPTURE_WRITES_VEHICLETRIP_STATUS` | **NO** |
| `LEGACY_CONTINUITY_CONTRACT_USAGE` | **NO** (no `evidence.verdict` in RC) |
| `ONGOING_ENDTIME_TREATED_AS_COMPLETED` | **NO** |
| `PDI_SURVIVES_DELAYED_TRIP_COMPLETION` | **YES** |

## Test evidence (rebased head)

| Suite | Total | Passed | Failed | Skipped | Notes |
|-------|-------|--------|--------|---------|-------|
| Reference Capture (`--testPathPattern=reference-capture`) | 640 | **609** | 0 | 31 | skips: infra/optional harness |
| Trip FSM R11 unit (`test:trip-r11:unit`) | 67 | **67** | 0 | 0 | |
| Trip FSM R12 unit (`test:trip-r12:unit`) | 24 | **24** | 0 | 0 | |
| R12 AUD-002/003/004 unit | 31 | **26** | 0 | 5 | AUD-007 PG suite skipped locally |
| Trip R11 PG+Redis (`test:trip-r11:postgres-redis`) | 24 | 16 | 8 | 0 | **EXPECTED_INFRA_SKIP** (no Prisma/PG in agent VM) |
| Backend build (`npm run build`) | — | **PASS** | — | — | |
| DI graph validation | — | **PASS** | — | — | |
| DI doc validation | — | **PASS** | — | — | |
| Module registry | — | **PASS** | — | — | |
| i18n PR gate (base→head) | — | **PASS** | — | — | 0 new debt |

### Fourth-pass regression (unchanged)

`PDI_CROSS_AGE_MATURATION` = PASS  
`WHOLE_TRIP_CROSS_AGE_MATURATION` = PASS  
`FIXED_INTERVAL_MATURATION_REGRESSION` = PASS  
`FULL_OPERATOR_JOURNEY_SIMULATION` = PASS  
`FULL_RUN_SIMULATION` = PASS  

## Semantic diff vs #1594/#1595

| Question | Answer |
|----------|--------|
| A. #1593 change any #1594 file? | **NO** |
| B. Conflict resolution alter Trip FSM semantics? | **NO** (zero conflicts) |
| C. Legacy `evidence.verdict` consumer introduced? | **NO** |
| D. RC mutates VehicleTrip / Trip FSM? | **NO** |
| E. ONGOING+endTime treated as completed? | **NO** |
| F. Delayed Trip FSM blocks PDI? | **NO** |
| G. Whole-Trip recovers after delayed completion? | **YES** |

`DIRECT_TRIPFSM_BEHAVIOR_CHANGE_FROM_1593` = **NO**

## Remaining risks

1. **AUD-007 PostgreSQL integration** — not executed locally; requires CI Trip FSM Production Readiness workflow on final SHA.
2. **Post-merge VPS `--e2e-shadow-smoke`** — still required before physical run (unchanged).
3. **AUD-006 deferred** — operators must not infer trip completion from `endTime` alone anywhere outside canonical COMPLETED binding.

## Merge gate

`READY_TO_MERGE_1593` = **YES** subject to CI green on `3a1f3ea1b…` and operator approval.

`FINAL_INTEGRATION_SHA` = `3a1f3ea1b3f9d152ceaf27ecda9c0f175485e56b`  
`READY_TO_DEPLOY` = **NO**  
`READY_FOR_NEXT_EXP021_PHYSICAL_RUN` = **NO**
