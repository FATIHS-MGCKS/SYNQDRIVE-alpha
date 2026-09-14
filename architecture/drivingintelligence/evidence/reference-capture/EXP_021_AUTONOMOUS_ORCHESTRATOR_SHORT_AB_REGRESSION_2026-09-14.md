# EXP-021 — Autonomous Orchestrator Short A/B Regression Authority

**Date:** 2026-09-14  
**Plan:** `candidate_short_ab_90_60` / `EXP021_CANDIDATE_SHORT_AB_90_60`  
**Canonical owner:** `reference-capture-exp-021-autonomous-orchestrator.ts`  
**Ownership model:** `AUTONOMOUS_ORCHESTRATOR_SOLE_OWNER`

**Frozen evidence (do not mutate):**

- PR #1645 — KS MX 2024 incomplete run forensic authority
- PR #1618 — KS MS 661 defective 90s reference

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

## Canonical autonomous lifecycle (code trace)

| Step | Implementation |
|------|----------------|
| 1. Create RC session | `orchestrator.ts:main` → `ReferenceCaptureSessionService.createSession` |
| 2. Stamp `exp021AutonomousOrchestrator.runId` | `orchestrator.ts:656-667` → `preflightJson[EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]` |
| 3. Start recording | `sessionService.startRecording` after telemetry ready |
| 4. Detect physical T0 | `PhysicalStartDetector` in `reference-capture-exp-021-motion.lib.ts` |
| 5. Persist `exp021CanonicalT0` | `persistExp021CanonicalT0` → `persistExp021CanonicalT0Atomic` |
| 6. Create `calibrationSeriesId` | `reanchorPhysicalCalibrationPhaseAtT0` at T0 arm |
| 7. Create settlement experiment | `SettlementShadowService.ensureExperiment` (`experimentId = buildExperimentId(sessionId)`) |
| 8. Initialize 90s phase | `activatePhysicalPhaseAtT0` with `cadencePhaseOrderMs[0]=90000` |
| 9. Create 7 deterministic 90s slots | `buildInitialPhaseCounters` → `initializeRequestSlotsForActivePhase` |
| 10. Detect 90s wall expiry | `PhysicalDrivePhaseTracker.shouldAdvancePhase` (WALL_CLOCK) |
| 11. Seal 90s phase | `applyPendingCalibrationPhaseAtBoundary` at cycle release |
| 12. Invoke `switchHfCalibrationPhase` | `sessionService.switchHfCalibrationPhase` → pending request |
| 13. Initialize 60s phase | boundary apply creates new active phase |
| 14. Create 10 deterministic 60s slots | `buildInitialPhaseCounters` at 60s boundary |
| 15. Detect second wall boundary | `finalPhaseWallClockExpired` at T0+20min |
| 16. Seal physical end | `completePhysicalRunAndStop` / `finalizeTerminalCalibrationSeries` |
| 17. RC terminal completion | `stopRecording` → `finalizeTerminalCalibrationAtomic` → `COMPLETED` |
| 18. Settlement attached to plan | `syncCompletedPhasesFromSession` uses series `calibrationPlanId/Version` |
| 19. Restart recovery | `ATTACH_EXISTING_RECORDING` + `activatePhysicalPhaseFromPersistedAuthority` |
| 20. Multi-replica guard | Redis orchestrator lock + `isOrchestratorOwnedRecordingSession` + DB row locks |

---

## Gap classification (Phase 1)

| Component | Status |
|-----------|--------|
| Ownership stamp | **PROVEN_EXISTING** |
| T0 persistence | **PROVEN_EXISTING** |
| Wall-clock phase progression | **PROVEN_EXISTING** |
| 90→60 transition | **PROVEN_EXISTING** (policy); **TEST_GAP** (orchestrator `main()` loop) |
| Slot geometry 7/10 | **PROVEN_EXISTING** |
| Settlement 19+19 windows | **PROVEN_EXISTING** |
| Terminal session state | **PROVEN_EXISTING** |
| Trip FSM isolation | **PROVEN_EXISTING** (read-only observation) |
| Orchestrator `main()` E2E | **TEST_GAP** → addressed by controlled-time harness |
| Postgres 90s-first recovery | **PARTIALLY_PROVEN** → new integration spec (opt-in) |

**Runtime code change required:** **NO** for canonical autonomous path.  
**Mixed manual path:** guardrails still required (`CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH=YES`).

---

## Regression harness

**Unit harness (controlled time, no 20-minute wall wait):**

- `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-exp021-autonomous-short-ab-lifecycle.harness.ts`
- `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-exp021-autonomous-short-ab-lifecycle.harness.spec.ts`

**PostgreSQL integration (optional, `REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1`):**

- `reference-capture-exp021-short-ab-autonomous-lifecycle.postgres.integration.spec.ts`

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

Authority recovery precedence: **series → experiment metadata → env** (fail closed on conflict).

---

## Canonical next physical run procedure (gate — not yet authorized)

1. Set `EXP021_CALIBRATION_PLAN=CANDIDATE_SHORT_AB_90_60` in backend.env **before** orchestrator boot.
2. Read-only preflight (vehicle telemetry fresh, policy gate V2).
3. Start orchestrator as **sole lifecycle owner**:

   ```bash
   node backend/scripts/ops/reference-capture-exp-021-autonomous-orchestrator.ts --confirm-exp021-autonomous
   ```

4. **Do not** run manual FAST GO, detached T0 watcher, or manual `switchHfCalibrationPhase`.
5. Drive normally ≥20 minutes after PHYSICAL_T0.
6. Orchestrator completes 90→60 wall transitions and terminalizes session.
7. Forensic review after run.

**PRE-ARM:** Orchestrator performs policy precheck internally; separate manual PRE-ARM is **not required** when using autonomous sole-owner path (orchestrator creates session + preflight + recording).

**Ready for next physical run:** **NO** until:

- PR #1645 merged to `main` (evidence authority)
- Autonomous regression gate passes on CI
- Autonomous-orchestrator regression / pre-run validation sign-off

**NO DEPLOY. NO PHYSICAL RUN. NO CADENCE DECISION.**
