import axios from 'axios';
import { OrganizationOffboardingHmLiveDisconnectAdapter } from './organization-offboarding-hm-live-disconnect.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OrganizationOffboardingHmLiveDisconnectAdapter', () => {
  const prisma = {
    highMobilityVehicle: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    vehicleDataSourceLink: { count: jest.fn().mockResolvedValue(0) },
    vehicle: { findUnique: jest.fn() },
  };
  const auth = {
    isConfigured: jest.fn(),
    authHeaders: jest.fn(),
  };
  const hmConfig = {
    healthApp: { apiBaseUrl: 'https://hm.test', requestTimeoutMs: 5000 },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    auth.isConfigured.mockReturnValue(true);
    auth.authHeaders.mockResolvedValue({ Authorization: 'Bearer t' });
    prisma.vehicleDataSourceLink.count.mockResolvedValue(0);
  });

  it('scopes revoke queries to organizationId', async () => {
    prisma.highMobilityVehicle.findMany.mockResolvedValue([]);
    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(
      prisma as never,
      auth as never,
      hmConfig as never,
    );
    await adapter.disconnectOrganization('org-scoped');
    expect(prisma.highMobilityVehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-scoped', isActive: true } }),
    );
  });

  it('409 with revoked body confirms via GET', async () => {
    prisma.highMobilityVehicle.findMany.mockImplementation(async (args: { where?: { organizationId?: string; vin?: string } }) => {
      if (args?.where?.organizationId === 'org-1') {
        return [{ id: 'hm-1', vin: 'VIN123', clearanceStatus: 'APPROVED' }];
      }
      if (args?.where?.vin === 'VIN123') {
        return [{ organizationId: 'org-1', clearanceStatus: 'APPROVED', synqdriveVehicleId: null }];
      }
      return [];
    });
    mockedAxios.delete.mockRejectedValue({
      response: { status: 409, data: { status: 'revoked' } },
      message: 'conflict',
    });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { status: 'revoked' },
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(
      prisma as never,
      auth as never,
      hmConfig as never,
    );
    const result = await adapter.disconnectOrganization('org-1');
    expect(result.outcome).toBe('CONFIRMED');
    expect(mockedAxios.get).toHaveBeenCalled();
  });

  it('409 with approved body is transition conflict (not confirmed)', async () => {
    prisma.highMobilityVehicle.findMany.mockImplementation(async (args: { where?: { organizationId?: string } }) => {
      if (args?.where?.organizationId) {
        return [{ id: 'hm-1', vin: 'VIN123', clearanceStatus: 'APPROVED' }];
      }
      return [];
    });
    mockedAxios.delete.mockRejectedValue({
      response: { status: 409, data: { status: 'approved' } },
      message: 'conflict',
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(
      prisma as never,
      auth as never,
      hmConfig as never,
    );
    const result = await adapter.disconnectOrganization('org-1');
    expect(result.outcome).toBe('FAILED');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('DELETE revoking then GET revoked confirms', async () => {
    prisma.highMobilityVehicle.findMany.mockImplementation(async (args: { where?: { organizationId?: string } }) => {
      if (args?.where?.organizationId) {
        return [{ id: 'hm-1', vin: 'VIN123', clearanceStatus: 'APPROVED' }];
      }
      return [];
    });
    mockedAxios.delete.mockResolvedValue({
      status: 200,
      data: { status: 'revoking' },
    });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { status: 'revoked' },
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(
      prisma as never,
      auth as never,
      hmConfig as never,
    );
    const result = await adapter.disconnectOrganization('org-1');
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.providerEvidence.operations.some((o) => o.action === 'DELETE_CLEARANCE')).toBe(true);
  });

  it('REVIEW_REQUIRED when historical HM link without HM row', async () => {
    prisma.highMobilityVehicle.findMany.mockResolvedValue([]);
    prisma.vehicleDataSourceLink.count.mockResolvedValue(2);

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(
      prisma as never,
      auth as never,
      hmConfig as never,
    );
    const result = await adapter.disconnectOrganization('org-hist');
    expect(result.outcome).toBe('REVIEW_REQUIRED');
    expect(result.detailCode).toBe('HM_HISTORICAL_LINK_WITHOUT_HM_ROW');
  });

  it('blocks DELETE when VIN shared with active clearance on another org', async () => {
    prisma.highMobilityVehicle.findMany.mockImplementation(async (args: { where?: { organizationId?: string; vin?: string; isActive?: boolean } }) => {
      if (args?.where?.organizationId === 'org-a') {
        return [{ id: 'hm-1', vin: 'SHAREDVIN', clearanceStatus: 'APPROVED' }];
      }
      if (args?.where?.vin === 'SHAREDVIN' && args?.where?.isActive === true) {
        return [
          { organizationId: 'org-a', clearanceStatus: 'APPROVED', synqdriveVehicleId: null },
          { organizationId: 'org-b', clearanceStatus: 'APPROVED', synqdriveVehicleId: null },
        ];
      }
      return [];
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(
      prisma as never,
      auth as never,
      hmConfig as never,
    );
    const result = await adapter.disconnectOrganization('org-a');
    expect(result.outcome).toBe('FAILED');
    expect(mockedAxios.delete).not.toHaveBeenCalled();
    expect(result.providerEvidence.operations[0]).toMatchObject({ action: 'BLOCK_CROSS_TENANT_VIN' });
  });
});