import { createHash } from 'crypto';
import {
  hashBookingIdempotencyRequest,
  sanitizeBookingIdempotencyAuditPayload,
} from './booking-idempotency.util';

describe('booking-idempotency.util', () => {
  it('produces stable fingerprints regardless of key order', () => {
    const a = hashBookingIdempotencyRequest({ b: 2, a: 1 });
    const b = hashBookingIdempotencyRequest({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changes fingerprint when payload changes', () => {
    const a = hashBookingIdempotencyRequest({ vehicleId: 'v1' });
    const b = hashBookingIdempotencyRequest({ vehicleId: 'v2' });
    expect(a).not.toBe(b);
  });

  it('redacts sensitive fields for audit storage', () => {
    const sanitized = sanitizeBookingIdempotencyAuditPayload({
      vehicleId: 'v1',
      customerSignatureDataUrl: 'data:image/png;base64,abc',
      nested: { token: 'secret-token', odometerKm: 12000 },
    });
    expect(sanitized).toEqual({
      vehicleId: 'v1',
      customerSignatureDataUrl: '[REDACTED]',
      nested: { token: '[REDACTED]', odometerKm: 12000 },
    });
  });
});
