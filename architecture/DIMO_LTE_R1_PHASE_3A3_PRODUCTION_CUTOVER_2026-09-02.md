# Architecture — Phase 3A.3 Combined Production Cutover + Stationary Canary

**Date:** 2026-09-02  
**Evidence:** DI-EV-0022  
**Scope:** 3A.3.1 FAST PRE-ARM/GO + 3A.3.2 HF physical identity migration + stationary canary

## Cutover sequence

```
Pre-migration safety gate (duplicates=0, no active sessions)
        ↓
Prisma migration 20260902103000_reference_capture_physical_sample_unique
        ↓
Deploy bf1be9b6b (3A.3.1 + 3A.3.2 code authority)
        ↓
Runner race fix 82f3d9c5c (STARTING→RECORDING before startRunner enqueue)
        ↓
PRE-ARM → FAST GO → observe cycles → STOP
        ↓
Post-canary integrity (unique index valid, duplicates=0)
```

## Migration

| Item | Value |
|------|-------|
| Migration | `20260902103000_reference_capture_physical_sample_unique` |
| Index | `refcap_obs_session_physical_fp_uq` UNIQUE on `(session_id, physical_sample_fingerprint)` |
| Purpose | Durable HF aggregate-bucket idempotency at persistence boundary |

## Runner race fix (production blocker)

**Before:** `startRunner()` enqueued BullMQ cycle job while session status was `STARTING`. Worker skipped non-`RECORDING` sessions; `pendingCycleJobId` pointed at removed job → FAST GO timeout.

**After:** `ReferenceCaptureSessionService.startRecording` transitions `STARTING → RECORDING` **before** `startRunner()`.

## Production canary (stationary)

| Item | Value |
|------|-------|
| Vehicle | WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`) |
| Session | `ed06ea20-bb33-47d5-b8fb-8f19810b33ae` |
| FAST GO | READY_TO_DRIVE in 1321 ms |
| Cycles | 6 completed |
| Observations | 82 SIGNAL_POINT, 0 HF_HISTORICAL |
| Identity version | `AGGREGATE_BUCKET_V2` |

## Verdicts

| Flag | Result |
|------|--------|
| `PHASE_3A3_1_PRODUCTION_VALIDATED` | YES |
| `PHASE_3A3_2_PRODUCTION_VALIDATED` | NO (no HF_HISTORICAL under motion) |
| `READY_FOR_RD002` | NO |

## Next step

Motion HF canary on live LTE_R1 telemetry; canonical redeploy of `82f3d9c5c` (restore VPS GitHub deploy auth).

## References

- `docs/audits/dimo-phase-3a3-production-canary-2026-09-02.md`
- `docs/audits/dimo-phase-3a31-fast-prearm-go-remediation-2026-09-02.md`
- `docs/audits/dimo-phase-3a32-hf-watermark-aggregate-identity-remediation-2026-09-02.md`
- `architecture/DIMO_LTE_R1_PHASE_3A31_FAST_PREARM_GO_2026-09-02.md`
- `architecture/DIMO_LTE_R1_PHASE_3A32_HF_WATERMARK_AGGREGATE_IDENTITY_2026-09-02.md`
