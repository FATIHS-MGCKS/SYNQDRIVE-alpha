import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import {
  BillableVehicleAssignmentReasonCode,
  BillableVehicleExclusionReason,
  BillableVehiclePolicyAssignment,
  BillableVehiclePolicyContext,
  BillableVehiclePolicyVehicle,
  evaluateBillableVehiclePolicy,
} from './billable-vehicle-policy';

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

describe('billable-vehicle-policy', () => {
  it('does not exclude vehicles based on rename or demo marker in display name', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        vehicles: [vehicle({ id: 'v1', licensePlate: 'Renamed Demo Car' })],
        assignments: [assignment({ id: 'a1', vehicleId: 'v1' })],
      }),
    );

    expect(result.billableVehicleCount).toBe(1);
  });

  it('keeps vehicles billable when telemetry/provider connectivity is offline', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [assignment({ id: 'a1', vehicleId: 'v1' })],
        connectivityByVehicleId: { 'v1': false },
      }),
    );

    expect(result.billableVehicleCount).toBe(1);
    expect(result.billableVehicles[0].connectivityStatus).toBe('NOT_CONNECTED');
  });

  it('keeps vehicles billable when provider is disconnected but assignment is active', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [assignment({ id: 'a1', vehicleId: 'v1' })],
        connectivityByVehicleId: {},
      }),
    );

    expect(result.billableVehicleCount).toBe(1);
  });

  it('excludes vehicles with explicit demo assignment type', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [
          assignment({
            id: 'a-demo',
            vehicleId: 'v1',
            status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
            reasonCode: BillableVehicleAssignmentReasonCode.DEMO,
            approvedByUserId: 'user-1',
          }),
        ],
      }),
    );

    expect(result.billableVehicleCount).toBe(0);
    expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.DEMO_ASSIGNMENT);
  });

  it('does not apply billing exclusion outside its approved period', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        asOf: new Date('2026-07-15'),
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [
          assignment({
            id: 'a-excl',
            vehicleId: 'v1',
            status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
            reasonCode: BillableVehicleAssignmentReasonCode.BILLING_EXCLUSION,
            approvedByUserId: 'user-1',
            billableFrom: new Date('2026-08-01'),
            billableUntil: new Date('2026-08-31'),
          }),
          assignment({ id: 'a-active', vehicleId: 'v1' }),
        ],
      }),
    );

    expect(result.billableVehicleCount).toBe(1);
  });

  it('applies approved billing exclusion within period', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        asOf: new Date('2026-07-15'),
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [
          assignment({
            id: 'a-excl',
            vehicleId: 'v1',
            status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
            reasonCode: BillableVehicleAssignmentReasonCode.BILLING_EXCLUSION,
            approvedByUserId: 'user-1',
            billableFrom: new Date('2026-07-01'),
            billableUntil: new Date('2026-07-31'),
          }),
        ],
      }),
    );

    expect(result.billableVehicleCount).toBe(0);
    expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.BILLING_EXCLUSION);
  });

  it('rejects cross-tenant vehicle evaluation', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        organizationId: 'org-1',
        vehicles: [vehicle({ id: 'v1', organizationId: 'org-2' })],
        assignments: [assignment({ id: 'a1', vehicleId: 'v1', organizationId: 'org-2' })],
      }),
    );

    expect(result.billableVehicleCount).toBe(0);
    expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.CROSS_TENANT);
  });

  it('uses legacy implicit assignments when org has no assignment ledger yet', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        legacyImplicitAssignments: true,
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [],
      }),
    );

    expect(result.billableVehicleCount).toBe(1);
  });

  it('still excludes demo assignment under legacy implicit mode', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        legacyImplicitAssignments: true,
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [
          assignment({
            id: 'a-demo',
            vehicleId: 'v1',
            status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
            reasonCode: BillableVehicleAssignmentReasonCode.DEMO,
            approvedByUserId: 'user-1',
          }),
        ],
      }),
    );

    expect(result.billableVehicleCount).toBe(0);
  });

  it('ignores unapproved billing exclusion without actor and reason', () => {
    const result = evaluateBillableVehiclePolicy(
      context({
        vehicles: [vehicle({ id: 'v1' })],
        assignments: [
          assignment({
            id: 'a-excl',
            vehicleId: 'v1',
            status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
            reasonCode: BillableVehicleAssignmentReasonCode.BILLING_EXCLUSION,
            approvedByUserId: null,
          }),
        ],
      }),
    );

    expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.NO_ASSIGNMENT);
  });
});
