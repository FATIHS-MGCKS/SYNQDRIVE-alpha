import axios from 'axios';
import { OrganizationOffboardingHmLiveDisconnectAdapter } from './organization-offboarding-hm-live-disconnect.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

type HmRow = {
  id: string;
  vin: string;
  clearanceStatus: string;
  organizationId?: string | null;
  synqdriveVehicleId?: string | null;
};

function stubHmPrisma(
  prisma: {
    highMobilityVehicle: { findMany: jest.Mock };
    vehicleDataSourceLink: { count: jest.Mock };
    vehicle: { findMany: jest.Mock; findUnique: jest.Mock };
  },
  opts: {
    orgId: string;
    directActive?: HmRow[];
    inactiveOrg?: HmRow[];
    indirectActive?: HmRow[];
    orgVehicleIds?: string[];
    historicalLinks?: number;
    inactiveHistoricalLinks?: number;
    vinPeers?: Array<{
      id: string;
      organizationId: string | null;
      clearanceStatus: string;
      synqdriveVehicleId: string | null;
    }>;
    crossOrgLinkCount?: number;
  },
) {
  prisma.vehicle.findMany.mockResolvedValue((opts.orgVehicleIds ?? []).map((id) => ({ id })));
  prisma.vehicleDataSourceLink.count.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    if (where.isActive === false) {
      return opts.inactiveHistoricalLinks ?? 0;
    }
    if (where.vehicle && typeof where.vehicle === 'object' && (where.vehicle as { organizationId?: unknown }).organizationId) {
      const vo = (where.vehicle as { organizationId?: { not?: string } }).organizationId;
      if (vo && typeof vo === 'object' && 'not' in vo) {
        return opts.crossOrgLinkCount ?? 0;
      }
    }
    return opts.historicalLinks ?? 0;
  });

  prisma.highMobilityVehicle.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    if (where.organizationId === opts.orgId && where.isActive === true) {
      return (opts.directActive ?? []).map((r) => ({
        synqdriveVehicleId: null,
        organizationId: opts.orgId,
        ...r,
      }));
    }
    if (where.organizationId === opts.orgId && where.isActive === false) {
      return opts.inactiveOrg ?? [];
    }
    if (where.synqdriveVehicleId && where.NOT) {
      return opts.indirectActive ?? [];
    }
    if (where.vin && where.isActive === true) {
      return opts.vinPeers ?? [];
    }
    return [];
  });
}

describe('OrganizationOffboardingHmLiveDisconnectAdapter', () => {
  const prisma = {
    highMobilityVehicle: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    vehicleDataSourceLink: { count: jest.fn().mockResolvedValue(0) },
    vehicle: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
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
    prisma.vehicle.findMany.mockResolvedValue([]);
  });

  it('scopes revoke queries to organizationId', async () => {
    stubHmPrisma(prisma, { orgId: 'org-scoped' });
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
    stubHmPrisma(prisma, {
      orgId: 'org-1',
      directActive: [{ id: 'hm-1', vin: 'VIN123', clearanceStatus: 'APPROVED', organizationId: 'org-1' }],
      vinPeers: [{ id: 'hm-1', organizationId: 'org-1', clearanceStatus: 'APPROVED', synqdriveVehicleId: null }],
    });
    mockedAxios.delete.mockRejectedValue({
      response: { status: 409, data: { status: 'revoked' } },
      message: 'conflict',
    });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { status: 'revoked' },
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-1');
    expect(result.outcome).toBe('CONFIRMED');
    expect(mockedAxios.get).toHaveBeenCalled();
  });

  it('409 with approved body is transition conflict (not confirmed)', async () => {
    stubHmPrisma(prisma, {
      orgId: 'org-1',
      directActive: [{ id: 'hm-1', vin: 'VIN123', clearanceStatus: 'APPROVED', organizationId: 'org-1' }],
      vinPeers: [{ id: 'hm-1', organizationId: 'org-1', clearanceStatus: 'APPROVED', synqdriveVehicleId: null }],
    });
    mockedAxios.delete.mockRejectedValue({
      response: { status: 409, data: { status: 'approved' } },
      message: 'conflict',
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-1');
    expect(result.outcome).toBe('FAILED');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('DELETE revoking then GET revoked confirms', async () => {
    stubHmPrisma(prisma, {
      orgId: 'org-1',
      directActive: [{ id: 'hm-1', vin: 'VIN123', clearanceStatus: 'APPROVED', organizationId: 'org-1' }],
      vinPeers: [{ id: 'hm-1', organizationId: 'org-1', clearanceStatus: 'APPROVED', synqdriveVehicleId: null }],
    });
    mockedAxios.delete.mockResolvedValue({
      status: 200,
      data: { status: 'revoking' },
    });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { status: 'revoked' },
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-1');
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.providerEvidence.operations.some((o) => o.action === 'DELETE_CLEARANCE')).toBe(true);
  });

  it('REVIEW_REQUIRED when historical HM link without HM row', async () => {
    stubHmPrisma(prisma, { orgId: 'org-hist', historicalLinks: 2 });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-hist');
    expect(result.outcome).toBe('REVIEW_REQUIRED');
    expect(result.detailCode).toBe('HM_HISTORICAL_LINK_WITHOUT_HM_ROW');
  });

  it('blocks DELETE when VIN shared with active clearance on another org', async () => {
    stubHmPrisma(prisma, {
      orgId: 'org-a',
      directActive: [{ id: 'hm-1', vin: 'SHAREDVIN', clearanceStatus: 'APPROVED', organizationId: 'org-a' }],
      vinPeers: [
        { id: 'hm-1', organizationId: 'org-a', clearanceStatus: 'APPROVED', synqdriveVehicleId: null },
        { id: 'hm-2', organizationId: 'org-b', clearanceStatus: 'APPROVED', synqdriveVehicleId: null },
      ],
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-a');
    expect(result.outcome).toBe('FAILED');
    expect(mockedAxios.delete).not.toHaveBeenCalled();
    expect(result.providerEvidence.operations.some((o) => o.action === 'BLOCK_CROSS_TENANT_VIN')).toBe(true);
  });

  it('blocks DELETE when VIN ownership cannot be verified', async () => {
    stubHmPrisma(prisma, {
      orgId: 'org-unknown',
      directActive: [
        {
          id: 'hm-1',
          vin: 'UNKVIN',
          clearanceStatus: 'APPROVED',
          organizationId: null,
          synqdriveVehicleId: null,
        },
      ],
      vinPeers: [{ id: 'hm-1', organizationId: null, clearanceStatus: 'APPROVED', synqdriveVehicleId: null }],
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-unknown');
    expect(result.outcome).toBe('FAILED');
    expect(mockedAxios.delete).not.toHaveBeenCalled();
    expect(result.providerEvidence.operations.some((o) => o.action === 'BLOCK_UNKNOWN_VIN_OWNERSHIP')).toBe(true);
  });

  it('REVIEW_REQUIRED for historical inactive non-terminal dependency', async () => {
    stubHmPrisma(prisma, {
      orgId: 'org-inact',
      inactiveOrg: [{ id: 'hm-old', vin: 'VIN', clearanceStatus: 'APPROVED' }],
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-inact');
    expect(result.outcome).toBe('REVIEW_REQUIRED');
    expect(result.detailCode).toBe('HM_HISTORICAL_INACTIVE_DEPENDENCY');
  });

  it('REVIEW_REQUIRED when direct, indirect, and historical HM evidence coexist', async () => {
    stubHmPrisma(prisma, {
      orgId: 'org-mixed',
      orgVehicleIds: ['veh-1'],
      directActive: [{ id: 'hm-direct', vin: 'VIN-D', clearanceStatus: 'APPROVED', organizationId: 'org-mixed' }],
      indirectActive: [
        {
          id: 'hm-indirect',
          vin: 'VIN-I',
          clearanceStatus: 'APPROVED',
          organizationId: null,
          synqdriveVehicleId: 'veh-1',
        },
      ],
      historicalLinks: 2,
    });
    let linkCountCalls = 0;
    prisma.vehicleDataSourceLink.count.mockImplementation(async () => {
      linkCountCalls += 1;
      if (linkCountCalls === 1) return 2;
      if (linkCountCalls === 2) return 0;
      return 1;
    });
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-mixed' });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-mixed');
    expect(result.outcome).toBe('REVIEW_REQUIRED');
    expect(result.detailCode).toBe('HM_MIXED_DIRECT_AND_INDIRECT_DEPENDENCY');
    expect(mockedAxios.delete).not.toHaveBeenCalled();
  });

  it('REVIEW_REQUIRED for indirect vehicle binding without direct org HM row', async () => {
    stubHmPrisma(prisma, {
      orgId: 'org-ind',
      orgVehicleIds: ['veh-1'],
      indirectActive: [
        {
          id: 'hm-ind',
          vin: 'VIND',
          clearanceStatus: 'APPROVED',
          organizationId: null,
          synqdriveVehicleId: 'veh-1',
        },
      ],
    });
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-ind' });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(prisma as never, auth as never, hmConfig as never);
    const result = await adapter.disconnectOrganization('org-ind');
    expect(result.outcome).toBe('REVIEW_REQUIRED');
    expect(result.detailCode).toBe('HM_INDIRECT_VEHICLE_BINDING');
  });
});