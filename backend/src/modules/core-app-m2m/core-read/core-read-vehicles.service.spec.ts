import { ProductSlug, VehicleRegistryLifecycle, VehicleStatus } from '@prisma/client';
import { CoreReadVehiclesService } from './core-read-vehicles.service';

describe('CoreReadVehiclesService', () => {
  const prisma = {
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const vehicleAccess = {
    getAuthorizedVehicleWhere: jest.fn(async () => ({
      organizationId: '11111111-1111-4111-8111-111111111111',
    })),
    assertVehicleAuthorized: jest.fn(async () => undefined),
  };
  const service = new CoreReadVehiclesService(prisma as never, vehicleAccess as never);

  const auth = {
    clientId: 'client-1',
    organizationId: '11111111-1111-4111-8111-111111111111',
    productSlug: ProductSlug.FLEET,
    scopes: ['core:app:vehicle:read'],
    credentialVersion: 1,
    grantVersion: 1,
  };

  it('caps page size at 100 and returns deterministic ordering metadata', async () => {
    prisma.vehicle.count.mockResolvedValue(250);
    prisma.vehicle.findMany.mockResolvedValue([]);
    const result = await service.listVehicles(auth, 2, 500);
    expect(result.pageSize).toBe(100);
    expect(result.page).toBe(2);
    expect(result.total).toBe(250);
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 100, orderBy: [{ id: 'asc' }] }),
    );
  });

  it('maps allowlisted vehicle detail fields only', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      organizationId: auth.organizationId,
      make: 'Make',
      model: 'Model',
      year: 2024,
      vehicleName: 'V1',
      licensePlate: 'PL-1',
      status: VehicleStatus.AVAILABLE,
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      fuelType: 'ELECTRIC',
      mileageKm: 12000,
      vin: 'WVWZZZ1JZXW000001',
    });
    const result = await service.getVehicle(auth, 'veh-1');
    expect(result.vehicle.vinLast4).toBe('0001');
    expect(result.vehicle).not.toHaveProperty('dimoVehicleId');
    expect(result.vehicle).not.toHaveProperty('dailyRateEur');
  });
});