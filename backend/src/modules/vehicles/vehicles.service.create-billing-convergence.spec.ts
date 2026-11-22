import { VehiclesService } from './vehicles.service';

function makeCreateHarness(
  billingQuantity: { onVehicleProvisioned: jest.Mock },
  registrationConvergence?: { hmOnlyCanonicalEnabled: boolean; billingSingleRailEnabled: boolean },
): VehiclesService {
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
    registrationConvergence,
  );
}

describe('VehiclesService.create billing convergence (V2B-PR1)', () => {
  it('invokes legacy billing hook when single-rail flag is off', async () => {
    const billingQuantity = { onVehicleProvisioned: jest.fn().mockResolvedValue({ created: true }) };
    const service = makeCreateHarness(billingQuantity, {
      hmOnlyCanonicalEnabled: false,
      billingSingleRailEnabled: false,
    });

    await service.create('org-man', { vin: 'VIN', make: 'M', model: 'X', year: 2024 } as never, 'u1');
    expect(billingQuantity.onVehicleProvisioned).toHaveBeenCalled();
  });

  it('suppresses legacy billing hook when single-rail flag is on', async () => {
    const billingQuantity = { onVehicleProvisioned: jest.fn() };
    const service = makeCreateHarness(billingQuantity, {
      hmOnlyCanonicalEnabled: true,
      billingSingleRailEnabled: true,
    });

    await service.create('org-man', { vin: 'VIN', make: 'M', model: 'X', year: 2024 } as never, 'u1');
    expect(billingQuantity.onVehicleProvisioned).not.toHaveBeenCalled();
  });

  it('defaults to legacy billing when convergence config not injected', async () => {
    const billingQuantity = { onVehicleProvisioned: jest.fn().mockResolvedValue(null) };
    const service = makeCreateHarness(billingQuantity, undefined);
    await service.create('org-man', { vin: 'VIN', make: 'M', model: 'X', year: 2024 } as never);
    expect(billingQuantity.onVehicleProvisioned).toHaveBeenCalled();
  });
});