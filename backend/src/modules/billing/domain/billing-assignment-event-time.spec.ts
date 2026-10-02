import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import type { BillableVehiclePolicyAssignment } from './billable-vehicle-policy';
import {
  filterAssignmentsForRegistryOffboardPrestate,
  isEffectivelyBillableAssignmentAt,
} from './billing-assignment-event-time';

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

describe('billing-assignment-event-time', () => {
  const boundary = new Date('2026-07-01T12:00:00.000Z');

  it('treats ENDED assignment as billable at boundary when period still covers boundary', () => {
    expect(
      isEffectivelyBillableAssignmentAt(
        assignment({
          id: 'a1',
          vehicleId: 'v1',
          status: BillingBillableVehicleAssignmentStatus.ENDED,
          billableUntil: new Date('2026-07-01T12:30:00.000Z'),
        }),
        boundary,
      ),
    ).toBe(true);
  });

  it('excludes assignments created after registry boundary from prestate', () => {
    const boundary = new Date('2026-07-01T12:00:00.000Z');
    const rows = filterAssignmentsForRegistryOffboardPrestate(
      [
        assignment({
          id: 'a1',
          vehicleId: 'v1',
          createdAt: new Date('2026-07-01T11:00:00.000Z'),
        }),
        assignment({
          id: 'a2',
          vehicleId: 'v1',
          createdAt: new Date('2026-07-01T13:00:00.000Z'),
        }),
      ],
      boundary,
    );
    expect(rows.map((r) => r.id)).toEqual(['a1']);
  });

  it('rejects assignment ended before boundary', () => {
    expect(
      isEffectivelyBillableAssignmentAt(
        assignment({
          id: 'a1',
          vehicleId: 'v1',
          status: BillingBillableVehicleAssignmentStatus.ENDED,
          billableUntil: new Date('2026-06-01T00:00:00.000Z'),
        }),
        boundary,
      ),
    ).toBe(false);
  });
});
