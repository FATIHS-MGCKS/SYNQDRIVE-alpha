import { VehiclesService } from './vehicles.service';
import { shouldSuppressLegacyVehicleCreateBillingHook } from '@modules/vehicle-onboarding/convergence/vehicle-registration-convergence.routing';

function makeCreateHarness(billingQuantity: { onVehicleProvisioned: jest.Mock }): VehiclesService {
  const stub = (): unknown => ({});
  const prisma = {
    vehicle: {
      create: jest.fn().mockResolvedValue({
        id: 'veh-manual',
        organizationId: 'org-man',
      }),
    },
  };
  return new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
    prisma,
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
    billingQuantity,
    undefined,
    undefined,
    undefined,
  );
}

describe('VehiclesService.create billing hardening (V2B-PR1)', () => {
  it('public manual create is retired (V2B-PR4); harness may still invoke legacy billing hook', async () => {
    expect(shouldSuppressLegacyVehicleCreateBillingHook({ billingSingleRailEnabled: true } as never)).toBe(
      false,
    );
    const billingQuantity = { onVehicleProvisioned: jest.fn().mockResolvedValue({ created: true }) };
    const service = makeCreateHarness(billingQuantity);

    await expect(
      service.create('org-man', { vin: 'VIN', make: 'M', model: 'X', year: 2024 } as never, 'u1'),
    ).rejects.toMatchObject({ response: { code: 'MANUAL_VEHICLE_REGISTRATION_RETIRED' } });

    await service.createVehicleRowForIntegrationHarness(
      'org-man',
      { vin: 'VIN', make: 'M', model: 'X', year: 2024 } as never,
      'u1',
    );
    expect(billingQuantity.onVehicleProvisioned).toHaveBeenCalledWith({
      organizationId: 'org-man',
      vehicleId: 'veh-manual',
      actorUserId: 'u1',
    });
  });
});