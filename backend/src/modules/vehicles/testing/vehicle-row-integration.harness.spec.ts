import { ConflictException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createVehicleRowForIntegrationHarness } from './vehicle-row-integration.harness';

const minimalVehicleData = {
  vin: 'VIN12345678901234',
  make: 'Test',
  model: 'Harness',
  year: 2024,
  fuelType: 'ELECTRIC',
} satisfies Omit<Prisma.VehicleCreateInput, 'organization'>;

describe('VehicleRowIntegrationHarness isolation', () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('rejects in production NODE_ENV without ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS;

    const prisma = { vehicle: { create: jest.fn() } } as unknown as PrismaClient;

    await expect(
      createVehicleRowForIntegrationHarness(prisma, 'org-1', minimalVehicleData),
    ).rejects.toThrow(ConflictException);

    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it('allows production only when ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS=1 (explicit owner override)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS = '1';

    const prisma = {
      vehicle: {
        create: jest.fn().mockResolvedValue({ id: 'veh-1', vin: 'VIN123' }),
      },
    } as unknown as PrismaClient;

    const vehicle = await createVehicleRowForIntegrationHarness(prisma, 'org-1', minimalVehicleData);
    expect(vehicle.id).toBe('veh-1');
    expect(prisma.vehicle.create).toHaveBeenCalled();
  });

  it('allows non-production without ALLOW override', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS;

    const prisma = {
      vehicle: {
        create: jest.fn().mockResolvedValue({ id: 'veh-2', vin: 'VIN456' }),
      },
    } as unknown as PrismaClient;

    await createVehicleRowForIntegrationHarness(prisma, 'org-1', {
      ...minimalVehicleData,
      vin: 'VIN98765432109876',
    });
    expect(prisma.vehicle.create).toHaveBeenCalled();
  });
});