# M3.0D.3 — Reservation authority + FAILED rearm runtime closure

**Branch:** `cursor/battery-v2-m3-0d-reconcile-liveness-90ec`  
**PR:** #1519  
**Status:** CODE COMPLETE — not deployed

## Blocker 1 — Fail-closed reservation authority

`BatteryV2AssessDispatchReservationService.acquireForDispatch` returns explicit semantics:

| Result | Meaning | Producer behavior |
|--------|---------|-------------------|
| `ACQUIRED` | NX reserve succeeded | Proceed; release on enqueue failure only if acquired here |
| `SAME_IDENTITY_HELD` | Same idempotency key already reserved | Proceed; never release another invocation's reservation |
| `CONFLICT` | Different key holds vehicle | Suppress enqueue (`duplicate`) |
| `AUTHORITY_UNAVAILABLE` | Redis error on SET/GET | Suppress enqueue — **never** dispatch unprotected assess job |

`hasConflictingReservation` / `hasReservationForVehicle` fail-closed: `AUTHORITY_UNAVAILABLE` → treat as conflict/present.

## Blocker 2 — Ownership + atomic refresh + final cleanup

- **Ownership:** producer tracks `reservationAcquiredByThisInvocation`; `release` only when true.
- **Atomic refresh:** Lua `GET == owner → PEXPIRE`; stale processor cannot extend replacement reservation.
- **Final cleanup:** processor releases assess reservation on success, `already_completed` skip, and **any** final exhausted attempt (`attempt >= maxAttempts`), including retryable classifier outcomes.

Reservation TTL remains 30 minutes for crash-recovery margin.

## Blocker 3 — FAILED rearm (Option B — narrow automatic)

Candidate SQL admits `FAILED` only when durable metadata proves:

- `outcome = PERSISTENCE_FAILED`
- `failureHistory.errorCode = HANDLER_FAILED`
- `failureHistory.errorMessage` contains 54000 / index row size / program_limit_exceeded

`tryRearmFailedHandoffIfEligible` uses `isLegacyPersistence54000HandoffFailure` — **not** merely absent DLQ.

Scheduler path: `reconcileAll` → `fetchRestAssessmentHandoffReconcileCandidates` → `reconcileAssessmentHandoff` → narrow rearm → enqueue.

## Fairness (unchanged)

One repair per vehicle per reconciliation pass. Production historical cluster max ≈ **17** handoffs/vehicle → worst case ≈ **16 × 5 min = 80 min**. Event-driven drain deferred.

## Preserved

- ENQUEUED + legacy 54000 DLQ narrow clear → digest assess → persistence → EXECUTED
- Digest idempotency + legacy compatibility lookup
- `PUBLICATION_CHANGED = NO`, `REST_SHADOW_CHANGED = NO`
