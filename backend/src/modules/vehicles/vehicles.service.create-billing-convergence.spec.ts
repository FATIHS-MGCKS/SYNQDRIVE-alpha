import { PrismaClient } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { shouldSuppressLegacyVehicleCreateBillingHook } from '@modules/vehicle-onboarding/convergence/vehicle-registration-convergence.routing';
import { createVehicleRowForIntegrationHarness } from './testing/vehicle-row-integration.harness';

describe('VehiclesService.create billing hardening (V2B-PR1)', () => {
  it('public manual create is retired (V2B-PR4); harness may still invoke legacy billing hook', async () => {
    expect(shouldSuppressLegacyVehicleCreateBillingHook({ billingSingleRailEnabled: true } as never)).toBe(
      false,
    );
    const billingQuantity = { onVehicleProvisioned: jest.fn().mockResolvedValue({ created: true }) };
    const prismaCreate = jest.fn().mockResolvedValue({
      id: 'veh-manual',
      organizationId: 'org-man',
    });
    const prisma = { vehicle: { create: prismaCreate } } as unknown as PrismaClient;
    const stub = (): unknown => ({});
    const service = new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
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

    await expect(
      service.create('org-man', { vin: 'VIN', make: 'M', model: 'X', year: 2024 } as never, 'u1'),
    ).rejects.toMatchObject({ response: { code: 'MANUAL_VEHICLE_REGISTRATION_RETIRED' } });

    await createVehicleRowForIntegrationHarness(
      prisma,
      'org-man',
      { vin: 'VIN', make: 'M', model: 'X', year: 2024 } as never,
      'u1',
      { billingQuantity: billingQuantity as never },
    );
    expect(billingQuantity.onVehicleProvisioned).toHaveBeenCalledWith({
      organizationId: 'org-man',
      vehicleId: 'veh-manual',
      actorUserId: 'u1',
    });
  });
});