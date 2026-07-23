import { AuthorizationActorType } from '@prisma/client';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from './authorization-decision.constants';
import { buildAuthorizationDecisionContext } from './authorization-decision.context';
import { evaluateAuthorizationDecision } from './authorization-decision.engine';
import { POLICY_RESOLVER_DECISION } from '../policy-resolver/policy-resolver.constants';
import type { PolicyResolverResult } from '../policy-resolver/policy-resolver.types';

const baseRequest = {
  organizationId: 'org-1',
  sourceSystem: 'SYNQDRIVE_SYSTEM' as const,
  dataCategory: 'GPS_LOCATION',
  purpose: 'LIVE_MAP',
  action: AUTHORIZATION_DECISION_ACTION.READ,
  processorType: 'SYNQDRIVE' as const,
  processorId: 'synqdrive-platform',
  resourceType: 'VEHICLE' as const,
  resourceId: 'veh-1',
  vehicleId: 'veh-1',
  correlationId: 'corr-1',
  actorType: AuthorizationActorType.SYSTEM,
};

function resolverResult(
  decisionCandidate: PolicyResolverResult['decisionCandidate'],
  overrides: Partial<PolicyResolverResult> = {},
): PolicyResolverResult {
  return {
    decisionCandidate,
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
    evaluatedAt: '2026-07-23T12:00:00.000Z',
    resolverVersion: '1.0.0',
    evaluatedContext: {} as PolicyResolverResult['evaluatedContext'],
    ...overrides,
  };
}

describe('authorization-decision.engine', () => {
  it('maps resolver ALLOW to operational ALLOW', () => {
    const { request } = buildAuthorizationDecisionContext(baseRequest);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: resolverResult(POLICY_RESOLVER_DECISION.ALLOW),
      resolverError: false,
      globalDenySwitch: false,
      devBypassEnabled: false,
      isProduction: true,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    expect(result.enforced).toBe(true);
    expect(result.isShadowMode).toBe(false);
    expect(result.reasonCode).toBe(AUTHORIZATION_DECISION_REASON.POLICY_MATCH);
  });

  it('maps resolver SHADOW_WOULD_DENY with explicit shadow marker', () => {
    const { request } = buildAuthorizationDecisionContext(baseRequest);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: resolverResult(POLICY_RESOLVER_DECISION.SHADOW_WOULD_DENY, {
        blockingReasons: ['LEGAL_BASIS_MISSING'],
      }),
      resolverError: false,
      globalDenySwitch: false,
      devBypassEnabled: false,
      isProduction: true,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY);
    expect(result.enforced).toBe(false);
    expect(result.isShadowMode).toBe(true);
    expect(result.warnings.some((w) => w.includes('Shadow mode'))).toBe(true);
  });

  it('denies on CONFLICT (unclear policy)', () => {
    const { request } = buildAuthorizationDecisionContext(baseRequest);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: resolverResult(POLICY_RESOLVER_DECISION.CONFLICT, {
        blockingReasons: ['POLICY_CONFLICT'],
      }),
      resolverError: false,
      globalDenySwitch: false,
      devBypassEnabled: false,
      isProduction: true,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
    expect(result.reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.POLICY_UNCLEAR);
  });

  it('denies on resolver database error', () => {
    const { request } = buildAuthorizationDecisionContext(baseRequest);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: null,
      resolverError: true,
      globalDenySwitch: false,
      devBypassEnabled: false,
      isProduction: true,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
    expect(result.reasonCode).toBe(AUTHORIZATION_DECISION_REASON.DATABASE_ERROR);
  });

  it('global deny switch takes priority', () => {
    const { request } = buildAuthorizationDecisionContext(baseRequest);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: resolverResult(POLICY_RESOLVER_DECISION.ALLOW),
      resolverError: false,
      globalDenySwitch: true,
      devBypassEnabled: false,
      isProduction: true,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
    expect(result.reasonCode).toBe(AUTHORIZATION_DECISION_REASON.GLOBAL_DENY_SWITCH);
  });

  it('development bypass only outside production', () => {
    const { request } = buildAuthorizationDecisionContext(baseRequest);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: resolverResult(POLICY_RESOLVER_DECISION.DENY, {
        blockingReasons: ['NO_MATCHING_POLICY'],
      }),
      resolverError: false,
      globalDenySwitch: false,
      devBypassEnabled: true,
      isProduction: false,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    expect(result.reasonCode).toBe(AUTHORIZATION_DECISION_REASON.DEVELOPMENT_BYPASS);
  });
});
