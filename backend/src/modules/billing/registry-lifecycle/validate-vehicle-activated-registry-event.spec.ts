import {
  buildRegistryActivateBillingIdempotencyKey,
  validateVehicleActivatedRegistryEvent,
} from './validate-vehicle-activated-registry-event';
import { VehicleRegistryLifecycleBillingValidationError } from './validate-vehicle-offboarded-registry-event';
import { ACTIVATION_OUTBOX_PAYLOAD_VERSION } from '@modules/vehicle-onboarding/contracts/vo-document-versions';

function baseRow(overrides: Record<string, unknown> = {}) {
  const occurredAt = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'outbox-1',
    eventId: 'evt-activate-1',
    eventType: 'VEHICLE_ACTIVATED',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    occurredAt,
    payloadVersion: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
    payload: {
      version: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      onboardingCaseId: 'case-1',
      registryLifecycle: 'ACTIVE',
      activatedAt: occurredAt.toISOString(),
      sourceProviders: ['DIMO'],
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

describe('validateVehicleActivatedRegistryEvent', () => {
  it('accepts a consistent VEHICLE_ACTIVATED v1 payload', () => {
    const validated = validateVehicleActivatedRegistryEvent(baseRow());
    expect(validated.eventId).toBe('evt-activate-1');
    expect(validated.onboardingCaseId).toBe('case-1');
  });

  it('rejects payload row identity mismatch', () => {
    expect(() =>
      validateVehicleActivatedRegistryEvent(
        baseRow({
          payload: {
            ...baseRow().payload,
            vehicleId: 'other-vehicle',
          },
        }),
      ),
    ).toThrow(VehicleRegistryLifecycleBillingValidationError);
  });

  it('rejects activatedAt mismatch with occurredAt', () => {
    expect(() =>
      validateVehicleActivatedRegistryEvent(
        baseRow({
          payload: {
            ...baseRow().payload,
            activatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    ).toThrow(VehicleRegistryLifecycleBillingValidationError);
  });

  it('builds deterministic activate billing idempotency key', () => {
    expect(buildRegistryActivateBillingIdempotencyKey('evt-abc')).toBe(
      'vehicle-registry:evt-abc:billing-activate:v1',
    );
  });
});
