import { ServiceUnavailableException } from '@nestjs/common';
import { HighMobilityRegistrationService } from './high-mobility-registration.service';

describe('HighMobilityRegistrationService convergence routing (V2B-PR1)', () => {
  it('uses legacy HM_ONLY path when canonical flag is off', async () => {
    const txHandlers = {
      vehicle: { create: jest.fn().mockResolvedValue({ id: 'veh-legacy' }) },
      vehicleDataSourceLink: { create: jest.fn().mockResolvedValue({}) },
      highMobilityVehicle: { update: jest.fn().mockResolvedValue({}) },
      highMobilityStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      highMobilityVehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'hm-1',
          vin: 'VINLEG001',
          brand: 'Test',
          clearanceStatus: 'APPROVED',
          sourceMode: 'HM_ONLY',
          registrationState: 'PENDING',
          organizationId: 'org-a',
        }),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (tx: typeof txHandlers) => Promise<unknown>) => fn(txHandlers)),
    };
    const convergencePort = { registerHmOnlyCanonical: jest.fn() };
    const configService = {
      get: jest.fn().mockReturnValue({
        hmOnlyCanonicalEnabled: false,
        billingSingleRailEnabled: false,
      }),
    };

    const service = new HighMobilityRegistrationService(
      prisma as never,
      configService as never,
      convergencePort,
    );

    const result = await service.registerHmOnlyVehicle(
      { hmVehicleId: 'hm-1', organizationId: 'org-a' },
      { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
    );

    expect(result.synqdriveVehicleId).toBe('veh-legacy');
    expect(convergencePort.registerHmOnlyCanonical).not.toHaveBeenCalled();
  });

  it('delegates to convergence port when canonical flag is on', async () => {
    const convergencePort = {
      registerHmOnlyCanonical: jest.fn().mockResolvedValue({
        synqdriveVehicleId: 'veh-canonical',
        sourceMode: 'HM_ONLY',
      }),
    };
    const configService = {
      get: jest.fn().mockReturnValue({
        hmOnlyCanonicalEnabled: true,
        billingSingleRailEnabled: false,
      }),
    };
    const service = new HighMobilityRegistrationService(
      { highMobilityVehicle: { findUnique: jest.fn() } } as never,
      configService as never,
      convergencePort,
    );

    await service.registerHmOnlyVehicle(
      { hmVehicleId: 'hm-1', organizationId: 'org-a' },
      { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
    );

    expect(convergencePort.registerHmOnlyCanonical).toHaveBeenCalledTimes(1);
  });

  it('fail-closed when flag on but port missing', async () => {
    const configService = {
      get: jest.fn().mockReturnValue({
        hmOnlyCanonicalEnabled: true,
        billingSingleRailEnabled: false,
      }),
    };
    const service = new HighMobilityRegistrationService(
      { highMobilityVehicle: { findUnique: jest.fn() } } as never,
      configService as never,
      undefined,
    );

    await expect(
      service.registerHmOnlyVehicle(
        { hmVehicleId: 'hm-1', organizationId: 'org-a' },
        { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});