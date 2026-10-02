import { RegistryBillingPermanentIntegrityError } from './registry-billing-permanent-integrity.error';
import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import { BillingVehicleRegistryOffboardProjection } from './billing-vehicle-registry-offboard.projection';
import type { ValidatedVehicleOffboardedRegistryEvent } from './validate-vehicle-offboarded-registry-event';

describe('BillingVehicleRegistryOffboardProjection', () => {
  const event: ValidatedVehicleOffboardedRegistryEvent = {
    outboxId: 'outbox-1',
    eventId: 'evt-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    occurredAt: new Date('2026-07-01T12:00:00.000Z'),
    payloadVersion: 2,
    reason: 'REMOVE_FROM_PRODUCT',
    actorUserId: 'actor-1',
  };

  it('fails closed when multiple effective billable assignments exist', async () => {
    const prisma = {
      billingQuantityEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      billingSubscriptionItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'item-base',
            subscriptionId: 'sub-1',
            organizationId: 'org-1',
            validFrom: new Date('2020-01-01'),
            validTo: null,
            subscription: { startedAt: null, endedAt: null, status: 'ACTIVE' },
          },
        ]),
      },
      $executeRaw: jest.fn(),
      billingBillableVehicleAssignment: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          billingSubscriptionItem: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'item-base',
                subscriptionId: 'sub-1',
                organizationId: 'org-1',
                validFrom: new Date('2020-01-01'),
                validTo: null,
                subscription: { startedAt: null, endedAt: null, status: 'ACTIVE' },
              },
            ]),
          },
          $executeRaw: jest.fn(),
          billingBillableVehicleAssignment: { findUnique: jest.fn(), update: jest.fn() },
          billingQuantityEvent: {
            findUnique: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
        }),
      ),
    };
    const billableVehicles = {
      buildRegistryOffboardPolicyContext: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        organizationActive: true,
        baseSubscriptionItemId: 'item-base',
        baseSubscriptionItemActive: true,
        asOf: event.occurredAt,
        legacyImplicitAssignments: false,
        vehicles: [
          {
            id: 'veh-1',
            organizationId: 'org-1',
            licensePlate: null,
            vin: 'VIN',
            make: 'VW',
            model: 'ID.3',
            registryLifecycle: 'OFFBOARDED',
          },
        ],
        assignments: [
          {
            id: 'a1',
            organizationId: 'org-1',
            vehicleId: 'veh-1',
            subscriptionItemId: 'item-base',
            billableFrom: new Date('2020-01-01'),
            billableUntil: null,
            status: BillingBillableVehicleAssignmentStatus.ACTIVE,
            reasonCode: null,
            reasonNote: null,
            approvedByUserId: 'user-1',
          },
          {
            id: 'a2',
            organizationId: 'org-1',
            vehicleId: 'veh-1',
            subscriptionItemId: 'item-base',
            billableFrom: new Date('2020-01-01'),
            billableUntil: null,
            status: BillingBillableVehicleAssignmentStatus.ACTIVE,
            reasonCode: null,
            reasonNote: null,
            approvedByUserId: 'user-2',
          },
        ],
      }),
    };
    const quantity = {
      recordEventInTransaction: jest.fn(),
    };

    const projection = new BillingVehicleRegistryOffboardProjection(
      prisma as any,
      billableVehicles as any,
      quantity as any,
    );

    await expect(projection.onVehicleOffboardedLifecycleEvent(event)).rejects.toBeInstanceOf(
      RegistryBillingPermanentIntegrityError,
    );
    expect(quantity.recordEventInTransaction).not.toHaveBeenCalled();
  });
});
