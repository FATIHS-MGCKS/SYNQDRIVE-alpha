import { HighMobilityRegistrationService } from './high-mobility-registration.service';
import * as snapshotModule from '@modules/vehicle-onboarding/hm-only-canonical/hm-only-canonical-observation-snapshot';

describe('HighMobilityRegistrationService shadow readiness observation', () => {
  const baseHm = {
    id: 'hm-1',
    vin: 'VINLEG001',
    brand: 'Test',
    clearanceStatus: 'APPROVED',
    sourceMode: 'HM_ONLY',
    registrationState: 'NOT_REGISTERED',
    organizationId: 'org-a',
    synqdriveVehicleId: null,
    hmVehicleReference: 'ref-1',
    packageType: 'HEALTH',
    updatedAt: new Date(),
    createdAt: new Date(),
  };

  function legacyPrisma(overrides?: { vehicleFindFirst?: unknown }) {
    const txHandlers = {
      vehicle: { create: jest.fn().mockResolvedValue({ id: 'veh-legacy' }) },
      vehicleDataSourceLink: { create: jest.fn().mockResolvedValue({}) },
      highMobilityVehicle: { update: jest.fn().mockResolvedValue({}) },
      highMobilityStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    return {
      highMobilityVehicle: {
        findUnique: jest.fn().mockResolvedValue(baseHm),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      vehicle: { findFirst: jest.fn().mockResolvedValue(overrides?.vehicleFindFirst ?? null) },
      $transaction: jest.fn(async (fn: (tx: typeof txHandlers) => Promise<unknown>) => fn(txHandlers)),
    };
  }

  it('shadow OFF — observation service not invoked', async () => {
    const observe = jest.fn();
    const configService = {
      get: jest.fn().mockReturnValue({
        hmOnlyCanonicalEnabled: false,
        billingSingleRailEnabled: false,
        shadowCompareEnabled: false,
      }),
    };
    const service = new HighMobilityRegistrationService(
      legacyPrisma() as never,
      configService as never,
      { registerHmOnlyCanonical: jest.fn() },
      { observeHmOnlyRegistrationAttempt: observe } as never,
    );

    await service.registerHmOnlyVehicle(
      { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'X5', year: 2022 },
      { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
    );

    expect(observe).not.toHaveBeenCalled();
  });

  it('shadow ON — legacy registration succeeds and observation is fire-and-forget', async () => {
    const observe = jest.fn().mockResolvedValue({});
    jest
      .spyOn(snapshotModule, 'buildHmObservationEvaluationSnapshot')
      .mockResolvedValue(snapshotModule.freezeHmPreRegistrationSnapshot(baseHm as never));
    const configService = {
      get: jest.fn().mockReturnValue({
        hmOnlyCanonicalEnabled: false,
        billingSingleRailEnabled: false,
        shadowCompareEnabled: true,
      }),
    };
    const service = new HighMobilityRegistrationService(
      legacyPrisma() as never,
      configService as never,
      { registerHmOnlyCanonical: jest.fn() },
      { observeHmOnlyRegistrationAttempt: observe } as never,
    );

    const result = await service.registerHmOnlyVehicle(
      { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'X5', year: 2022 },
      { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
    );

    expect(result.synqdriveVehicleId).toBe('veh-legacy');
    await new Promise((r) => setTimeout(r, 20));
    expect(observe).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  it('snapshot failure — legacy registration still succeeds', async () => {
    const observe = jest.fn();
    jest
      .spyOn(snapshotModule, 'buildHmObservationEvaluationSnapshot')
      .mockRejectedValue(new Error('snapshot-db-down'));
    const configService = {
      get: jest.fn().mockReturnValue({
        hmOnlyCanonicalEnabled: false,
        billingSingleRailEnabled: false,
        shadowCompareEnabled: true,
      }),
    };
    const service = new HighMobilityRegistrationService(
      legacyPrisma() as never,
      configService as never,
      { registerHmOnlyCanonical: jest.fn() },
      { observeHmOnlyRegistrationAttempt: observe } as never,
    );

    const result = await service.registerHmOnlyVehicle(
      { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'X5', year: 2022 },
      { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
    );

    expect(result.synqdriveVehicleId).toBe('veh-legacy');
    await new Promise((r) => setTimeout(r, 20));
    expect(observe).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('stable duplicate VIN — legacy blocked before registration tx', async () => {
    const configService = {
      get: jest.fn().mockReturnValue({
        hmOnlyCanonicalEnabled: false,
        billingSingleRailEnabled: false,
        shadowCompareEnabled: true,
      }),
    };
    const prisma = legacyPrisma({
      vehicleFindFirst: { id: 'existing', vin: 'VINLEG001' },
    });
    const service = new HighMobilityRegistrationService(
      prisma as never,
      configService as never,
      { registerHmOnlyCanonical: jest.fn() },
      { observeHmOnlyRegistrationAttempt: jest.fn() } as never,
    );

    await expect(
      service.registerHmOnlyVehicle(
        { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'X5', year: 2022 },
        { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
      ),
    ).rejects.toThrow('already exists');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});