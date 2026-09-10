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
| `PR1593_POST_REBASE_HEAD` | `88b918a73d88b7e80bf12e652db32661dacac534` |
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

## Exact-SHA CI closure (`88b918a73`)

### GitHub workflow runs @ `88b918a73d88b7e80bf12e652db32661dacac534`

| Workflow | Run ID | Conclusion |
|----------|--------|------------|
| i18n Governance — New Debt Gate | [34433703415](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34433703415) | **failure** |
| Module registry governance | [34433703431](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34433703431) | **success** |
| Legal Documents — Production Readiness CI | [34433703542](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34433703542) | **success** |
| Vehicle Detail — Production Readiness CI | [34433703413](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34433703413) | **success** |
| i18n Governance — Authority Protection | [34433701971](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34433701971) | **success** |
| Trip FSM — Production Readiness CI | — | **not triggered** (no `trips/*` diff) |

### i18n failure forensics

| Check | PR #1593 @ `88b918a73` | `origin/main` @ `7203b5bd` |
|-------|------------------------|----------------------------|
| `npm run i18n:check` | **PASS** | **PASS** |
| `npm run i18n:scanner:test` | **PASS** (43/45, 2 skipped) | **PASS** (43/45, 2 skipped) |
| `npm run i18n:pr-gate:test` P2.3.4 block | N/A in CI log root cause | N/A |

**Classification:** `PRE_EXISTING_MAIN_TOOLING_DEFECT` — P2.3.4 tests in `i18n-pr-gate.test.ts` bound `resolveEffectivePrChangedPaths({ repoRoot })` to the **live CI PR**, expecting hardcoded PR #1589 paths. #1593 touches `ChangesView.tsx` → i18n-relevant → adversarial step runs → path mismatch (not new translation debt).

**Fix:** separate tooling PR [#1597](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1597) (`cursor/i18n-pr-gate-parity-isolation-fix-7d78`) — isolated PR #1589 parity fixture. **#1593 must rebase after #1597 merges to main.**

### Trip FSM Production Readiness dispatch

`workflow_dispatch` on `.github/workflows/trip-fsm-production-readiness.yml` @ #1593 branch: **HTTP 403** (agent token lacks dispatch permission). **Requires operator manual dispatch** on `88b918a73` or post-rebase head.

### Reference Capture test counts (reconciled @ `88b918a73`)

| Metric | Value |
|--------|-------|
| `TEST_SUITES_TOTAL` | 56 |
| `TEST_SUITES_PASSED` | 52 |
| `TEST_SUITES_FAILED` | 0 |
| `TEST_SUITES_SKIPPED` | 4 |
| `TESTS_TOTAL` | 641 |
| `TESTS_PASSED` | 610 |
| `TESTS_FAILED` | 0 |
| `TESTS_SKIPPED` | 31 |

`610 + 0 + 31 = 641` ✓ — prior `640` total was incorrect.

Skipped suites (31 tests): **EXPECTED_INFRA_SKIP** — postgres/redis integration harnesses without local PG/Redis/Docker.

## Test evidence (rebased head)

| Suite | Total | Passed | Failed | Skipped | Notes |
|-------|-------|--------|--------|---------|-------|
| Reference Capture (`--testPathPattern=reference-capture`) | 641 | **610** | 0 | 31 | 4 suites skipped; infra harness |
| Trip FSM R11 unit (`test:trip-r11:unit`) | 67 | **67** | 0 | 0 | |
| Trip FSM R12 unit (`test:trip-r12:unit`) | 24 | **24** | 0 | 0 | |
| R12 AUD-002/003/004 unit | 31 | **26** | 0 | 5 | AUD-007 PG suite skipped locally |
| Trip R11 PG+Redis (`test:trip-r11:postgres-redis`) | 24 | 16 | 8 | 0 | **EXPECTED_INFRA_SKIP** (no Prisma/PG in agent VM) |
| Backend build (`npm run build`) | — | **PASS** | — | — | |
| DI graph validation | — | **PASS** | — | — | |
| DI doc validation | — | **PASS** | — | — | |
| Module registry | — | **PASS** | — | — | |
| i18n PR gate CLI (base→head local) | — | **PASS** | — | — | 0 new debt |
| i18n CI New Debt Gate @ `88b918a73` | — | **FAIL** | — | — | tooling defect; see #1597 |

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

## Remaining risks / open blockers

1. **i18n New Debt Gate** — blocked on [#1597](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1597) merge + #1593 rebase.
2. **Trip FSM Production Readiness** — not auto-triggered; manual `workflow_dispatch` required (agent 403).
3. **AUD-007 PostgreSQL integration** — requires Trip FSM CI run with PG service (not available locally).
4. **Post-merge VPS `--e2e-shadow-smoke`** — still required before physical run (unchanged).
5. **AUD-006 deferred** — operators must not infer trip completion from `endTime` alone.

## Merge gate

`EXACT_SHA_CI_CLOSURE_COMPLETE` = **NO**

`FINAL_INTEGRATION_SHA` = `88b918a73d88b7e80bf12e652db32661dacac534`

`READY_TO_MERGE_1593` = **NO** — `CI_FAILED > 0` (i18n gate); Trip FSM CI not executed on this SHA

`READY_TO_DEPLOY` = **NO**  
`READY_FOR_NEXT_EXP021_PHYSICAL_RUN` = **NO**
