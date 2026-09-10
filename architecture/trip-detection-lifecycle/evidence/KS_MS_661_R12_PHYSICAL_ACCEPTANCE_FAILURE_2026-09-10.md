# KS MS 661 — R12 physical acceptance failure (end-cycle lock contention)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-KS661-ACCEPT-FAIL-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE |
| **Audited production SHA** | `2f1b4f53d` (pre-#1600) |
| **Vehicle / trip** | KS MS 661 / `2bdc6e71-3822-4c9e-bda3-b46c681e6844` |
| **Timestamp (UTC)** | 2026-09-10 |
| **Classification** | PHYSICAL_ACCEPTANCE_FAILURE — trip stuck `POSSIBLE_END` |

## Observed failure

1. Trip reached `POSSIBLE_END` with durable evidence (`stopBoundaryAt`, `possibleEndEnteredAt` in `lastEvidenceSummary`).
2. `END_VALIDATION` schedule failed: BullMQ `Job … could not be removed because it is locked by another worker`.
3. Audit read: `state=POSSIBLE_END`, `possible_end_at=NULL`, `possible_end_entered_at=NULL`.
4. Pre-R12 anchor resolution degraded dwell/boundary to `updatedAt` / `workerNow` when DB columns null.

## Root causes (bounded)

| Layer | Cause | Confidence |
|-------|-------|------------|
| Queue | `enqueueEndCycleTripTrackingJob` recycled slots via `Job.remove()` on **active** primary | CONFIRMED |
| Clock | No direct writer nulls PE columns while staying `POSSIBLE_END`; NULL shape = never-reconciled columns + evidence-only durability | CONFIRMED (writer audit) |
| Dwell | Missing columns + pre-R12 sliding `updatedAt` / fabricated `workerNow` in reconcile | CONFIRMED |

## #1600 fix scope (follow-up hardening)

- Stable-slot **family** arbitration `{primary, primary__succ}` — at most one future end-cycle authority.
- Never `remove()` active / waiting-children jobs.
- `reconcilePossibleEndClockColumns`: restore from evidence only; **no** `workerNow` episode token fabrication.
- `readTrustedStopBoundaryFromEvidence`: `stopBoundaryTrust === true` + trusted clock authority required.
- PEC evidence scheduling uses `readPossibleEndEnteredAtFromEvidence` only for episode token (not dwell anchor).

## Explicit non-actions

- Did **not** repair stuck trip `2bdc6e71…` on Production.
- Did **not** deploy #1600 to Production.
- R12 physical acceptance remains **PENDING_NEW_DRIVE** after merge + deploy.

## Validation commands

```bash
cd backend
npm test -- trip-r12-stable-slot-family trip-r12-clock-writer-audit trip-r12-end-cycle-lock-contention
npm run test:trip-r11:unit
npm test -- trip-fsm-motor-off-pause-r10
bash ../architecture/scripts/validate-module-registry.sh
```

## Related evidence

- [KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md](./KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md)
- [KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md](./KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md)
