# EXP-021 — Autonomous Orchestrator Short A/B Regression Authority

**Date:** 2026-09-14 (updated 2026-09-14 post PR #1645 merge)  
**Plan:** `candidate_short_ab_90_60` / `EXP021_CANDIDATE_SHORT_AB_90_60`  
**Canonical owner:** `reference-capture-exp-021-autonomous-orchestrator.ts`  
**Canonical lifecycle driver:** `reference-capture-exp-021-autonomous-lifecycle.driver.ts`  
**Ownership model:** `AUTONOMOUS_ORCHESTRATOR_SOLE_OWNER`

**Frozen evidence (do not mutate):**

- PR #1645 — KS MX 2024 incomplete run forensic authority (**MERGED** to `main` @ `20269b9e73e4ede5160bdf5eeac5945280cafab7`)
- PR #1618 — KS MS 661 defective 90s reference
- Historical physical-run runtime authority: `PHYSICAL_RUN_PRODUCTION_SHA = d1501d171c1cc6dc4b83b2720e3a96549ef24185`

**Immutable scientific conclusions from #1645:**

| Conclusion | Status |
|------------|--------|
| VALID_T0_EVIDENCE | YES |
| VALID_90_OPERATIONAL_EVIDENCE | YES |
| VALID_90_SCIENTIFIC_EVIDENCE | PARTIAL |
| VALID_90_VS_60_COMPARISON | NO |
| VALID_FOR_PRODUCTION_CADENCE_SELECTION | NO |

---

## Evidence levels (do not collapse)

| Level | What it proves | Status |
|-------|----------------|--------|
| **UNIT POLICY TEST** | Calibration plan geometry, slot counts, settlement budget, orchestrator lib locks | **PASS** (`candidate-short-ab-90-60.spec`, `orchestrator.lib.spec`) |
| **POSTGRES PERSISTENCE INTEGRATION** | Repository atomic methods (`persistExp021CanonicalT0Atomic`, `activatePhysicalPhaseAtT0Atomic`, `requestHfCalibrationPhaseAtomic`, `activatePendingPhaseAtBoundary`, `finalizeTerminalCalibrationAtomic`) | **PASS** (CI ephemeral DB `synqdrive_exp021_pr1649_test`, `REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1`) |
| **CANONICAL DRIVER REAL-PATH TEST** | Production `Exp021AutonomousLifecycleDriver` owns T0 → 90s → wall transition → 60s → terminal without test manual phase calls | **PASS** (`reference-capture-exp-021-autonomous-lifecycle.driver.spec.ts`) |
| **SIMULATED PERSISTED STATE RESTART** | Driver restart scenarios with in-memory maps (not PostgreSQL reload) | **PASS** (driver spec B–E; **not** durable persistence proof) |
| **POSTGRES PERSISTENCE RESTART** | Driver `tryResumeFromRecordingSession` after `reloadSessionRow` from real PostgreSQL | **PASS** (CI — 90 / boundary / after-transition / mid-60s-to-terminal / after-terminal; 7/7 postgres tests) |
| **PHYSICAL PRODUCTION RUN** | End-to-end on vehicle with DIMO telemetry | **NOT AUTHORIZED** — no deploy, no physical run from this PR |

**Removed (insufficient):** parallel in-memory harness `reference-capture-exp021-autonomous-short-ab-lifecycle.harness.ts` — reimplemented orchestrator control flow; **not** production path proof.

---

## Failed KS MX 2024 ownership model (contrast)

```
MANUAL PRE-ARM
  → MANUAL FAST GO
  → DETACHED T0 WATCHER
  → NO PHASE OWNER (no switchHfCalibrationPhase at wall boundaries)
```

**Root cause class:** `OWNERSHIP_GAP` — not telemetry failure.

---

## Canonical autonomous lifecycle (production path)

```
reference-capture-exp-021-autonomous-orchestrator.ts (process shell)
        │
        ▼
Exp021AutonomousLifecycleDriver (shared lifecycle state machine)
        ▲
        │
reference-capture-exp-021-autonomous-lifecycle.driver.spec.ts (controlled-time regression)
```

| Step | Implementation |
|------|----------------|
| 1. Create RC session | `orchestrator.ts:main` → `ReferenceCaptureSessionService.createSession` |
| 2. Stamp `exp021AutonomousOrchestrator.runId` | `preflightJson[EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]` |
| 3. Start recording | `sessionService.startRecording` after telemetry ready |
| 4. Detect physical T0 | `PhysicalStartDetector` → `lifecycleDriver.handleWaitMovement` |
| 5. Persist canonical T0 | `persistExp021CanonicalT0` → `exp021PhysicalAuthority` |
| 6. Initialize 90s phase | `activatePhysicalPhaseAtT0` via driver |
| 7. 7 deterministic 90s slots | policy `buildInitialPhaseCounters` |
| 8. 90s wall expiry | `PhysicalDrivePhaseTracker.shouldAdvancePhase` |
| 9. `switchHfCalibrationPhase` | driver `tickDriving` (not test manual) |
| 10. 60s phase + 10 slots | boundary apply via session service |
| 11. Final wall + terminal | `completeExp021PhysicalRunAndStop` → `stopRecording` |
| 12. Restart recovery | `tryResumeFromRecordingSession` + `activatePhysicalPhaseFromPersistedAuthority` |
| 13. Multi-replica guard | Redis lock + ownership stamp |

---

## Regression artifacts

**Canonical driver (controlled time):**

- `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-autonomous-lifecycle.driver.ts`
- `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-autonomous-lifecycle.driver.spec.ts`
- `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-exp021-short-ab-geometry.assertions.ts`

**PostgreSQL integration (CI + optional local, `REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1`):**

- `reference-capture-exp021-short-ab-autonomous-lifecycle.postgres.integration.spec.ts`
- Isolated DB: `synqdrive_exp021_pr1649_test` (ephemeral CI service container)
- CI workflow: `.github/workflows/exp021-autonomous-orchestrator-ci.yml`

**Restart evidence classification:**

| Case | Driver spec | Postgres integration |
|------|-------------|----------------------|
| RESTART_90 | SIMULATED_PERSISTED_STATE + CANONICAL_DRIVER | POSTGRES_PERSISTENCE + CANONICAL_DRIVER |
| RESTART_90_BOUNDARY | SIMULATED_PERSISTED_STATE + CANONICAL_DRIVER | POSTGRES_PERSISTENCE + CANONICAL_DRIVER |
| RESTART_AFTER_TRANSITION | SIMULATED_PERSISTED_STATE + CANONICAL_DRIVER | POSTGRES_PERSISTENCE + CANONICAL_DRIVER |
| RESTART_60 | SIMULATED_PERSISTED_STATE + CANONICAL_DRIVER | POSTGRES_PERSISTENCE + CANONICAL_DRIVER (**PASS** — `REAL_DB_DRIVER_RESTART_60_TO_TERMINAL`) |
| RESTART_AFTER_TERMINAL | SIMULATED_PERSISTED_STATE + CANONICAL_DRIVER | POSTGRES_PERSISTENCE + CANONICAL_DRIVER |
| DUPLICATE_ORCHESTRATOR | PURE_UNIT (Redis lock lib) | NOT_APPLICABLE |
| MULTI_REPLICA | PURE_UNIT (ownership stamp lib) | NOT_APPLICABLE |

**Structural refactor note:** production orchestrator delegates lifecycle to `Exp021AutonomousLifecycleDriver` — `STRUCTURAL_RUNTIME_REFACTOR=YES`, `INTENDED_RUNTIME_BEHAVIOR_CHANGE=NO`.

**Gate:**

```bash
bash architecture/drivingintelligence/evidence/reference-capture/scripts/validate-exp021-short-ab-autonomous-gate.sh
```

---

## Scientific geometry assertions

| Field | Expected |
|-------|----------|
| `90S_EXPECTED_SLOTS` | 7 |
| `60S_EXPECTED_SLOTS` | 10 |
| `90S_EXPECTED_SETTLEMENT_WINDOWS` | 19 |
| `60S_EXPECTED_SETTLEMENT_WINDOWS` | 19 |
| `phaseOrder` | `[90000, 60000]` |
| `calibrationPlanId` | `candidate_short_ab_90_60` |
| `calibrationPlanVersion` | `EXP021_CANDIDATE_SHORT_AB_90_60` |
| 120s phase | **must not exist** |

---

## Ready for next physical run

**READY_FOR_NEXT_PHYSICAL_90_60_RUN:** **NO** (human sign-off + governance label still required)

Prerequisites met by this PR branch (pending final HEAD freeze):

- PR #1645 merged (evidence authority frozen; frozen forensic files untouched)
- Canonical driver extracted; orchestrator delegates lifecycle (`STRUCTURAL_RUNTIME_REFACTOR=YES`, `INTENDED_RUNTIME_BEHAVIOR_CHANGE=NO`)
- Parallel harness removed
- Autonomous regression gate **PASS** (55 unit tests)
- Isolated Postgres integration **PASS** (CI service container `synqdrive_exp021_pr1649_test`, 7/7 tests incl. mid-60s restart-to-terminal)
- Phase transitions use `PHYSICAL_TRANSITION` provenance so slot materialization and driver resume match production path

Remaining blockers for **YES**:

- Human review / merge approval of PR #1649 (do not merge from agent)
- `i18n-governance-authority-change` label on PR (new workflow file triggers authority protection)
- Explicit authorization for next physical run (no cadence decision from this PR)
- `i18n-governance-authority-change` label from trusted human authority (workflow file addition)

**NO DEPLOY. NO PHYSICAL RUN. NO CADENCE DECISION.**
