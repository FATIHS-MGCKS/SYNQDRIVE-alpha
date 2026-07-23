import { AuthorizationActorType } from '@prisma/client';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from './authorization-decision.constants';
import { buildAuthorizationDecisionContext } from './authorization-decision.context';
import { buildInvalidRequestDecision, evaluateAuthorizationDecision } from './authorization-decision.engine';
import { POLICY_RESOLVER_DECISION } from '../policy-resolver/policy-resolver.constants';

describe('authorization-decision fail-closed', () => {
  const validBase = {
    organizationId: 'org-1',
    sourceSystem: 'SYNQDRIVE_SYSTEM' as const,
    dataCategory: 'GPS_LOCATION',
    purpose: 'LIVE_MAP',
    action: AUTHORIZATION_DECISION_ACTION.INGEST,
    processorType: 'SYNQDRIVE' as const,
    processorId: 'synqdrive-platform',
    resourceType: 'VEHICLE' as const,
    vehicleId: 'veh-1',
    resourceId: 'veh-1',
    correlationId: 'corr-ingest-1',
    actorType: AuthorizationActorType.SYSTEM,
  };

  it('denies when correlationId is missing', () => {
    const { request, reasonCodes } = buildAuthorizationDecisionContext({
      ...validBase,
      correlationId: '',
    });
    expect(request).toBeNull();
    expect(reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.MISSING_CORRELATION_ID);
    const decision = buildInvalidRequestDecision('', reasonCodes);
    expect(decision.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
  });

  it('denies unknown data category', () => {
    const { request, reasonCodes } = buildAuthorizationDecisionContext({
      ...validBase,
      dataCategory: 'UNKNOWN_CATEGORY',
    });
    expect(request).toBeNull();
    expect(reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.UNKNOWN_DATA_CATEGORY);
  });

  it('denies unknown processor identity for provider platform', () => {
    const { request, reasonCodes } = buildAuthorizationDecisionContext({
      ...validBase,
      processorType: 'PROVIDER_PLATFORM',
      processorId: 'unknown-vendor-xyz',
    });
    expect(request).toBeNull();
    expect(reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.UNKNOWN_PROCESSOR);
  });

  it('denies missing processor identity', () => {
    const { request, reasonCodes } = buildAuthorizationDecisionContext({
      ...validBase,
      processorId: undefined,
      serviceIdentity: undefined,
    });
    expect(request).toBeNull();
    expect(reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.MISSING_PROCESSOR_IDENTITY);
  });

  it('denies org-wide scope without explicit flag', () => {
    const { request, reasonCodes } = buildAuthorizationDecisionContext({
      ...validBase,
      resourceType: 'ORGANIZATION',
      vehicleId: null,
      resourceId: null,
      organizationWideScope: false,
    });
    expect(request).toBeNull();
    expect(reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.MISSING_RESOURCE_SCOPE);
  });

  it('denies unknown action', () => {
    const { request, reasonCodes } = buildAuthorizationDecisionContext({
      ...validBase,
      action: 'INVALID_ACTION' as never,
    });
    expect(request).toBeNull();
    expect(reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.UNKNOWN_ACTION);
  });

  it('denies incomplete policy dataset from resolver', () => {
    const { request } = buildAuthorizationDecisionContext(validBase);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: {
        decisionCandidate: POLICY_RESOLVER_DECISION.INCOMPLETE,
        matchedPolicy: null,
        policyVersion: null,
        processingActivity: { status: 'UNKNOWN' },
        legalBasisStatus: { status: 'UNKNOWN' },
        consentStatus: { status: 'UNKNOWN' },
        providerGrantStatus: { status: 'UNKNOWN' },
        dataSharingStatus: { status: 'UNKNOWN' },
        dpaStatus: { status: 'UNKNOWN' },
        scopeMatch: { matched: false, scopeType: 'ORGANIZATION' },
        blockingReasons: ['INCOMPLETE_POLICY_DATASET'],
        warnings: [],
        evaluatedAt: new Date().toISOString(),
        resolverVersion: '1.0.0',
        evaluatedContext: {} as never,
      },
      resolverError: false,
      globalDenySwitch: false,
      devBypassEnabled: false,
      isProduction: true,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
    expect(result.reasonCodes).toContain(AUTHORIZATION_DECISION_REASON.POLICY_UNCLEAR);
  });

  it('denies when resolver returns null without dev bypass in production', () => {
    const { request } = buildAuthorizationDecisionContext(validBase);
    const result = evaluateAuthorizationDecision({
      request: request!,
      resolverResult: null,
      resolverError: false,
      globalDenySwitch: false,
      devBypassEnabled: true,
      isProduction: true,
    });
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
    expect(result.reasonCode).toBe(AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR);
  });

  it('accepts serviceIdentity instead of processorId', () => {
    const { request, reasonCodes } = buildAuthorizationDecisionContext({
      ...validBase,
      processorId: undefined,
      serviceIdentity: 'synqdrive-ingestion',
    });
    expect(reasonCodes).toHaveLength(0);
    expect(request?.processorIdentity).toBe('synqdrive-ingestion');
  });
});
