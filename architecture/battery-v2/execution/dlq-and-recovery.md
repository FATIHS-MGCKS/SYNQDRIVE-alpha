# Battery V2 — DLQ and Recovery

**Epistemic status:** CONFIRMED (post-#1445 semantics)

## Dead letter service

`BatteryV2JobDeadLetterService`

- `isDeadLetter(jobType, idempotencyKey)` — blocks primary enqueue
- `clearDeadLetter(...)` — **per-entity** only on explicit recovery paths

## Recovery enqueue

Producers accept `recovery: true`:

- `BatteryV2LvRestSessionProducer`
- `BatteryV2RestTargetProducer`

Sets `ignoreDeadLetter: true` on `BatteryV2JobProducerService.enqueue()`.

## Transient error classes (from architecture memos)

`LOCK_CONTENTION`, `PROVIDER_UNAVAILABLE`, `TRANSIENT_INFRA` — intended for per-entity clear on recovery, not bulk scheduler pre-clear.

## Failed approach (superseded)

Bulk `clearReplayableDeadLetters()` before reconciliation **defeated** ENQUEUED+DLQ per-entity rescue.

**Graph:** `BAT-V2-FAIL-BULK-DLQ-001` → superseded by `BAT-V2-DEC-1445-001`

## DLQ replay env gate

`BATTERY_V2_DLQ_REPLAY_ENABLED` — mentioned in #1445 architecture memo; full semantics not reconstructed.
