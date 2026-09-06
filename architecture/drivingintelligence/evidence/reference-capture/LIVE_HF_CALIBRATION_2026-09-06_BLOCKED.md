# Live HF Block-Polling Calibration — 2026-09-06 (BLOCKED)

**Experiment ID:** `DI_HF_LIVE_BLOCK_POLLING_10_20_30_60`  
**Status:** **BLOCKED** — production SQL lock defect (DI-DEF-019)  
**Vehicle:** KS MX 2024 (`tokenId=187336`)  
**Production SHA at attempt:** `a4377f3a200ca45a97b7ce422caf8d92faddabbe`

## Intent

Single continuous Reference Capture drive with in-session calibration phases:

`10s → 20s → 30s → 60s` (HF_HISTORICAL provider poll cadence override per phase).

## Pre-run verification (PASS)

| Check | Result |
|-------|--------|
| `REFERENCE_CAPTURE_ENABLED` | `true` |
| HF V2 gates before activation | all OFF / empty allowlist |
| KS MX 2024 resolved | **1** vehicle, `tokenId=187336` (matches historical expectation) |
| `organizationId` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `vehicleId` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| Connected / telemetry | CONNECTED; `latestState` fresh; speed 0 (stationary) |
| `HF_AVAILABILITY_CALIBRATION_ENABLED` required? | **NO** — phase API gated by V2 + canary allowlist only (`assertHfCalibrationPhaseActivationAllowed`) |

## Canary activation (PASS)

Temporary production env (restored after abort):

- `HF_RECOVERY_POLICY_V2_ENABLED=true`
- `HF_RECOVERY_POLICY_V2_CANARY_ONLY=true`
- `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS=187336`
- `HF_RECOVERY_SWEEP_ENABLED=false`
- `HF_AVAILABILITY_CALIBRATION_ENABLED=false`

Policy proof after rolling restart: `187336 → V2`, unrelated token → `LEGACY`, `ACTIVE_HF_V2_CANARY_COUNT=1`.

## Session authority (PARTIAL)

| Step | Result |
|------|--------|
| PRE-ARM (`reference-capture-lte-r1-prearm.ts`) | **PASS** — `PREFLIGHT_READY=YES` |
| `sessionId` | `12938ba2-e83c-42f9-b2e8-d9c3f0ad627b` |
| `startRecording` | **PASS** — status `RECORDING`, runner started |
| First `switchHfCalibrationPhase(10000)` | **FAIL** — see blocker |

## Blocker (DI-DEF-019)

`ReferenceCaptureSessionRepository.lockSessionRow()` used Prisma **model** name in raw SQL:

```sql
SELECT id FROM "ReferenceCaptureSession" WHERE id = ... AND "organizationId" = ...
```

PostgreSQL table is `reference_capture_sessions` with snake_case columns (`organization_id`).

**Production error:** `42P01 relation "ReferenceCaptureSession" does not exist`

**Impact:** All atomic calibration paths using `FOR UPDATE` fail in production:

- `requestHfCalibrationPhaseAtomic`
- `finalizeTerminalCalibrationAtomic`
- stop/abort quiescence finalization

**Not observed in CI:** concurrency tests mock repository transactions; no integration test executed raw SQL against PostgreSQL.

## Safe abort + baseline restore (PASS)

- Session forced to `ABORTED` (operational safety; canonical abort also hit same SQL defect)
- HF V2 flags restored OFF / empty allowlist
- Rolling PM2 restart
- Post-restore: `187336 → LEGACY`, `ACTIVE_HF_V2_CANARY_COUNT=0`, `ACTIVE_CALIBRATION_SESSIONS=0`
- External health OK

## Evidence artifacts (VPS, not in git)

- `/tmp/di-hf-live-calibration-run.jsonl`
- `/tmp/di-hf-live-calibration-orchestrator.log`
- Env backup: `/opt/synqdrive/shared/backend.env.bak-di-hf-live-cal-20260906193630`

## Outcome flags

```
DRIVE_START_AUTHORIZED = NO
PHASE_10S_COMPLETED = NO
HF_30S_BLOCK_POLLING_VALIDATED = NO
READY_FOR_HUMAN_CANARY_ANALYSIS = NO (blocked on DI-DEF-019 fix + redeploy)
```

## Required follow-up

1. ~~Merge SQL lock fix (`reference_capture_sessions` + snake_case columns)~~ — **code fixed on PR #1550**
2. ~~Add PostgreSQL integration test for `lockSessionRow` / phase atomic path~~ — **GATE 1 PASS (2026-09-06):** `reference-capture-lock-session.postgres.integration.spec.ts` + `reference-capture-di-def-019-integration-gate.sh`
3. Human merge PR #1550 → deploy → GATE 2 stationary dress rehearsal → re-attempt live calibration
