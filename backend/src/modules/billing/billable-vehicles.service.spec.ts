import { BillableVehiclesService } from './billable-vehicles.service';
import {
  BillingBillableVehicleAssignmentStatus,
  BillingSubscriptionItemStatus,
  OrganizationStatus,
} from '@prisma/client';
import { BillableVehicleAssignmentReasonCode, BillableVehicleExclusionReason } from './domain/billable-vehicle-policy';

describe('BillableVehiclesService', () => {
  const baseItem = {
    id: 'item-base',
    status: BillingSubscriptionItemStatus.ACTIVE,
  };

  const build = (
    vehicles: any[],
    opts?: {
      orgStatus?: OrganizationStatus;
      assignments?: any[];
      assignmentCount?: number;
      baseItem?: typeof baseItem | null;
    },
  ) => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          status: opts?.orgStatus ?? OrganizationStatus.ACTIVE,
        }),
      },
      billingSubscriptionItem: {
        findFirst: jest.fn().mockResolvedValue(
          opts?.baseItem === null ? null : (opts?.baseItem ?? baseItem),
        ),
      },
      billingBillableVehicleAssignment: {
        count: jest
          .fn()
          .mockResolvedValue(opts?.assignmentCount ?? opts?.assignments?.length ?? 0),
        findMany: jest.fn().mockResolvedValue(opts?.assignments ?? []),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue(vehicles),
      },
    } as any;
    return new BillableVehiclesService(prisma);
  };

  const activeAssignment = (vehicleId: string, overrides: Record<string, unknown> = {}) => ({
    id: `assign-${vehicleId}`,
    organizationId: 'org-1',
    vehicleId,
    subscriptionItemId: 'item-base',
    billableFrom: new Date('2026-01-01'),
    billableUntil: null,
    status: BillingBillableVehicleAssignmentStatus.ACTIVE,
    reasonCode: null,
    reasonNote: null,
    approvedByUserId: 'user-1',
    ...overrides,
  });

  it('counts billable vehicles with approved active assignment regardless of connectivity', async () => {
    const svc = build(
      [
        {
          id: 'v1',
          organizationId: 'org-1',
          licensePlate: 'B-AB 1',
          vin: 'VIN1',
          make: 'BMW',
          model: 'i4',
          providerConsents: [],
          dataSourceLinks: [],
        },
      ],
      { assignments: [activeAssignment('v1')] },
    );

    const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
    expect(result.connectedVehicleCount).toBe(0);
    expect(result.billableVehicleCount).toBe(1);
    expect(result.billableVehicles[0].id).toBe('v1');
  });

  it('excludes vehicles with explicit demo assignment, not vehicle name', async () => {
    const svc = build(
      [
        {
          id: 'v1',
          organizationId: 'org-1',
          licensePlate: '[DEMO] Car',
          vin: 'VIN1',
          make: 'X',
          model: 'Y',
          providerConsents: [{ id: 'c1' }],
          dataSourceLinks: [],
        },
      ],
      {
        assignments: [
          activeAssignment('v1', {
            status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
            reasonCode: BillableVehicleAssignmentReasonCode.DEMO,
          }),
        ],
      },
    );

    const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
    expect(result.billableVehicleCount).toBe(0);
    expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.DEMO_ASSIGNMENT);
  });
});
