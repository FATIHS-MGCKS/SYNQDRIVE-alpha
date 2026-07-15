import { BillableVehiclesService } from './billable-vehicles.service';
import { OrganizationStatus, VehicleStatus } from '@prisma/client';

describe('BillableVehiclesService characterization', () => {
  const build = (vehicles: any[], orgStatus: OrganizationStatus = OrganizationStatus.ACTIVE) => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ status: orgStatus }),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue(vehicles),
      },
    } as any;
    return new BillableVehiclesService(prisma);
  };

  const connectedBase = {
    licensePlate: 'B-XY 1',
    vin: 'VIN',
    make: 'VW',
    model: 'ID.3',
    vehicleName: null,
    status: VehicleStatus.AVAILABLE,
    billingExcluded: false,
    providerConsents: [],
    dataSourceLinks: [],
  };

  describe('provider connectivity', () => {
    it('treats ACTIVE provider consent as connected', async () => {
      const svc = build([
        {
          ...connectedBase,
          id: 'v-consent',
          providerConsents: [{ id: 'c1' }],
        },
      ]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
      expect(result.billableVehicles[0].connectivityStatus).toBe('CONNECTED');
    });

    it('treats active data source link as connected without consent', async () => {
      const svc = build([
        {
          ...connectedBase,
          id: 'v-link',
          dataSourceLinks: [{ id: 'dsl-1' }],
        },
      ]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
    });

    it('excludes vehicles without connectivity with NOT_CONNECTED reason', async () => {
      const svc = build([{ ...connectedBase, id: 'v-off' }]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(0);
      expect(result.excludedVehicles[0].reason).toBe('NOT_CONNECTED');
    });
  });

  describe('vehicle status influence', () => {
    it('excludes OUT_OF_SERVICE vehicles as DISABLED', async () => {
      const svc = build([
        {
          ...connectedBase,
          id: 'v-oos',
          status: VehicleStatus.OUT_OF_SERVICE,
          providerConsents: [{ id: 'c1' }],
        },
      ]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.excludedVehicles[0].reason).toBe('DISABLED');
    });

    it('keeps RENTED and IN_SERVICE connected vehicles billable', async () => {
      const svc = build([
        {
          ...connectedBase,
          id: 'v-rented',
          status: VehicleStatus.RENTED,
          providerConsents: [{ id: 'c1' }],
        },
        {
          ...connectedBase,
          id: 'v-service',
          status: VehicleStatus.IN_SERVICE,
          providerConsents: [{ id: 'c2' }],
        },
      ]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(2);
    });
  });

  describe('demo and billing exclusion rules', () => {
    it('excludes [DEMO] prefix in vehicleName case-insensitively', async () => {
      const svc = build([
        {
          ...connectedBase,
          id: 'v-demo',
          vehicleName: '[demo] Fleet test',
          providerConsents: [{ id: 'c1' }],
        },
      ]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.excludedVehicles[0].reason).toBe('DEMO');
    });

    it('does not exclude demo marker in middle of name', async () => {
      const svc = build([
        {
          ...connectedBase,
          id: 'v-ok',
          vehicleName: 'Car [DEMO] suffix',
          providerConsents: [{ id: 'c1' }],
        },
      ]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(1);
    });

    it('excludes billingExcluded flag even when connected', async () => {
      const svc = build([
        {
          ...connectedBase,
          id: 'v-excl',
          billingExcluded: true,
          providerConsents: [{ id: 'c1' }],
        },
      ]);

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.excludedVehicles[0].reason).toBe('BILLING_EXCLUDED');
    });
  });

  describe('organization status', () => {
    it('excludes all vehicles when organization is not ACTIVE', async () => {
      const svc = build(
        [
          {
            ...connectedBase,
            id: 'v1',
            providerConsents: [{ id: 'c1' }],
          },
        ],
        OrganizationStatus.SUSPENDED,
      );

      const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
      expect(result.billableVehicleCount).toBe(0);
      expect(result.excludedVehicles[0].reason).toBe('ORG_INACTIVE');
    });
  });
});
