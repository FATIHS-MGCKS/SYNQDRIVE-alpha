# BullMQ v5 Custom Job ID Compatibility — August 2026

## Invariant

**No custom BullMQ `jobId` passed to `queue.add()` / `queue.addBulk()` may contain `:` (colon).**

BullMQ v5 rejects such IDs with `Custom Id cannot contain :`. All SynqDrive producers must route logical identity through the canonical compatibility boundary:

- **Helper:** `backend/src/shared/queue/bullmq-job-id.sanitizer.ts`
- **Functions:** `sanitizeBullMqJobId()`, `isBullMqCompatibleJobId()`, `fingerprintBullMqJobIdKey()`

## Encoding rules

| Rule | Behavior |
|------|----------|
| Determinism | Same `{ namespace, key }` → same `jobId` |
| Colon in logical key | Encoded injectively (`:` → `_3a`, `_` → `__`, …) |
| Length overflow | SHA-256 hash fallback with namespace prefix |
| Integer-only output | Prefixed with `j_` (BullMQ rejects pure numeric ids) |
| Collision safety | `a:b` and `a_b` remain distinct after encoding |

## Producer conventions

| Pattern | Example namespace | Notes |
|---------|-------------------|-------|
| Outbox id dedup | `payment-email`, `notification-delivery`, `task-automation` | Key = outbox row UUID |
| Org-scoped evaluation | `notification-evaluation` | Key = `{orgId}:{triggerClass}` (logical, encoded) |
| Vehicle scheduler bucket | `dtc-poll`, `brake-recalc`, `tire-recalc` | Key includes hour/3h bucket |
| Webhook ingest | `voice-webhook`, `voice-webhook-replay` | Replay key includes timestamp |
| Connectivity (closed) | `connectivity-webhook__{inboxId}` | Uses `__` delimiter directly (pre-sanitizer fix) |
| Battery V2 | `battery-v2` | Already on sanitizer since July 2026 migration |
| Booking docs | `booking-doc` | Idempotency key colon segments encoded |

## Migration pattern

1. Keep logical idempotency keys unchanged (may contain `:` for DB/outbox dedup).
2. Add or update `build*JobId()` to call `sanitizeBullMqJobId({ namespace, key })`.
3. Use the same builder for `getJob()` / terminal cleanup before re-enqueue.
4. Add unit test: `expect(jobId).not.toContain(':')` + `isBullMqCompatibleJobId(jobId)`.
5. Extend `bullmq-job-id.producers.audit.spec.ts` canonical builder list.

## Test coverage

| Suite | Scope |
|-------|-------|
| `bullmq-job-id.sanitizer.spec.ts` | Encoder, collision, hash fallback |
| `bullmq-job-id.producers.audit.spec.ts` | All canonical builders + static `jobId:` scan |
| Per-queue `*.util.spec.ts` | Producer-specific dedup/replay semantics |
| `device-connection-webhook-queue.producer.spec.ts` | Connectivity regression (unchanged `__` format) |

## Operational note

Pre-fix Production logs showed recurring `[Scheduler] Error: Custom Id cannot contain :` from non-connectivity producers (DTC poll fan-out, notification evaluation, payment email, task automation, brake recalc, voice webhook). Connectivity path was repaired separately (`655f9dbe`); this document covers the global hardening pass (August 2026).

**Do not** flush Redis or delete pending jobs during migration — job id format changes only affect newly enqueued jobs; existing in-flight jobs complete naturally.
