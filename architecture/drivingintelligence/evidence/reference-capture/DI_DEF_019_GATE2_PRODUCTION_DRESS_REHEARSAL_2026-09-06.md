# DI-DEF-019 GATE 2 — Production Stationary Dress Rehearsal

**Date:** 2026-09-06  
**PR merged:** #1550 (`01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac`)  
**Status:** GATE_2_PASS  
**Vehicle:** KS MX 2024 (stationary throughout)

> **THIS IS NOT SCIENTIFIC 10/20/30/60 CALIBRATION EVIDENCE.**  
> Gate 2 validates production control-plane/runtime acceptance only: phase lifecycle REQUESTED→PENDING→EFFECTIVE, STOP finalization, ABORT finalization, multi-replica observation, and SQL lock correctness on real production PostgreSQL. It does **not** validate bucket completeness, provider efficiency, temporal density, detector quality, or cadence selection.

## Production deployment

| Field | Value |
|-------|-------|
| PRODUCTION_SHA | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |
| EXPECTED_PR_1550_FIX_DEPLOYED | YES |
| Backend replicas | `synqdrive` (3001) + `synqdrive-b` (3002) — both healthy post-test |
| Scheduler leader | Converged (1 leader after rolling restart) |
| External health | `https://app.synqdrive.eu/api/v1/health` — OK |

## Vehicle / token resolution

| Field | Value |
|-------|-------|
| organizationId | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| vehicleId | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| registration | KS MX 2024 |
| tokenId | `187336` |
| TOKEN_ID_MATCHES_187336 | YES |
| VEHICLE_STATIONARY | YES (speed 0 km/h at rehearsal) |
| TELEMETRY_FRESH | YES (latest state within rehearsal window) |

## Pre-test baseline (verified safe)

| Flag / metric | Value |
|---------------|-------|
| REFERENCE_CAPTURE_ENABLED | true |
| HF_RECOVERY_POLICY_V2_ENABLED | false |
| HF_RECOVERY_SWEEP_ENABLED | false |
| HF_AVAILABILITY_CALIBRATION_ENABLED | false |
| HF_RECOVERY_POLICY_V2_CANARY_ONLY | true |
| HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS | empty |
| ACTIVE_CALIBRATION_SESSIONS | 0 |
| PRODUCTION_HF_AUTHORITY | LEGACY |

## Single V2 canary (temporary, test window only)

During sessions only:

| Setting | Value |
|---------|-------|
| HF_RECOVERY_POLICY_V2_ENABLED | true |
| HF_RECOVERY_POLICY_V2_CANARY_ONLY | true |
| HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS | `187336` |
| HF_SETTLEMENT_DELAY_MS | 8000 |
| HF_RECOVERY_OVERLAP_MS | 6000 |
| Policy proof | `187336` → V2; unrelated token `999999` → LEGACY |
| ACTIVE_HF_V2_CANARIES | 1 |

## Session 1 — 10→20→30→60 + STOP

| Field | Value |
|-------|-------|
| sessionId | `a0498b4a-10fd-400a-b362-301990c99759` |
| calibrationSeriesId | `78876e8c-8a12-4a7d-a8f2-4582abf615c5` |
| SESSION_1_STATUS | COMPLETED |
| STOP_FINALIZATION_PASS | YES |
| terminalFinalizationAt | `2026-09-06T21:54:22.116Z` |
| completedPhaseSummaries | 4 |
| runnerJobId / pendingCycleJobId | null (cleared) |

### Phase lifecycle (real runner/cycle boundary)

| Phase | requestedAt | effectiveAt | phaseSequence |
|-------|-------------|-------------|---------------|
| 10s | `2026-09-06T21:54:02.928Z` | `2026-09-06T21:54:04.960Z` | 1 |
| 20s | `2026-09-06T21:54:04.983Z` | `2026-09-06T21:54:10.016Z` | 2 |
| 30s | `2026-09-06T21:54:10.022Z` | `2026-09-06T21:54:16.050Z` | 3 |
| 60s | `2026-09-06T21:54:16.059Z` | `2026-09-06T21:54:22.093Z` | 4 |

All phases: same sessionId, vehicleId, tokenId, calibrationSeriesId; pending cleared at EFFECTIVE; phaseSequence monotonic.

## Session 2 — 10s EFFECTIVE + ABORT

| Field | Value |
|-------|-------|
| sessionId | `3d388fcd-afe0-4494-89df-e5f40bc9642e` |
| calibrationSeriesId | `1ee8be41-d6c5-417e-ba87-fd9c36da2e2e` |
| SESSION_2_STATUS | ABORTED |
| 10S_EFFECTIVE_BEFORE_ABORT | YES |
| phase requestedAt | `2026-09-06T22:12:07.480Z` |
| phase effectiveAt | `2026-09-06T22:12:08.496Z` |
| abort invoked | `abortSession('gate2_dress_rehearsal_abort')` |
| terminalFinalizationAt | `2026-09-06T22:12:08.531Z` |
| ABORT_FINALIZATION_PASS | YES |
| runnerJobId / pendingCycleJobId | null (cleared) |

## Multi-replica runtime observation

| Check | Result |
|-------|--------|
| Duplicate phase activation | None observed |
| Duplicate terminal finalization | None observed |
| Divergent session state | None observed |
| Repeated lock failure | None during Gate 2 window |
| Cross-replica stale overwrite | None observed |
| MULTI_REPLICA_RUNTIME_STATE_CONSISTENT | YES |

Both replicas remained online through session 1 and session 2; rolling restart post-test converged scheduler leader.

## SQL / runtime error scan

| Scan | Result |
|------|--------|
| Gate 2 window (≥ `2026-09-06T21:46` UTC) | **NO** 42P01 / 42703 / 42883 / deadlock / transaction aborted / lock timeout |
| Pre-fix error (19:39:56) | Historical `42P01` on `"ReferenceCaptureSession"` — **before** PR #1550 deploy; excluded from Gate 2 pass criteria |
| PRODUCTION_SQL_ERRORS_FOUND (Gate 2 window) | NO |
| STUCK_RUNNERS_FOUND | NO |
| STUCK_SESSIONS_FOUND | NO |

## Post-test baseline restoration (mandatory)

| Field | Value |
|-------|-------|
| HF_RECOVERY_POLICY_V2_ENABLED | false |
| HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS | empty |
| token 187336 policy | LEGACY |
| unrelated token policy | LEGACY |
| ACTIVE_HF_V2_CANARIES | 0 |
| ACTIVE_CALIBRATION_SESSIONS | 0 |
| PRODUCTION_HF_AUTHORITY | LEGACY |
| POST_TEST_BASELINE_RESTORED | YES |

Restored from backup: `/opt/synqdrive/shared/backend.env.bak-di-def-019-gate2-20260906214626` + rolling restart both replicas.

## Scientific non-claims (explicit)

| Claim | Value |
|-------|-------|
| HF_30S_BLOCK_POLLING_VALIDATED | NO |
| 10s bucket completeness validated | NO |
| 20s bucket completeness validated | NO |
| 30s bucket completeness validated | NO |
| 60s bucket completeness validated | NO |
| Provider request efficiency validated | NO |
| Temporal density preservation validated | NO |
| Detector / Driving Score quality validated | NO |
| Cadence selected for production | NO |

## DI-DEF-019 status after GATE 2

`FIXED_PRODUCTION_VALIDATED` — production stationary dress rehearsal passed STOP and ABORT paths on real runtime with PR #1550 fix deployed.

## Next authorized step

Physical 10/20/30/60 drive may be attempted as a **separate** scientific calibration experiment (EXP-016 retry) — not part of Gate 2.

## Authority path

- Service/API only (`ReferenceCaptureSessionService.startRecording`, `switchHfCalibrationPhase`, `stopRecording`, `abortSession`)
- No direct database state writes
- Ephemeral orchestrator on VPS: `/tmp/di-def-019-gate2-dress-rehearsal.ts` (not committed; `RUNTIME_CODE_CHANGED_DURING_GATE2=NO` for repository)
