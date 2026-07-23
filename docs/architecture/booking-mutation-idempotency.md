# Booking Mutation Idempotency (Prompt 12)

Unified idempotency for critical booking mutations with scoped ledger, request fingerprints, and safe replay.

## Scope key

Each record is uniquely identified by:

| Dimension | Column / source |
|-----------|-----------------|
| Organization | `organizationId` |
| Actor | `actorScope` (`user:{userId}` or `system`) |
| Operation | `BookingIdempotencyOperation` enum |
| Client key | `Idempotency-Key` header |

## Operations

| Operation | HTTP path | Ledger |
|-----------|-----------|--------|
| `BOOKING_CREATE` | `POST .../bookings` | `booking_idempotency_records` |
| `BOOKING_UPDATE_SCHEDULE` | `PATCH .../schedule` | same |
| `BOOKING_UPDATE_VEHICLE` | `PATCH .../vehicle` | same |
| `BOOKING_DOCUMENT_GENERATE` | `POST .../documents/generate-initial-bundle*` | same |
| `BOOKING_DOCUMENT_EMAIL` | `POST .../documents/send-email*` | same |
| Status commands (confirm/cancel/no-show/activate/complete) | `POST .../status/*` | `booking_status_commands` + fingerprint |
| Handover pickup/return | `POST .../handover/pickup|return` | status command ledger (required key) |
| Payment request / checkout / refund | payment routes | existing payment idempotency |

## Request contract

All critical mutations require:

```
Idempotency-Key: <client-generated-stable-key>
```

### Replay semantics

- **Same key + same fingerprint** → stored result returned (`replayed: true` where applicable)
- **Same key + different fingerprint** → `409 IDEMPOTENCY_KEY_REUSED`
- **Concurrent same key** → advisory lock + `PROCESSING` poll; eventual replay or `IDEMPOTENCY_IN_PROGRESS`

Fingerprints are SHA-256 hashes of normalized, sorted JSON payloads. Sensitive fields (signatures, card data, tokens) are redacted — never stored as full request bodies.

## Retention

Configurable via `BOOKING_IDEMPOTENCY_RETENTION_HOURS` (default **72**).

Expired rows can be purged via `BookingIdempotencyService.purgeExpired()`.

## Side effects

Handlers run **once** per successful claim. Replays return stored `resultPayload` / reload booking by `resultReference` without re-running invoice bootstrap, document jobs, or emails.

## Frontend guidance

Use a stable nonce per user action (e.g. `useRef` when opening a dialog) — **do not** generate a new UUID on every render or click.

```typescript
import { createBookingMutationIdempotencyKey } from '@/rental/lib/booking-status-idempotency';

const nonceRef = useRef(crypto.randomUUID());
const key = createBookingMutationIdempotencyKey('cancel', bookingId, nonceRef.current);
await api.bookings.cancel(orgId, bookingId, payload, { idempotencyKey: key });
```

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Missing header |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key used with different payload |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Parallel in-flight duplicate |

Status commands also accept legacy `BOOKING_STATUS_IDEMPOTENCY_KEY_CONFLICT` mapping to `IDEMPOTENCY_KEY_REUSED`.

## Modules

- `booking-idempotency.service.ts` — claim, finalize, replay, purge
- `booking-idempotency.util.ts` — fingerprint hash + redaction
- `booking-idempotency.config.ts` — retention + poll tuning
