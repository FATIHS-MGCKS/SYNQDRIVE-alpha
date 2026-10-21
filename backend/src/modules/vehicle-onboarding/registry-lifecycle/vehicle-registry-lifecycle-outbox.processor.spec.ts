import { VehicleRegistryLifecycleOutboxProcessor } from './vehicle-registry-lifecycle-outbox.processor';
import { SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES } from './vehicle-registry-lifecycle-outbox.constants';

describe('VehicleRegistryLifecycleOutboxProcessor', () => {
  it('registers VEHICLE_ACTIVATED and VEHICLE_OFFBOARDED handlers', () => {
    expect(SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES).toEqual(
      expect.arrayContaining(['VEHICLE_ACTIVATED', 'VEHICLE_OFFBOARDED']),
    );
  });

  it('dispatches VEHICLE_ACTIVATED to onVehicleProvisioned with event-time authority', async () => {
    const occurredAt = new Date('2026-06-01T10:00:00.000Z');
    const row = {
      id: 'outbox-1',
      eventId: 'evt-1',
      eventType: 'VEHICLE_ACTIVATED',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      occurredAt,
      payloadVersion: 1,
      payload: {
        version: 1,
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        onboardingCaseId: 'case-1',
        registryLifecycle: 'ACTIVE',
        activatedAt: occurredAt.toISOString(),
        sourceProviders: [],
      },
      status: 'PENDING',
      retryCount: 0,
    };

    const prisma = {
      vehicleRegistryLifecycleOutbox: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce({ ...row, status: 'PUBLISHED' }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'veh-1', registryLifecycle: 'ACTIVE' }),
      },
    };

    const repository = {
      claimRowById: jest.fn().mockResolvedValue(true),
      markPublishedFromPending: jest.fn().mockResolvedValue(true),
    };

    const billingQuantityVehicle = {
      onVehicleProvisioned: jest.fn().mockResolvedValue({ created: true, event: { id: 'q-1' } }),
    };

    const processor = new VehicleRegistryLifecycleOutboxProcessor(
      prisma as any,
      repository as any,
      { onVehicleOffboardedLifecycleEvent: jest.fn() } as any,
      billingQuantityVehicle as any,
    );

    const outcome = await processor.processRow('outbox-1');
    expect(outcome).toBe('published');
    expect(billingQuantityVehicle.onVehicleProvisioned).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      effectiveAt: occurredAt,
      idempotencyKey: 'vehicle-registry:evt-1:billing-activate:v1',
      retroactiveAuthorized: true,
    });
  });

  it('does not mark published when billing integration throws', async () => {
    const occurredAt = new Date('2026-06-01T10:00:00.000Z');
    const row = {
      id: 'outbox-2',
      eventId: 'evt-2',
      eventType: 'VEHICLE_ACTIVATED',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      occurredAt,
      payloadVersion: 1,
      payload: {
        version: 1,
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        onboardingCaseId: 'case-1',
        registryLifecycle: 'ACTIVE',
        activatedAt: occurredAt.toISOString(),
        sourceProviders: [],
      },
      status: 'PENDING',
      retryCount: 0,
    };

    const prisma = {
      vehicleRegistryLifecycleOutbox: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'veh-1', registryLifecycle: 'ACTIVE' }),
      },
    };

    const repository = {
      claimRowById: jest.fn().mockResolvedValue(true),
      markPublishedFromPending: jest.fn(),
      markRetryFromPending: jest.fn().mockResolvedValue(true),
    };

    const billingQuantityVehicle = {
      onVehicleProvisioned: jest.fn().mockRejectedValue(new Error('billing_failed')),
    };

    const processor = new VehicleRegistryLifecycleOutboxProcessor(
      prisma as any,
      repository as any,
      { onVehicleOffboardedLifecycleEvent: jest.fn() } as any,
      billingQuantityVehicle as any,
    );

    const outcome = await processor.processRow('outbox-2');
    expect(outcome).toBe('retry');
    expect(repository.markPublishedFromPending).not.toHaveBeenCalled();
  });
});
