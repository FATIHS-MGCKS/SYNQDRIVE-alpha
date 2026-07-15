import { BillableVehiclesService } from './billable-vehicles.service';
import {
  BillingBillableVehicleAssignmentStatus,
  BillingSubscriptionItemStatus,
  OrganizationStatus,
  VehicleStatus,
} from '@prisma/client';
import {
  BillableVehicleAssignmentReasonCode,
  BillableVehicleExclusionReason,
} from './domain/billable-vehicle-policy';

describe('BillableVehiclesService characterization', () => {
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
      asOf?: Date;
    },
  ) => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          status: opts?.orgStatus ?? OrganizationStatus.ACTIVE,
        }),
      },
      billingSubscriptionItem: {
        findFirst: jest.fn().mockResolvedValue(baseItem),
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
    return {
      svc: new BillableVehiclesService(prisma),
      asOf: opts?.asOf,
    };
  };

  const vehicleBase = {
    organizationId: 'org-1',
    licensePlate: 'B-XY 1',
    vin: 'VIN',
    make: 'VW',
    model: 'ID.3',
    providerConsents: [],
    dataSourceLinks: [],
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

  describe('connectivity is informational only', () => {
    it('reports connectivity without affecting billable count', async () => {
      const { svc } = build(
        [
          {
            ...vehicleBase,
            id: 'v-consent',
            providerConsents: [{ id: 'c1' }],
          },
        ],
        { assignments: [activeAssignment('v-consent')] },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
      expect(result.billableVehicles[0].connectivityStatus).toBe('CONNECTED');
    });

    it('keeps provider-disconnected vehicles billable with active assignment', async () => {
      const { svc } = build(
        [{ ...vehicleBase, id: 'v-off' }],
        { assignments: [activeAssignment('v-off')] },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
      expect(result.excludedVehicles).toHaveLength(0);
      expect(result.billableVehicles[0].connectivityStatus).toBe('NOT_CONNECTED');
    });
  });

  describe('operational status does not affect billing', () => {
    it('keeps OUT_OF_SERVICE vehicles billable when assignment is active', async () => {
      const { svc } = build(
        [
          {
            ...vehicleBase,
            id: 'v-oos',
            status: VehicleStatus.OUT_OF_SERVICE,
            providerConsents: [{ id: 'c1' }],
          },
        ],
        { assignments: [activeAssignment('v-oos')] },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
    });

    it('keeps RENTED and IN_SERVICE vehicles billable', async () => {
      const { svc } = build(
        [
          {
            ...vehicleBase,
            id: 'v-rented',
            status: VehicleStatus.RENTED,
          },
          {
            ...vehicleBase,
            id: 'v-service',
            status: VehicleStatus.IN_SERVICE,
          },
        ],
        {
          assignments: [activeAssignment('v-rented'), activeAssignment('v-service')],
        },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(2);
    });
  });

  describe('demo and exclusion policy', () => {
    it('does not exclude renamed demo-looking vehicles without assignment', async () => {
      const { svc } = build(
        [
          {
            ...vehicleBase,
            id: 'v-renamed',
            licensePlate: '[demo] renamed fleet car',
          },
        ],
        {
          assignmentCount: 0,
          assignments: [],
        },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
    });

    it('excludes vehicles with explicit demo assignment', async () => {
      const { svc } = build(
        [{ ...vehicleBase, id: 'v-demo' }],
        {
          assignments: [
            activeAssignment('v-demo', {
              status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
              reasonCode: BillableVehicleAssignmentReasonCode.DEMO,
            }),
          ],
        },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.DEMO_ASSIGNMENT);
    });

    it('ignores legacy billingExcluded flag without approved exclusion assignment', async () => {
      const { svc } = build(
        [
          {
            ...vehicleBase,
            id: 'v-excl',
            billingExcluded: true,
            providerConsents: [{ id: 'c1' }],
          },
        ],
        {
          assignmentCount: 0,
          assignments: [],
        },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
    });

    it('does not apply billing exclusion outside its period when billable assignment exists', async () => {
      const asOf = new Date('2026-07-15');
      const { svc } = build(
        [{ ...vehicleBase, id: 'v-excl-period' }],
        {
          asOf,
          assignments: [
            activeAssignment('v-excl-period', { id: 'a-active' }),
            activeAssignment('v-excl-period', {
              id: 'a-future-excl',
              status: BillingBillableVehicleAssignmentStatus.EXCLUDED,
              reasonCode: BillableVehicleAssignmentReasonCode.BILLING_EXCLUSION,
              billableFrom: new Date('2026-08-01'),
              billableUntil: new Date('2026-08-31'),
            }),
          ],
        },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1', asOf);
      expect(result.billableVehicleCount).toBe(1);
    });
  });

  describe('organization and tenant boundaries', () => {
    it('excludes all vehicles when organization is not ACTIVE', async () => {
      const { svc } = build(
        [{ ...vehicleBase, id: 'v1', providerConsents: [{ id: 'c1' }] }],
        {
          orgStatus: OrganizationStatus.SUSPENDED,
          assignments: [activeAssignment('v1')],
        },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(0);
      expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.ORG_INACTIVE);
    });

    it('rejects cross-tenant vehicles', async () => {
      const { svc } = build(
        [{ ...vehicleBase, id: 'v-x', organizationId: 'org-2' }],
        {
          assignments: [
            activeAssignment('v-x', { organizationId: 'org-2' }),
          ],
        },
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.CROSS_TENANT);
    });
  });
});
