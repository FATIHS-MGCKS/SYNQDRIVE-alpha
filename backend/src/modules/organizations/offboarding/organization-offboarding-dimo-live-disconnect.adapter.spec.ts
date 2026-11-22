import axios from 'axios';
import { OrganizationOffboardingDimoLiveDisconnectAdapter } from './organization-offboarding-dimo-live-disconnect.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const pageInfoDone = { hasNextPage: false, endCursor: null };
const pageInfoMore = (endCursor: string) => ({ hasNextPage: true, endCursor });

describe('OrganizationOffboardingDimoLiveDisconnectAdapter', () => {
  const prisma = {
    vehicle: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    vehicleProviderConsent: { count: jest.fn().mockResolvedValue(0) },
  };
  const dimo = {
    clientId: '0xabc',
    apiUrl: 'https://identity.dimo.test',
    requestTimeoutMs: 5000,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.vehicle.count.mockResolvedValue(0);
    prisma.vehicleProviderConsent.count.mockResolvedValue(0);
  });

  it('privileged read-only confirms absent despite CONNECTED local status', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 999, connectionStatus: 'CONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: { vehicles: { nodes: [], pageInfo: pageInfoDone } },
      },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const disconnect = await adapter.verifyOrganizationDisconnect('org-priv-ro');
    expect(disconnect.outcome).toBe('NOT_AVAILABLE');
    expect(disconnect.detailCode).toBe('DIMO_LOCAL_CONNECTION_STILL_CONNECTED');

    const readOnly = await adapter.verifyOrganizationPrivilegedReadOnly('org-priv-ro');
    expect(readOnly.outcome).toBe('CONFIRMED');
  });

  it('fails closed when org tokens still privileged', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 42, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: { vehicles: { nodes: [{ tokenId: 42 }], pageInfo: pageInfoDone } },
      },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-1');
    expect(result.outcome).toBe('NOT_AVAILABLE');
    expect(result.detailCode).toBe('DIMO_PRIVILEGE_STILL_ACTIVE');
  });

  it('confirms after full paginated privileged traversal', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 999, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    const page1Nodes = Array.from({ length: 100 }, (_, i) => ({ tokenId: i + 1 }));
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          data: {
            vehicles: {
              nodes: page1Nodes,
              pageInfo: pageInfoMore('cursor-1'),
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            vehicles: {
              nodes: [{ tokenId: 101 }],
              pageInfo: pageInfoDone,
            },
          },
        },
      });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-2');
    expect(result.outcome).toBe('CONFIRMED');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(result.providerEvidence.summary).toMatchObject({
      paginationComplete: true,
      pagesTraversed: 2,
    });
  });

  it('fails closed on missing tokenId in privileged page', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 5, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: { vehicles: { nodes: [{ tokenId: 1 }, {}], pageInfo: pageInfoDone } },
      },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-3');
    expect(result.outcome).toBe('NOT_AVAILABLE');
    expect(result.detailCode).toBe('DIMO_EXTERNAL_VERIFY_IDENTITY_UNAVAILABLE');
  });

  it('fails closed on incomplete pagination cursor', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 5, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: {
          vehicles: {
            nodes: [{ tokenId: 1 }],
            pageInfo: { hasNextPage: true, endCursor: null },
          },
        },
      },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-4');
    expect(result.outcome).toBe('NOT_AVAILABLE');
  });

  it('fails closed when org link lacks tokenId', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: null, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-5');
    expect(result.outcome).toBe('NOT_AVAILABLE');
    expect(result.detailCode).toBe('DIMO_MISSING_VERIFIABLE_IDENTITY');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('returns REVIEW_REQUIRED for historical dependency without verifiable rows', async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);
    prisma.vehicleProviderConsent.count.mockResolvedValue(1);

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-6');
    expect(result.outcome).toBe('REVIEW_REQUIRED');
    expect(result.detailCode).toBe('DIMO_HISTORICAL_DEPENDENCY_UNVERIFIED');
  });

  it('fails closed when dimoVehicle relation missing', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v-broken', dimoVehicle: null },
    ]);

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-rel');
    expect(result.outcome).toBe('NOT_AVAILABLE');
    expect(result.detailCode).toBe('DIMO_MISSING_DIMO_VEHICLE_RELATION');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('fails closed when pageInfo missing', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 7, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: { data: { vehicles: { nodes: [{ tokenId: 1 }] } } },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-page');
    expect(result.outcome).toBe('NOT_AVAILABLE');
    expect(result.detailCode).toBe('DIMO_EXTERNAL_VERIFY_IDENTITY_UNAVAILABLE');
  });

  it('fails closed when nodes array missing', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 7, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: { data: { vehicles: { pageInfo: { hasNextPage: false, endCursor: null } } } },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-nodes');
    expect(result.outcome).toBe('NOT_AVAILABLE');
  });
});