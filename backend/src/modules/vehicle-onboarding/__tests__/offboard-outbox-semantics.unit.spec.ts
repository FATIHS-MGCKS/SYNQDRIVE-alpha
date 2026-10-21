import {
  assertOffboardOutboxSemanticMatch,
  offboardOutboxSemanticMatch,
} from '../offboarding/offboard-outbox-semantics';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('offboard outbox semantics', () => {
  const base = {
    eventType: 'VEHICLE_OFFBOARDED' as const,
    vehicleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    payloadVersion: 2,
    payload: {
      version: 2,
      vehicleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      registryLifecycle: 'OFFBOARDED' as const,
      offboardedAt: '2026-01-01T00:00:00.000Z',
      reason: 'OFFBOARD_SOLD' as const,
      actorUserId: 'user-1',
    },
  };

  it('matches identical semantics', () => {
    expect(
      offboardOutboxSemanticMatch(base, {
        vehicleId: base.vehicleId,
        organizationId: base.organizationId,
        reason: 'OFFBOARD_SOLD',
        payloadVersion: 2,
      }),
    ).toBe(true);
  });

  it('rejects different reason', () => {
    expect(() =>
      assertOffboardOutboxSemanticMatch(base, {
        vehicleId: base.vehicleId,
        organizationId: base.organizationId,
        reason: 'REMOVE_FROM_PRODUCT',
        payloadVersion: 2,
      }),
    ).toThrow(VehicleOnboardingError);
  });
});
