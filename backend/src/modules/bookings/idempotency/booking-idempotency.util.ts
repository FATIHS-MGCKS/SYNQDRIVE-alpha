import { createHash } from 'crypto';
import { BOOKING_IDEMPOTENCY_SENSITIVE_KEYS } from './booking-idempotency.constants';

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function normalizeBookingIdempotencyPayload(payload: unknown): unknown {
  return sortValue(payload);
}

export function hashBookingIdempotencyRequest(payload: unknown): string {
  const normalized = JSON.stringify(normalizeBookingIdempotencyPayload(payload));
  return createHash('sha256').update(normalized).digest('hex');
}

export function sanitizeBookingIdempotencyAuditPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBookingIdempotencyAuditPayload(item)) as T;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (BOOKING_IDEMPOTENCY_SENSITIVE_KEYS.has(key)) {
        next[key] = '[REDACTED]';
        continue;
      }
      next[key] = sanitizeBookingIdempotencyAuditPayload(nested);
    }
    return next as T;
  }
  return value;
}

export function resolveBookingActorScope(actorUserId?: string | null): string {
  const trimmed = actorUserId?.trim();
  return trimmed ? `user:${trimmed}` : 'system';
}
