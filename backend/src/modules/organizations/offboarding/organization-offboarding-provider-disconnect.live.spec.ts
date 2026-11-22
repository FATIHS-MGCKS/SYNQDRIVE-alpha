import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';

describe('OrganizationOffboardingProviderDisconnectService — live adapters', () => {
  const prisma = {
    vehicleProviderConsent: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    vehicle: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    vehicleDataSourceLink: { count: jest.fn().mockResolvedValue(0) },
    highMobilityVehicle: { count: jest.fn().mockResolvedValue(0) },
    dimoVehicle: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

  const originalLive = process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE;

  beforeEach(() => {
    prisma.vehicleProviderConsent.count.mockReset().mockResolvedValue(0);
    prisma.vehicleProviderConsent.updateMany.mockReset().mockResolvedValue({ count: 0 });
    prisma.vehicle.count.mockReset().mockResolvedValue(0);
    prisma.vehicle.findMany.mockReset().mockResolvedValue([]);
    prisma.vehicleDataSourceLink.count.mockReset().mockResolvedValue(0);
    prisma.highMobilityVehicle.count.mockReset().mockResolvedValue(0);
    prisma.dimoVehicle.updateMany.mockReset().mockResolvedValue({ count: 0 });
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE = originalLive;
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL;
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL;
  });

  it('uses HM live adapter when armed', async () => {
    process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE = '1';
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
    prisma.vehicle.count.mockResolvedValue(0);
    prisma.vehicleDataSourceLink.count.mockResolvedValue(1);
    prisma.highMobilityVehicle.count.mockResolvedValue(0);

    const hmLive = {
      disconnectOrganization: jest.fn().mockResolvedValue({
        outcome: 'CONFIRMED',
        detailCode: null,
        providerEvidence: { provider: 'HIGH_MOBILITY', attemptedAt: 'now', organizationId: 'org-1', operations: [], summary: {} },
      }),
    };
    const dimoLive = {
      verifyOrganizationDisconnect: jest.fn().mockResolvedValue({
        outcome: 'NO_DEPENDENCY',
        detailCode: null,
        providerEvidence: { provider: 'DIMO', attemptedAt: 'now', organizationId: 'org-1', operations: [], summary: {} },
      }),
    };

    const service = new OrganizationOffboardingProviderDisconnectService(
      prisma as never,
      hmLive as never,
      dimoLive as never,
    );
    const result = await service.assessOrganization('org-1');
    expect(hmLive.disconnectOrganization).toHaveBeenCalledWith('org-1');
    expect(result.hm.evidenceSource).toBe('LIVE');
    expect(result.hm.externalOutcome).toBe('CONFIRMED');
    expect(result.hm.providerEvidence).toBeDefined();
  });

  it('fails closed when live armed without adapters', async () => {
    process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE = '1';
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
    prisma.vehicle.findMany.mockResolvedValue([]);
    prisma.vehicleDataSourceLink.count.mockResolvedValue(0);
    prisma.highMobilityVehicle.count.mockResolvedValue(0);
    prisma.vehicle.count.mockImplementation(async (args: { where?: { dimoVehicleId?: unknown } }) => {
      if (args?.where?.dimoVehicleId !== undefined) {
        return 1;
      }
      return 0;
    });
    prisma.vehicleProviderConsent.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const service = new OrganizationOffboardingProviderDisconnectService(prisma as never);
    const result = await service.assessOrganization('org-2');
    expect(result.dimo.evidenceSource).toBe('LIVE');
    expect(result.dimo.externalOutcome).toBe('NOT_AVAILABLE');
    expect(result.dimo.detailCode).toBe('DIMO_EXTERNAL_REVOKE_LIVE_ADAPTER_UNAVAILABLE');
  });
});