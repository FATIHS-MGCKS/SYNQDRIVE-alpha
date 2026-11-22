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
      expect.objectContaining({ where: { organizationId: 'org-scoped' } }),
    );
  });

  it('treats DELETE 409 as idempotent CONFIRMED', async () => {
    prisma.highMobilityVehicle.findMany.mockResolvedValue([
      { id: 'hm-1', vin: 'VIN123', clearanceStatus: 'APPROVED' },
    ]);
    mockedAxios.delete.mockRejectedValue({
      response: { status: 409, data: { status: 'revoked' } },
      message: 'conflict',
    });

    const adapter = new OrganizationOffboardingHmLiveDisconnectAdapter(
      prisma as never,
      auth as never,
      hmConfig as never,
    );
    const result = await adapter.disconnectOrganization('org-1');
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.providerEvidence.operations[0]).toMatchObject({ idempotent: true });
  });
});