import { describe, expect, it, vi } from 'vitest';
import { createOffboardIntentSession } from './offboard-intent-session';

vi.mock('../../lib/mfa', () => ({
  newIdempotencyKey: vi.fn((prefix: string) => `${prefix}:mock-key-${Math.random()}`),
}));

describe('offboard intent session', () => {
  it('K — different vehicle after abandon gets new key', () => {
    const session = createOffboardIntentSession();
    const keyA = session.resolveIdempotencyKey({
      organizationId: 'o1',
      vehicleId: 'v1',
      reason: 'REMOVE_FROM_PRODUCT',
    });
    session.abandon();
    const keyB = session.resolveIdempotencyKey({
      organizationId: 'o1',
      vehicleId: 'v2',
      reason: 'REMOVE_FROM_PRODUCT',
    });
    expect(keyA).not.toBe(keyB);
  });

  it('same semantic intent reuses key until settled', () => {
    const session = createOffboardIntentSession();
    const key1 = session.resolveIdempotencyKey({
      organizationId: 'o1',
      vehicleId: 'v1',
      reason: 'OFFBOARD_SOLD',
      note: 'n1',
    });
    const key2 = session.resolveIdempotencyKey({
      organizationId: 'o1',
      vehicleId: 'v1',
      reason: 'OFFBOARD_SOLD',
      note: 'n1',
    });
    expect(key1).toBe(key2);
    session.settle();
    expect(session.peekIdempotencyKey()).toBeNull();
  });

  it('changed note produces new key', () => {
    const session = createOffboardIntentSession();
    const key1 = session.resolveIdempotencyKey({
      organizationId: 'o1',
      vehicleId: 'v1',
      reason: 'REMOVE_FROM_PRODUCT',
      note: 'a',
    });
    const key2 = session.resolveIdempotencyKey({
      organizationId: 'o1',
      vehicleId: 'v1',
      reason: 'REMOVE_FROM_PRODUCT',
      note: 'b',
    });
    expect(key1).not.toBe(key2);
  });
});
