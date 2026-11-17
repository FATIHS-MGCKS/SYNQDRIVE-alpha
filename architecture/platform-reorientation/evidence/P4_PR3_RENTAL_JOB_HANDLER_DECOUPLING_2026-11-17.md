# P4-PR3 — Rental recompute job handler port (fail-closed dispatch)

**Date:** 2026-11-17 (Europe/Berlin)  
**Base `origin/main`:** `acb87a29f164bbb935afa55fb60de3fa4cd9d614` (P4-PR2 merged #2424)  
**Reference (architecture only):** [SYNQDRIVE-CORE PR #11](https://github.com/FATIHS-MGCKS/SYNQDRIVE-CORE/pull/11)

## Change

| Area | Before | After |
|------|--------|--------|
| `DrivingIntelligenceJobHandlerRegistry` | `forwardRef` inject `RentalDrivingAnalysisRecomputeJobHandler` | Inject `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT` |
| Missing rental wiring | Silent noop stub on `RENTAL_DRIVING_ANALYSIS_RECOMPUTE` | Fail-closed: dispatch throws `handler not configured` |
| Rental module | Handler class export only | `useExisting` port binding; single handler instance |

## Parity

- `RENTAL_DRIVING_ANALYSIS_RECOMPUTE` job type, payload, queue, processor, retry/DLQ semantics unchanged
- Handler `handle(job)` invoked exactly once when port is wired
- No Prisma/schema/M2M changes

## Remaining Core/Rental dependencies (explicit)

- `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` `forwardRef` (port export)
- `DrivingIntelligenceBookingResolutionModule` (P4-PR1)
- `RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT` (P4-PR2)
- VI paths still import Rental **types/constants** (e.g. recompute reasons) — not removed in P4-PR3
- Driver attribution / trip flows may still touch `prisma.booking` outside job registry

**Production validation:** **NOT_CLAIMED**