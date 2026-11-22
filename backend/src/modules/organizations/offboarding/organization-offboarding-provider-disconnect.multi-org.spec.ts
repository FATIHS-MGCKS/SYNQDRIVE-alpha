import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';

describe('OrganizationOffboardingProviderDisconnectService — multi-org DIMO isolation', () => {
  it('does not disconnect shared DimoVehicle when another org still references it', async () => {
    const dimoVehicleId = 'dimo-shared';
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      vehicleProviderConsent: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      vehicle: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([{ dimoVehicleId }]),
      },
      vehicleDataSourceLink: { count: jest.fn().mockResolvedValue(0) },
      highMobilityVehicle: { count: jest.fn().mockResolvedValue(0) },
      dimoVehicle: { updateMany },
    };
    process.env.NODE_ENV = 'test';
    const service = new OrganizationOffboardingProviderDisconnectService(prisma as never);
    prisma.vehicle.count.mockImplementation(async (args: { where?: { organizationId?: { not?: string } } }) => {
      if (args?.where?.organizationId?.not) {
        return 1;
      }
      return 0;
    });
    await service.assessOrganization('org-offboard');
    expect(updateMany).not.toHaveBeenCalled();
  });
});