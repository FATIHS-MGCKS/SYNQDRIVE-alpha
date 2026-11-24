import { MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE } from './legacy-manual-vehicle-registration.errors';
import { VehiclesService } from './vehicles.service';

function makeRetiredCreateHarness(): VehiclesService {
  const stub = (): unknown => ({});
  return new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    undefined,
    undefined,
    undefined,
    undefined,
  );
}

describe('VehiclesService.create manual registration retirement (V2B-PR4)', () => {
  it('throws retirement contract without persisting', async () => {
    const service = makeRetiredCreateHarness();
    const prismaCreate = jest.fn();
    (service as unknown as { prisma: { vehicle: { create: jest.Mock } } }).prisma = {
      vehicle: { create: prismaCreate },
    };

    await expect(
      service.create('org-1', { vin: 'VIN1', make: 'M', model: 'X', year: 2024 } as never, 'u1'),
    ).rejects.toMatchObject({
      response: { code: MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE },
    });
    expect(prismaCreate).not.toHaveBeenCalled();
  });

  it('integration harness path can still create rows for E2E fixtures', async () => {
    const service = makeRetiredCreateHarness();
    const prismaCreate = jest
      .fn()
      .mockResolvedValue({ id: 'veh-harness', organizationId: 'org-h' });
    (service as unknown as { prisma: { vehicle: { create: jest.Mock } } }).prisma = {
      vehicle: { create: prismaCreate },
    };

    const vehicle = await service.createVehicleRowForIntegrationHarness(
      'org-h',
      { vin: 'VINHARNESS', make: 'H', model: 'Z', year: 2024 } as never,
      'actor',
      { invokeLegacyBillingHook: false },
    );
    expect(vehicle.id).toBe('veh-harness');
    expect(prismaCreate).toHaveBeenCalled();
  });
});