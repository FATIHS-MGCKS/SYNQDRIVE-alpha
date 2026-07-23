import { POLICY_RESOLVER_DECISION } from '../policy-resolver/policy-resolver.constants';
import {
  AUTHORIZATION_DECISION_ENGINE_VERSION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
  type AuthorizationDecisionReasonCode,
} from './authorization-decision.constants';
import type {
  AuthorizationDecisionEngineInput,
  AuthorizationDecisionResult,
} from './authorization-decision.types';

/**
 * Pure fail-closed decision engine — maps resolver output to operational ALLOW/DENY.
 * Does not duplicate policy evaluation; delegates to PolicyResolverResult.
 */
export function evaluateAuthorizationDecision(
  input: AuthorizationDecisionEngineInput,
): AuthorizationDecisionResult {
  const evaluatedAt = new Date().toISOString();
  const base = {
    correlationId: input.request.correlationId,
    evaluatedAt,
    engineVersion: AUTHORIZATION_DECISION_ENGINE_VERSION,
    cacheHit: false,
    auditEventId: null,
    warnings: [] as string[],
    resolverResult: input.resolverResult,
    matchedPolicyId: input.resolverResult?.matchedPolicy?.id ?? null,
    policyVersion: input.resolverResult?.policyVersion ?? null,
  };

  if (input.globalDenySwitch) {
    return denyResult(base, [AUTHORIZATION_DECISION_REASON.GLOBAL_DENY_SWITCH]);
  }

  if (input.resolverError) {
    return denyResult(base, [AUTHORIZATION_DECISION_REASON.DATABASE_ERROR]);
  }

  if (!input.resolverResult) {
    return denyResult(base, [AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR]);
  }

  if (
    input.devBypassEnabled &&
    !input.isProduction &&
    input.resolverResult.decisionCandidate === POLICY_RESOLVER_DECISION.DENY
  ) {
    return {
      ...base,
      decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      enforced: false,
      isShadowMode: false,
      reasonCode: AUTHORIZATION_DECISION_REASON.DEVELOPMENT_BYPASS,
      reasonCodes: [AUTHORIZATION_DECISION_REASON.DEVELOPMENT_BYPASS],
      warnings: ['Development bypass allowed access without policy match'],
    };
  }

  return mapResolverCandidate(input.resolverResult, base);
}

function mapResolverCandidate(
  resolverResult: NonNullable<AuthorizationDecisionEngineInput['resolverResult']>,
  base: Omit<
    AuthorizationDecisionResult,
    'decision' | 'enforced' | 'isShadowMode' | 'reasonCode' | 'reasonCodes'
  >,
): AuthorizationDecisionResult {
  const resolverReasons = resolverResult.blockingReasons as AuthorizationDecisionReasonCode[];

  switch (resolverResult.decisionCandidate) {
    case POLICY_RESOLVER_DECISION.ALLOW:
      return {
        ...base,
        decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
        enforced: true,
        isShadowMode: false,
        reasonCode: resolverReasons[0] ?? AUTHORIZATION_DECISION_REASON.POLICY_MATCH,
        reasonCodes: resolverReasons.length ? resolverReasons : [AUTHORIZATION_DECISION_REASON.POLICY_MATCH],
        warnings: resolverResult.warnings,
      };

    case POLICY_RESOLVER_DECISION.SHADOW_WOULD_DENY:
      return {
        ...base,
        decision: AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY,
        enforced: false,
        isShadowMode: true,
        reasonCode: primaryReason(resolverReasons),
        reasonCodes: resolverReasons.length ? resolverReasons : [AUTHORIZATION_DECISION_REASON.POLICY_UNCLEAR],
        warnings: [
          ...resolverResult.warnings,
          'Shadow mode: access permitted but would be denied under ENFORCE',
        ],
      };

    case POLICY_RESOLVER_DECISION.CONFLICT:
    case POLICY_RESOLVER_DECISION.INCOMPLETE:
      return denyResult(base, [
        AUTHORIZATION_DECISION_REASON.POLICY_UNCLEAR,
        ...resolverReasons,
      ]);

    case POLICY_RESOLVER_DECISION.DENY:
    default:
      return denyResult(
        base,
        resolverReasons.length ? resolverReasons : [AUTHORIZATION_DECISION_REASON.NO_MATCHING_POLICY],
      );
  }
}

function denyResult(
  base: Omit<
    AuthorizationDecisionResult,
    'decision' | 'enforced' | 'isShadowMode' | 'reasonCode' | 'reasonCodes'
  >,
  reasonCodes: AuthorizationDecisionReasonCode[],
): AuthorizationDecisionResult {
  const unique = [...new Set(reasonCodes)];
  return {
    ...base,
    decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
    enforced: true,
    isShadowMode: false,
    reasonCode: primaryReason(unique),
    reasonCodes: unique,
  };
}

function primaryReason(reasons: AuthorizationDecisionReasonCode[]): AuthorizationDecisionReasonCode {
  return reasons[0] ?? AUTHORIZATION_DECISION_REASON.NO_MATCHING_POLICY;
}

/** Build a deny result for invalid request context — used before resolver call. */
export function buildInvalidRequestDecision(
  correlationId: string,
  reasonCodes: AuthorizationDecisionReasonCode[],
): AuthorizationDecisionResult {
  const unique = [...new Set(reasonCodes)];
  return {
    decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
    enforced: true,
    isShadowMode: false,
    reasonCode: primaryReason(unique),
    reasonCodes: unique,
    resolverResult: null,
    matchedPolicyId: null,
    policyVersion: null,
    correlationId: correlationId.trim() || 'unknown',
    evaluatedAt: new Date().toISOString(),
    engineVersion: AUTHORIZATION_DECISION_ENGINE_VERSION,
    cacheHit: false,
    auditEventId: null,
    warnings: [],
  };
}
