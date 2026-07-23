import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';
import { POLICY_RESOLVER_DECISION } from './policy-resolver/policy-resolver.constants';
import type { PolicyResolverService } from './policy-resolver/policy-resolver.service';

describe('DataAuthorizationEnforcementService', () => {
  const prisma = {
    orgDataAuthorization: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const policyResolver = {
    resolve: jest.fn(),
  };

  let service: DataAuthorizationEnforcementService;

  const denyResolution = {
    decisionCandidate: POLICY_RESOLVER_DECISION.DENY,
    matchedPolicy: null,
    blockingReasons: ['NO_MATCHING_POLICY'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    policyResolver.resolve.mockResolvedValue(denyResolution);
    service = new DataAuthorizationEnforcementService(
      prisma as never,
      policyResolver as unknown as PolicyResolverService,
    );
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

  it('uses policy resolver result when ALLOW with matched policy', async () => {
    policyResolver.resolve.mockResolvedValue({
      decisionCandidate: POLICY_RESOLVER_DECISION.ALLOW,
      matchedPolicy: { id: 'policy-resolved-1' },
      blockingReasons: [],
    });

    const result = await service.assertDataAuthorization({
      orgId: 'org-1',
      sourceType: 'DIMO',
      dataCategory: 'GPS_LOCATION',
      purpose: 'LIVE_MAP',
    });

    expect(result.id).toBe('policy-resolved-1');
    expect(prisma.orgDataAuthorization.findMany).not.toHaveBeenCalled();
  });
});
