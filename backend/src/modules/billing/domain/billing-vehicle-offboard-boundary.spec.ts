import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import type {
  BillableVehiclePolicyAssignment,
  BillableVehiclePolicyContext,
  BillableVehiclePolicyVehicle,
} from './billable-vehicle-policy';
import { wasVehicleBillableAtOffboardBoundary } from './billing-vehicle-offboard-boundary';

function vehicle(
  partial: Partial<BillableVehiclePolicyVehicle> & Pick<BillableVehiclePolicyVehicle, 'id'>,
): BillableVehiclePolicyVehicle {
  return {
    organizationId: 'org-1',
    licensePlate: 'B-AB 1',
    vin: 'VIN1',
    make: 'VW',
    model: 'ID.3',
    ...partial,
  };
}

function assignment(
  partial: Partial<BillableVehiclePolicyAssignment> &
    Pick<BillableVehiclePolicyAssignment, 'id' | 'vehicleId'>,
): BillableVehiclePolicyAssignment {
  return {
    organizationId: 'org-1',
    subscriptionItemId: 'item-base',
    billableFrom: new Date('2026-01-01'),
    billableUntil: null,
    status: BillingBillableVehicleAssignmentStatus.ACTIVE,
    reasonCode: null,
    reasonNote: null,
    approvedByUserId: 'user-1',
    ...partial,
  };
}

function context(
  partial: Partial<BillableVehiclePolicyContext> & Pick<BillableVehiclePolicyContext, 'vehicles'>,
): BillableVehiclePolicyContext {
  return {
    organizationId: 'org-1',
    organizationActive: true,
    baseSubscriptionItemId: 'item-base',
    baseSubscriptionItemActive: true,
    asOf: new Date('2026-07-15'),
    legacyImplicitAssignments: false,
    assignments: [],
    ...partial,
  };
}

describe('wasVehicleBillableAtOffboardBoundary', () => {
  it('treats OFFBOARDED registry row as billable at boundary when assignment qualifies', () => {
    const ctx = context({
      vehicles: [vehicle({ id: 'v1', registryLifecycle: 'OFFBOARDED' })],
      assignments: [assignment({ id: 'a1', vehicleId: 'v1' })],
    });
    expect(wasVehicleBillableAtOffboardBoundary(ctx, 'v1')).toBe(true);
  });

  it('returns false for demo exclusion even when registry is OFFBOARDED in DB', () => {
    const ctx = context({
      vehicles: [vehicle({ id: 'v1', registryLifecycle: 'OFFBOARDED' })],
      assignments: [
        assignment({
          id: 'a1',
          vehicleId: 'v1',
          status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
          reasonCode: 'DEMO',
          approvedByUserId: null,
        }),
      ],
    });
    expect(wasVehicleBillableAtOffboardBoundary(ctx, 'v1')).toBe(false);
  });
});
