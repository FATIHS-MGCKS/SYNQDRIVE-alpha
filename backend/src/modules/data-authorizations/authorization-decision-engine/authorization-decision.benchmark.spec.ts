import { AuthorizationActorType } from '@prisma/client';
import { AuthorizationDecisionCache, buildCacheKey, buildPolicyVersionKey } from './authorization-decision.cache';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from './authorization-decision.constants';
import type { AuthorizationDecisionResult } from './authorization-decision.types';

describe('authorization-decision performance baseline', () => {
  const request = {
    organizationId: 'org-1',
    sourceSystem: 'SYNQDRIVE_SYSTEM',
    dataCategory: 'GPS_LOCATION',
    purpose: 'LIVE_MAP',
    action: AUTHORIZATION_DECISION_ACTION.INGEST,
    processorType: 'SYNQDRIVE',
    processorIdentity: 'synqdrive-ingestion',
    resourceType: 'VEHICLE',
    resourceId: 'veh-1',
    vehicleId: 'veh-1',
    customerId: null,
    bookingId: null,
    stationId: null,
  };

  const allowResult: AuthorizationDecisionResult = {
    decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
    enforced: true,
    isShadowMode: false,
    reasonCode: AUTHORIZATION_DECISION_REASON.POLICY_MATCH,
    reasonCodes: [AUTHORIZATION_DECISION_REASON.POLICY_MATCH],
    resolverResult: {
      decisionCandidate: 'ALLOW',
      matchedPolicy: {
        id: 'policy-1',
        policyFamilyId: 'fam-1',
        versionNumber: 1,
        enforcementMode: 'ENFORCE',
        scopeType: 'VEHICLE',
        processingActivityId: 'pa-1',
        priorityScore: 500,
      },
      policyVersion: 1,
      processingActivity: { status: 'ACTIVE', entityId: 'pa-1' },
      legalBasisStatus: { status: 'ACTIVE', entityId: 'lba-1' },
      consentStatus: { status: 'NOT_APPLICABLE' },
      providerGrantStatus: { status: 'NOT_APPLICABLE' },
      dataSharingStatus: { status: 'NOT_APPLICABLE' },
      dpaStatus: { status: 'NOT_APPLICABLE' },
      scopeMatch: { matched: true, scopeType: 'VEHICLE' },
      blockingReasons: [],
      warnings: [],
      evaluatedAt: new Date().toISOString(),
      resolverVersion: '1.0.0',
      evaluatedContext: {} as never,
    },
    matchedPolicyId: 'policy-1',
    policyVersion: 1,
    correlationId: 'bench-1',
    evaluatedAt: new Date().toISOString(),
    engineVersion: '1.0.0',
    cacheHit: false,
    auditEventId: null,
    warnings: [],
  };

  it('cache hit path completes under 1ms for 1000 lookups (baseline)', () => {
    const cache = new AuthorizationDecisionCache(30_000, 10_000);
    const key = buildCacheKey(request);
    const versionKey = buildPolicyVersionKey(allowResult.resolverResult);
    cache.set(key, versionKey, allowResult);

    const iterations = 1_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const hit = cache.get(key);
      if (!hit) throw new Error('expected cache hit');
    }
    const elapsed = performance.now() - start;
    const perOpMs = elapsed / iterations;
    expect(perOpMs).toBeLessThan(1);
  });

  it('invalidates cache when policy version changes', () => {
    const cache = new AuthorizationDecisionCache(30_000, 10_000);
    const key = buildCacheKey(request);
    const v1 = buildPolicyVersionKey(allowResult.resolverResult);
    cache.set(key, v1, allowResult);

    const v2Result = {
      ...allowResult,
      resolverResult: {
        ...allowResult.resolverResult!,
        matchedPolicy: {
          ...allowResult.resolverResult!.matchedPolicy!,
          versionNumber: 2,
        },
      },
    };
    const v2 = buildPolicyVersionKey(v2Result.resolverResult);
    expect(cache.getIfVersionMatches(key, v2)).toBeNull();
    expect(cache.get(key)?.policyVersion).toBe(1);
  });
});
