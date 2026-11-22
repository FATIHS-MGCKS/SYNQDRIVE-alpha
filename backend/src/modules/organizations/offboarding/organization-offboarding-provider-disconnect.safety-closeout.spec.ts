import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';

describe('OrganizationOffboardingProviderDisconnectService — safety closeout', () => {
  const basePrisma = () => ({
    vehicleProviderConsent: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    vehicle: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    vehicleDataSourceLink: { count: jest.fn().mockResolvedValue(0) },
    highMobilityVehicle: { count: jest.fn().mockResolvedValue(0) },
    dimoVehicle: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL;
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL;
    process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE = '1';
  });

  afterEach(() => {
    delete process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE;
  });

  it('does not convert live NO_DEPENDENCY to CONFIRMED when org had HM historical link', async () => {
    const prisma = basePrisma();
    prisma.vehicleDataSourceLink.count.mockResolvedValue(1);

    const hmLive = {
      disconnectOrganization: jest.fn().mockResolvedValue({
        outcome: 'NO_DEPENDENCY',
        detailCode: null,
        providerEvidence: { provider: 'HIGH_MOBILITY', attemptedAt: 't', organizationId: 'org-1', operations: [], summary: {} },
      }),
    };
    const dimoLive = {
      verifyOrganizationDisconnect: jest.fn().mockResolvedValue({
        outcome: 'NO_DEPENDENCY',
        detailCode: null,
        providerEvidence: { provider: 'DIMO', attemptedAt: 't', organizationId: 'org-1', operations: [], summary: {} },
      }),
    };

    const service = new OrganizationOffboardingProviderDisconnectService(
      prisma as never,
      hmLive as never,
      dimoLive as never,
    );
    const result = await service.assessOrganization('org-1');
    expect(result.hm.externalOutcome).toBe('REVIEW_REQUIRED');
    expect(result.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
  });

  it('maps HM REVIEW_REQUIRED historical row to pending finalization', async () => {
    const prisma = basePrisma();
    prisma.vehicleDataSourceLink.count.mockResolvedValue(1);

    const hmLive = {
      disconnectOrganization: jest.fn().mockResolvedValue({
        outcome: 'REVIEW_REQUIRED',
        detailCode: 'HM_HISTORICAL_LINK_WITHOUT_HM_ROW',
        providerEvidence: {
          provider: 'HIGH_MOBILITY',
          attemptedAt: 't',
          organizationId: 'org-x',
          operations: [],
          summary: {},
        },
      }),
    };
    const dimoLive = {
      verifyOrganizationDisconnect: jest.fn().mockResolvedValue({
        outcome: 'NO_DEPENDENCY',
        detailCode: null,
        providerEvidence: { provider: 'DIMO', attemptedAt: 't', organizationId: 'org-x', operations: [], summary: {} },
      }),
    };

    const service = new OrganizationOffboardingProviderDisconnectService(
      prisma as never,
      hmLive as never,
      dimoLive as never,
    );
    const result = await service.assessOrganization('org-x');
    expect(result.hm.externalOutcome).toBe('REVIEW_REQUIRED');
    expect(result.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
  });

  it('blocks finalization when DIMO privilege still active', async () => {
    const prisma = basePrisma();
    prisma.vehicle.count.mockImplementation(async (args: { where?: { dimoVehicleId?: unknown } }) =>
      args?.where?.dimoVehicleId !== undefined ? 1 : 0,
    );
    prisma.vehicleProviderConsent.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const dimoLive = {
      verifyOrganizationDisconnect: jest.fn().mockResolvedValue({
        outcome: 'NOT_AVAILABLE',
        detailCode: 'DIMO_PRIVILEGE_STILL_ACTIVE',
        providerEvidence: {
          provider: 'DIMO',
          attemptedAt: 't',
          organizationId: 'org-d',
          operations: [],
          summary: {},
        },
      }),
    };

    const service = new OrganizationOffboardingProviderDisconnectService(
      prisma as never,
      undefined,
      dimoLive as never,
    );
    const result = await service.assessOrganization('org-d');
    expect(result.dimo.externalOutcome).toBe('NOT_AVAILABLE');
    expect(result.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
  });
});