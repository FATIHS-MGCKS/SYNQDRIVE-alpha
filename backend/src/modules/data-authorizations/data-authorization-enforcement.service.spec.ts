import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';
import {
  AUTHORIZATION_DECISION_OUTCOME,
} from './authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionService } from './authorization-decision-engine/authorization-decision.service';

describe('DataAuthorizationEnforcementService', () => {
  const prisma = {
    orgDataAuthorization: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const authorizationDecision = {
    decide: jest.fn(),
  };

  let service: DataAuthorizationEnforcementService;

  const denyDecision = {
    decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
    matchedPolicyId: null,
    resolverResult: null,
    reasonCodes: ['NO_MATCHING_POLICY'],
    correlationId: 'corr-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authorizationDecision.decide.mockResolvedValue(denyDecision);
    service = new DataAuthorizationEnforcementService(
      prisma as never,
      authorizationDecision as unknown as AuthorizationDecisionService,
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

  it('uses decision engine result when ALLOW with matched policy', async () => {
    authorizationDecision.decide.mockResolvedValue({
      decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      matchedPolicyId: 'policy-resolved-1',
      resolverResult: {
        matchedPolicy: { id: 'policy-resolved-1' },
      },
      reasonCodes: ['POLICY_MATCH'],
      correlationId: 'corr-1',
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
