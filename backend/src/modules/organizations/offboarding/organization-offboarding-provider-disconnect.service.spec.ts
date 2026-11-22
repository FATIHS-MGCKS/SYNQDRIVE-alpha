import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';

describe('OrganizationOffboardingProviderDisconnectService (P6D4)', () => {
  const prisma = {
    vehicleProviderConsent: {
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    vehicle: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    vehicleDataSourceLink: { count: jest.fn().mockResolvedValue(0) },
    highMobilityVehicle: { count: jest.fn().mockResolvedValue(0) },
    dimoVehicle: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

  let service: OrganizationOffboardingProviderDisconnectService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL;
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL;
    process.env.NODE_ENV = 'test';
    service = new OrganizationOffboardingProviderDisconnectService(prisma as never);
  });

  it('treats clean org as NO_EXTERNAL_PROVIDER_DEPENDENCY', async () => {
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
    prisma.vehicle.count.mockResolvedValue(0);
    const result = await service.assessOrganization('org-1');
    expect(result.finalizationState).toBe('NO_EXTERNAL_PROVIDER_DEPENDENCY');
  });

  it('historical HM data source link counts as dependency without consent', async () => {
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
    prisma.vehicle.count.mockResolvedValue(0);
    prisma.vehicleDataSourceLink.count.mockResolvedValue(1);
    const result = await service.assessOrganization('org-hm-link');
    expect(result.hm.hadDependency).toBe(true);
    expect(result.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
  });

  it('local revoke alone does not confirm external DIMO disconnect', async () => {
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
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
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const result = await service.assessOrganization('org-2');
    expect(result.dimo.hadDependency).toBe(true);
    expect(result.dimo.localRevoked).toBe(false);
    expect(result.dimo.externalOutcome).toBe('NOT_AVAILABLE');
    expect(result.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
  });

  it('mock HM failure keeps EXTERNAL_DISCONNECT_PENDING', async () => {
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'FAILED';
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
    prisma.vehicleDataSourceLink.count.mockResolvedValue(1);
    prisma.vehicle.findMany.mockResolvedValue([]);
    prisma.highMobilityVehicle.count.mockResolvedValue(0);
    prisma.vehicle.count.mockResolvedValue(0);
    const result = await service.assessOrganization('org-3');
    expect(result.hm.externalOutcome).toBe('FAILED');
    expect(result.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
  });

  it('mock provider success yields EXTERNAL_DISCONNECT_CONFIRMED when no active links remain', async () => {
    process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL = 'CONFIRMED';
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
    prisma.vehicleDataSourceLink.count.mockResolvedValue(0);
    prisma.vehicle.findMany.mockResolvedValue([]);
    prisma.highMobilityVehicle.count.mockResolvedValue(1);
    prisma.vehicle.count.mockResolvedValue(0);
    const result = await service.assessOrganization('org-4');
    expect(result.finalizationState).toBe('EXTERNAL_DISCONNECT_CONFIRMED');
  });
});