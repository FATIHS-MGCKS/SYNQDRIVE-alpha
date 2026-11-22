import axios from 'axios';
import { OrganizationOffboardingDimoLiveDisconnectAdapter } from './organization-offboarding-dimo-live-disconnect.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OrganizationOffboardingDimoLiveDisconnectAdapter', () => {
  const prisma = {
    vehicle: { findMany: jest.fn() },
  };
  const dimo = {
    clientId: '0xabc',
    apiUrl: 'https://identity.dimo.test',
    requestTimeoutMs: 5000,
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fails closed when org tokens still privileged', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 42, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: { vehicles: { nodes: [{ tokenId: 42 }] } },
      },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-1');
    expect(result.outcome).toBe('NOT_AVAILABLE');
    expect(result.detailCode).toBe('DIMO_PRIVILEGE_STILL_ACTIVE');
  });

  it('confirms when not privileged and no CONNECTED rows', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 99, connectionStatus: 'DISCONNECTED', externalId: 'e1' } },
    ]);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: { vehicles: { nodes: [{ tokenId: 1 }] } },
      },
    });

    const adapter = new OrganizationOffboardingDimoLiveDisconnectAdapter(prisma as never, dimo as never);
    const result = await adapter.verifyOrganizationDisconnect('org-2');
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.providerEvidence.summary).toMatchObject({ privilegedStillActive: false });
  });
});