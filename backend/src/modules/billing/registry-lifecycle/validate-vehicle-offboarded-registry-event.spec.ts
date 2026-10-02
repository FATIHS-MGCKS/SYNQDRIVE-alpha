import {
  VehicleRegistryLifecycleBillingValidationError,
  buildRegistryOffboardBillingIdempotencyKey,
  validateVehicleOffboardedRegistryEvent,
} from './validate-vehicle-offboarded-registry-event';
import { OFFBOARD_OUTBOX_PAYLOAD_VERSION } from '@modules/vehicle-onboarding/contracts/offboard-outbox-payload.v1';

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    eventId: 'evt-1',
    eventType: 'VEHICLE_OFFBOARDED',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    occurredAt: new Date('2026-07-01T12:00:00.000Z'),
    payloadVersion: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
    payload: {
      version: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: '2026-07-01T12:00:00.000Z',
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: 'user-actor',
    },
    status: 'PENDING',
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

describe('validateVehicleOffboardedRegistryEvent', () => {
  it('accepts a consistent VEHICLE_OFFBOARDED v2 payload', () => {
    const validated = validateVehicleOffboardedRegistryEvent(baseRow());
    expect(validated.eventId).toBe('evt-1');
    expect(validated.actorUserId).toBe('user-actor');
  });

  it('rejects payload row identity mismatch', () => {
    expect(() =>
      validateVehicleOffboardedRegistryEvent(
        baseRow({
          payload: {
            ...baseRow().payload,
            vehicleId: 'other-vehicle',
          },
        }),
      ),
    ).toThrow(VehicleRegistryLifecycleBillingValidationError);
  });

  it('rejects unsupported payload version', () => {
    expect(() =>
      validateVehicleOffboardedRegistryEvent(
        baseRow({ payloadVersion: 1, payload: { version: 1 } }),
      ),
    ).toThrow(VehicleRegistryLifecycleBillingValidationError);
  });

  it('builds deterministic billing idempotency keys from event id', () => {
    expect(buildRegistryOffboardBillingIdempotencyKey('abc')).toBe(
      'vehicle-registry:abc:billing-offboard:v1',
    );
    expect(buildRegistryOffboardBillingIdempotencyKey('xyz')).not.toBe(
      buildRegistryOffboardBillingIdempotencyKey('abc'),
    );
  });
});
