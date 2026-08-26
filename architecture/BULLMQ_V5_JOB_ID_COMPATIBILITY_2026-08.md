# BullMQ v5 custom job ID compatibility (2026-08)

## Invariant

**No custom `jobId` passed to BullMQ `queue.add()` may contain `:` (colon).**

BullMQ v5 rejects most colon-containing custom job IDs (`Custom Id cannot contain :`). This broke production connectivity webhook enqueue (`connectivity-webhook:{inboxId}`) before the 2026-08 delimiter fix.

## Canonical boundary

All BullMQ custom job IDs must be produced through:

- **`sanitizeBullMqJobId({ namespace?, key })`** — `@shared/queue/bullmq-job-id.sanitizer`
- **Domain `build*JobId()` helpers** that delegate to `sanitizeBullMqJobId`, or
- **Pre-approved delimiter conventions** that never emit `:` (e.g. connectivity `connectivity-webhook__{inboxId}`).

### Determinism & deduplication

- Same logical `(namespace, key)` → same BullMQ `jobId` (required for BullMQ dedup / idempotency).
- Logical keys may still use `:` internally; the sanitizer encodes them injectively (`:` → `_3a`, `_` → `__`).
- Collision example prevented: `a:b` → `a_3ab`, `a_b` → `a__b`.

### Validation helper

- **`isBullMqCompatibleJobId(jobId)`** — test/dev contract; returns false for colons, whitespace, pure integers.

## Producer pattern

```typescript
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

export function buildExampleJobId(entityId: string): string {
  return sanitizeBullMqJobId({
    namespace: 'example-queue',
    key: entityId,
  });
}

await queue.add(jobName, data, {
  jobId: buildExampleJobId(entityId),
  // ...existing attempts/backoff/removeOn* unchanged
});
```

Do **not**:
- Remove custom job IDs to avoid the error
- Use blind `.replace(/:/g, '_')` (collision-prone)
- Change queue names, worker concurrency, or domain/outbox IDs

## Regression tests

- `backend/src/shared/queue/bullmq-job-id.sanitizer.spec.ts` — sanitizer injectivity, hashing, compatibility
- `backend/src/shared/queue/bullmq-job-id.producers.spec.ts` — cross-producer contract (no colons, determinism, replay distinguishability)

## Related production incident

Connectivity webhook inbox → BullMQ path: commit `655f9dbe` replaced `connectivity-webhook:{inboxId}` with `connectivity-webhook__{inboxId}`.
