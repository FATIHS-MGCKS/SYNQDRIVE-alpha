/**
 * VehiclesService.registerFromDimo() routes through canonical VO-SIG P2 master registration.
 */
import { ConflictException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import type { MasterDimoCanonicalRegistrationService } from '@modules/vehicle-onboarding/master-dimo/master-dimo-canonical-registration.service';

function createHarness(masterDimo: MasterDimoCanonicalRegistrationService) {
  const stub = (): unknown => ({});
  const prisma = {
    vehicle: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'veh-1',
        organizationId: 'org-1',
        dimoVehicleId: 'dimo-veh-1',
      }),
    },
  };
  const service = new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
    prisma,
    stub(),
    stub(),
    stub(),
    stub(),
    { upsertSetupAndMeasurement: jest.fn() } as never,
    stub(),
    { ensureDimoTelemetryAuthorization: jest.fn() } as never,
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    { apiUrl: 'https://dimo.test' },
    stub(),
    { invalidate: jest.fn() } as never,
    masterDimo,
  );
  return { service, prisma };
}

describe('VehiclesService.registerFromDimo canonical delegation', () => {
  it('delegates to MasterDimoCanonicalRegistrationService and returns refreshed vehicle', async () => {
    const masterDimo = {
      register: jest.fn().mockResolvedValue({
        vehicle: { id: 'veh-1' },
        brakeRegistration: { brakeBaselineStatus: 'NO_BASELINE' },
      }),
      masterManualSpecsNeedLegacyTireTreadPass: jest.fn().mockReturnValue(false),
    } as unknown as MasterDimoCanonicalRegistrationService;
    const { service } = createHarness(masterDimo);

    const result = await service.registerFromDimo('org-1', null, 'dimo-veh-1', undefined, undefined, 'user-1');

    expect(masterDimo.register).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        dimoVehicleId: 'dimo-veh-1',
        actorUserId: 'user-1',
      }),
    );
    expect(result.vehicle.id).toBe('veh-1');
  });

  it('maps SOURCE_ALREADY_REGISTERED to DIMO_VEHICLE_ALREADY_REGISTERED conflict', async () => {
    const masterDimo = {
      register: jest.fn().mockRejectedValue(
        new ConflictException({
          code: 'SOURCE_ALREADY_REGISTERED',
          message: 'Provider source is already associated with a canonical vehicle',
          details: { vehicleId: 'veh-existing', organizationId: 'org-2' },
        }),
      ),
      masterManualSpecsNeedLegacyTireTreadPass: jest.fn(),
    } as unknown as MasterDimoCanonicalRegistrationService;
    const { service } = createHarness(masterDimo);

    await expect(service.registerFromDimo('org-1', null, 'dimo-veh-1')).rejects.toMatchObject({
      response: {
        code: 'DIMO_VEHICLE_ALREADY_REGISTERED',
        vehicleId: 'veh-existing',
      },
    });
  });
});
