# EXP-021 — Canary live window authority closure (2026-09-18)

Production SHA audited: `ca7bad8826871376a58efaa874f12992b88c4a04`.

## Phase A — Lifecycle call graph (repository)

```
vehicle_trip COMPLETED (Trip FSM — TripDetectionOrchestrationService / TripDecisionEngine.finalizeTrip)
  → (no automatic Reference Capture subscriber in codebase)

Reference Capture session (manual / orchestrator / API / canary activation)
  → ReferenceCaptureSessionService.createSession
  → runPreflight → startRecording (or ReferenceCaptureFastGoService.executeFastGo)
  → ReferenceCaptureRunnerService cycles (acquisition)
  → Exp021AutonomousLifecycleDriver motion + HF phases (orchestrator CLI path)
  → ReferenceCaptureSettlementShadowService.persistPhysicalDriveIntervalAuthority
  → metadata_json.physicalDriveInterval.physicalEndAt (PDI_CANDIDATE | ORCHESTRATOR_CONFIRMED)
  → stopRecording → syncSettlementShadowAfterCaptureStop
  → ensureExperiment + scheduleWholeTripShadowFromVehicleTrip + phase sync

EXP-021 maturation canary operator (--wait-next-window)
  → polls reference_capture_settlement_shadow_experiments.metadata_json.physicalDriveInterval
  → enroll maturation shadow family (separate path)
```

| Step | Service | Trigger | Config gate |
|------|---------|---------|-------------|
| Trip complete | `TripDetectionOrchestrationService` | DIMO snapshot / scheduler | Trip FSM only |
| RC session | `ReferenceCaptureSessionService` | HTTP, FAST GO, autonomous CLI, **canary live activation (new)** | `REFERENCE_CAPTURE_ENABLED` |
| Study run | `ReferenceCaptureExp021FleetRepository.reserveStudyRunAssignment` | **Not called by fleet coordinator** | Enrollment + COLLECTING study |
| Settlement experiment | `ReferenceCaptureSettlementShadowService.ensureExperiment` | Session acquisition / stop | `REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED` |
| physicalEndAt | `persistPhysicalDriveIntervalAuthority` | Lifecycle driver / confirmed PDI | Existing motion authority only |

## Phase B — Dry-run semantics (proved in code)

- `EXP021_FLEET_DRY_RUN=true` → `ReferenceCaptureExp021FleetCoordinatorService.evaluateFleetDryRunTick` only logs `EXP021_FLEET_DRY_RUN_OBSERVATION`; never calls `reserveStudyRunAssignment` or creates sessions (`reference-capture-exp021-fleet-coordinator.dry-run-safety.spec.ts`).
- `EXP021_FLEET_DRY_RUN=false` → same service **refuses** evaluation (`without DRY_RUN — refusing to evaluate`) — **no fleet live start path**.
- Study `dry_run=true` is required for fleet **dry-run eligibility** (`STUDY_DRY_RUN_REQUIRED` in `reference-capture-exp021-fleet-eligibility.lib.ts`); it does not auto-start sessions.
- `exp021_study_runs=0` because **PR-D fleet execution was never implemented**; only `reserveStudyRunAssignment` exists for future/coordinator callers.

**Root cause class:** `MISSING_RUNTIME_WIRING` + `CONFIGURATION_GAP` (fleet dry-run only; no trip-bound canary activator).

## Phase C — Reusable live paths

| Path | Live start? | Canary reuse? |
|------|-------------|---------------|
| `reference-capture-exp-021-autonomous-orchestrator.ts` | YES (VPS CLI) | Manual, not trip-scheduler |
| HTTP `ReferenceCaptureController` + FAST GO | YES | Manual |
| Fleet coordinator | NO (dry-run observe only) | NO |
| **New: canary live window activation scheduler** | YES when env enabled | YES — token `187336` hard guard |

## Phase D/E — Canary semantics (implementation)

- Arms on **ONGOING** trip with `start_time >= EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO`.
- Finalizes on **COMPLETED** trip (stop recording) — no backfill when trip completed without prior arm.
- Durable ledger: `exp021_canary_live_window_activation_ledgers.vehicle_trip_id` UNIQUE.
- Leader scheduler: `reference_capture_exp021_canary_live_window_activation`.
- Default **disabled**; production env unchanged in this PR.

## Final hardening (PR #1689 — pre-merge)

- **Claim-before-side-effect:** `vehicle_trip_id` ledger row is inserted in `CLAIMED` before study run, session, preflight, or FAST GO.
- **Side-effect idempotency:** `reserveStudyRunForCanaryActivation` binds one `exp021_study_runs.canary_activation_vehicle_trip_id` per trip (order balance increments once). Session id is preallocated on the ledger before `createSession(sessionId)`. `executeIdempotentCanaryArm` skips preflight/FAST GO when session is already READY/RECORDING. Finalize adopts `COMPLETED` without re-calling `stopRecording`. Persisted `STOPPING` resumes via `ReferenceCaptureSessionService.resumeRecordingStop` — ledger must not fail-closed on in-progress stop.
- **PostgreSQL CI:** `reference-capture-exp021-canary-live-window-activation.postgres.integration.spec.ts` exercises RECORDING finalize, COMPLETED adoption, STOPPING recovery, settlement experiment + `physicalDriveInterval` authority (trip-aligned PDI, not fabricated).
- **Restart recovery:** Partial rows resume without duplicating study run/session when state already records progress.
- **Orphan guard:** Foreign blocking RC session (no ledger `session_id` match) blocks new arms; in-progress ledger for the same trip may resume despite blocking session when `session_id` matches.
- **Scheduler:** Default poll `30_000` ms, min `10_000` ms; arms only on **ONGOING** `vehicle_trips` — trips completing faster than poll interval may be missed (`NO_LEDGER_MISS_NO_BACKFILL` on completion). **Canary procedure:** drive longer than ~2× scheduler interval after T0 (recommend ≥3 minutes moving).
- **ENV / PM2:** `onModuleInit` installs timer only when activation enabled at process boot; editing `backend.env` without PM2 restart does **not** start scheduler (`ENV_CHANGE_REQUIRES_PM2_RESTART=YES`).

## Post-merge activation sequence (operator SHA binding)

1. **Stop** existing maturation operator (tmux/CLI) cleanly; verify zero active window families / scientific jobs.
2. Deploy merged PR + `prisma migrate`; verify health on **new** Production SHA.
3. Set `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO` to an instant **after** successful deploy (excludes 2026-09-18 missed drive).
4. Set `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED=true` in `backend.env`.
5. **Rolling PM2 restart** (both replicas) so `process.env` and scheduler timer load.
6. Verify 2/2 healthy, scheduler leader `reference_capture_exp021_canary_live_window_activation` converged (exactly one leader), token `187336` only.
7. **Start new** maturation operator using **same** deployed SHA (`OPERATOR_RUNTIME_SHA == PRODUCTION_SHA`).
8. Operator `--wait-next-window`; only then begin KS MX 2024 test drive.

End-to-end: ONGOING trip → claim → study run → RC session → FAST GO → trip COMPLETED → `stopRecording` once → settlement shadow → `physicalDriveInterval` / `physicalEndAt` from PDI authority → maturation family → M2 → M3.
