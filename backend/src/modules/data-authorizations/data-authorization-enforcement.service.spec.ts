import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';

describe('DataAuthorizationEnforcementService', () => {
  const prisma = {
    orgDataAuthorization: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: DataAuthorizationEnforcementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataAuthorizationEnforcementService(prisma as any);
  });

  it('allows CONNECTED_VEHICLES scope when vehicle is listed', async () => {
    prisma.orgDataAuthorization.findMany.mockResolvedValue([
      {
        id: 'a1',
        scope: 'CONNECTED_VEHICLES',
        processorType: 'SYNQDRIVE',
        dataCategories: ['GPS_LOCATION'],
        purposes: ['LIVE_MAP'],
        purpose: 'LIVE_MAP',
        vehicleIds: ['veh-1'],
        status: 'ACTIVE',
        expiresAt: null,
      },
    ]);

    await expect(
      service.assertDataAuthorization({
        orgId: 'org-1',
        vehicleId: 'veh-1',
        sourceType: 'DIMO',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
      }),
    ).resolves.toMatchObject({ id: 'a1' });
  });

  it('denies CONNECTED_VEHICLES when vehicle not in list', async () => {
    prisma.orgDataAuthorization.findMany.mockResolvedValue([
      {
        id: 'a1',
        scope: 'CONNECTED_VEHICLES',
        processorType: 'SYNQDRIVE',
        dataCategories: ['GPS_LOCATION'],
        purposes: ['LIVE_MAP'],
        purpose: 'LIVE_MAP',
        vehicleIds: ['veh-2'],
        status: 'ACTIVE',
        expiresAt: null,
      },
    ]);

    await expect(
      service.assertDataAuthorization({
        orgId: 'org-1',
        vehicleId: 'veh-1',
        sourceType: 'DIMO',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
      }),
    ).rejects.toBeInstanceOf(DataAuthorizationDeniedException);
  });

  it('denies expired ACTIVE authorization', async () => {
    prisma.orgDataAuthorization.findMany.mockResolvedValue([
      {
        id: 'a1',
        scope: 'ORGANIZATION',
        processorType: 'SYNQDRIVE',
        dataCategories: ['GPS_LOCATION'],
        purposes: ['LIVE_MAP'],
        purpose: 'LIVE_MAP',
        vehicleIds: [],
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 60_000),
      },
    ]);

    await expect(
      service.assertDataAuthorization({
        orgId: 'org-1',
        sourceType: 'DIMO',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
      }),
    ).rejects.toBeInstanceOf(DataAuthorizationDeniedException);
  });

  it('denies REVOKED rows (not returned by query)', async () => {
    prisma.orgDataAuthorization.findMany.mockResolvedValue([]);

    await expect(
      service.assertDataAuthorization({
        orgId: 'org-1',
        sourceType: 'DIMO',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
      }),
    ).rejects.toBeInstanceOf(DataAuthorizationDeniedException);
  });
});
