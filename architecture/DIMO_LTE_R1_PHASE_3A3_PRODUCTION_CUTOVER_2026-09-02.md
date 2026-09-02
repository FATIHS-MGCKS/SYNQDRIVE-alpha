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
Deploy f00a49394 (main: 3A.3.1 + 3A.3.2 + runner fix + DI-EV-0022 docs)
        ↓
PRE-ARM → FAST GO → observe cycles → STOP (post-deploy smoke)
        ↓
Post-smoke integrity (unique index valid, duplicates=0)
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

## Canonical redeploy + post-deploy smoke (2026-09-02)

| Item | Value |
|------|-------|
| `CANONICAL_VPS_REDEPLOY_VERIFIED` | YES (`f00a49394` on both replicas) |
| Post-deploy smoke session | `cc30f049-e83e-4ebb-a172-bb007a8b609f` |
| FAST GO | READY_TO_DRIVE in 1515 ms |
| Cycles | 7 completed |
| Observations | 87 SIGNAL_POINT, 0 HF_HISTORICAL |
| `POST_DEPLOY_STATIONARY_SMOKE` | PASS |

## Initial cutover canary (stationary, morning)

## Verdicts

| Flag | Result |
|------|--------|
| `PHASE_3A3_1_PRODUCTION_VALIDATED` | YES |
| `PHASE_3A3_2_PRODUCTION_VALIDATED` | NO (no HF_HISTORICAL under motion) |
| `READY_FOR_RD002` | NO |

## Next step

Controlled motion HF canary on WOB L 7503. Canonical deploy provenance verified at `f00a49394`. Durable VPS GitHub read credential still recommended for unattended deploys.

## References

- `docs/audits/dimo-phase-3a3-production-canary-2026-09-02.md`
- `docs/audits/dimo-phase-3a31-fast-prearm-go-remediation-2026-09-02.md`
- `docs/audits/dimo-phase-3a32-hf-watermark-aggregate-identity-remediation-2026-09-02.md`
- `architecture/DIMO_LTE_R1_PHASE_3A31_FAST_PREARM_GO_2026-09-02.md`
- `architecture/DIMO_LTE_R1_PHASE_3A32_HF_WATERMARK_AGGREGATE_IDENTITY_2026-09-02.md`
