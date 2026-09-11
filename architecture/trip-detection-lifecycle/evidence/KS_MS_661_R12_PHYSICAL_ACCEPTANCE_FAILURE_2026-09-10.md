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
| Queue | `enqueueEndCycleTripTrackingJob` recycled slots via `Job.remove()` on **active** primary | **CONFIRMED** |
| Clock loss writer | No **current** repository writer clears both PE columns while `state` stays `POSSIBLE_END`; canonical entry always writes both clocks | **CONFIRMED** (writer audit) |
| Clock loss sequence | **How** Production row reached `POSSIBLE_END` + both NULL — not reproduced from committed code | **UNRESOLVED** |
| Recovery | `reconcilePossibleEndClockColumns` + evidence anchors restore durable clocks without `workerNow` fabrication | **PROVEN** |
| Dwell (pre-R12) | Missing columns + sliding `updatedAt` / fabricated `workerNow` in old reconcile | **CONFIRMED** (historical) |

### Clock loss classification (pre-merge audit 2026-09-11)

```
CLOCK_LOSS_DIRECT_WRITER_WHILE_POSSIBLE_END = NONE (current repo)
CLOCK_LOSS_ROOT_CAUSE = UNRESOLVED
RECOVERY_HARDENING = PROVEN
```

Plausible **unproven** historical sequences (not demonstrated as single writer in git):

- Pre-R12 deployment gap: evidence durable in JSON but DB columns never persisted or were lost externally
- R1 migration `20260906120000`: `possible_end_entered_at` added without backfill (typically one NULL, not both)
- Manual / out-of-band DB mutation
- Removed pre-audit code path no longer present at `2f1b4f53d`

## #1600 fix scope (follow-up hardening)

- Stable-slot **family** arbitration `{primary, primary__succ}` — at most one future end-cycle authority.
- Never `remove()` active / waiting-children jobs.
- `reconcilePossibleEndClockColumns`: restore from evidence only; **no** `workerNow` episode token fabrication.
- **R12 recovery trust (strict):** `readR12RecoveryTrustedStopBoundaryFromEvidence` requires **`stopBoundaryTrust === true`** (explicit boolean) **and** trusted clock authority **and** valid timestamp. Missing trust does **not** grant recovery authority (unlike global anchor `readTrustedStopBoundaryFromEvidence` inference).
- PEC evidence scheduling uses `readPossibleEndEnteredAtFromEvidence` only for episode token (not dwell anchor).
- Real BullMQ two-worker ACTIVE-lock integration regression in CI (`trip-r12-active-lock-end-cycle`).

## Explicit non-actions

- Did **not** repair stuck trip `2bdc6e71…` on Production.
- Did **not** deploy #1600 to Production.
- R12 physical acceptance remains **PENDING_NEW_DRIVE** after merge + deploy.

## Validation commands

```bash
cd backend
npm run test:trip-r12:hardening
npm run test:trip-r11:unit
npm run test:trip-r11:postgres-redis:ci
npm test -- trip-fsm-motor-off-pause-r10
bash ../architecture/scripts/validate-module-registry.sh
```

## Related evidence

- [KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md](./KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md)
- [KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md](./KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md)
