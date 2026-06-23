import { BillableVehiclesService } from './billable-vehicles.service';
import { OrganizationStatus, VehicleStatus } from '@prisma/client';

describe('BillableVehiclesService', () => {
  const build = (vehicles: any[], orgStatus = OrganizationStatus.ACTIVE) => {
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

  it('counts connected and billable vehicles with active consent', async () => {
    const svc = build([
      {
        id: 'v1',
        licensePlate: 'B-AB 1',
        vin: 'VIN1',
        make: 'BMW',
        model: 'i4',
        vehicleName: null,
        status: VehicleStatus.AVAILABLE,
        billingExcluded: false,
        providerConsents: [{ id: 'c1' }],
        dataSourceLinks: [],
      },
      {
        id: 'v2',
        licensePlate: 'B-AB 2',
        vin: 'VIN2',
        make: 'VW',
        model: 'ID3',
        vehicleName: null,
        status: VehicleStatus.AVAILABLE,
        billingExcluded: false,
        providerConsents: [],
        dataSourceLinks: [],
      },
    ]);

    const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
    expect(result.connectedVehicleCount).toBe(1);
    expect(result.billableVehicleCount).toBe(1);
    expect(result.billableVehicles[0].id).toBe('v1');
    expect(result.excludedVehicles[0].reason).toBe('NOT_CONNECTED');
  });

  it('excludes billingExcluded and demo vehicles', async () => {
    const svc = build([
      {
        id: 'v1',
        licensePlate: null,
        vin: 'VIN1',
        make: 'X',
        model: 'Y',
        vehicleName: '[DEMO] Test',
        status: VehicleStatus.AVAILABLE,
        billingExcluded: false,
        providerConsents: [{ id: 'c1' }],
        dataSourceLinks: [],
      },
      {
        id: 'v2',
        licensePlate: null,
        vin: 'VIN2',
        make: 'X',
        model: 'Y',
        vehicleName: null,
        status: VehicleStatus.AVAILABLE,
        billingExcluded: true,
        providerConsents: [{ id: 'c2' }],
        dataSourceLinks: [],
      },
    ]);

    const result = await svc.getBillableConnectedVehiclesForOrganization('org-1');
    expect(result.billableVehicleCount).toBe(0);
    expect(result.excludedVehicles.map((v) => v.reason)).toEqual(
      expect.arrayContaining(['DEMO', 'BILLING_EXCLUDED']),
    );
  });
});
