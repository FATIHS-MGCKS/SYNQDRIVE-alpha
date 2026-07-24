import {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  LegalBasisConsentRequirement,
  PrivacyEnforcementMode,
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import {
  POLICY_RESOLVER_ACTION,
  POLICY_RESOLVER_DECISION,
  POLICY_RESOLVER_DPIA_REQUIRED_COMBINATIONS,
  POLICY_RESOLVER_EEA_COUNTRIES,
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_REASON,
  POLICY_RESOLVER_SOURCE_SYSTEM,
  POLICY_RESOLVER_VERSION,
  type PolicyResolverDecision,
  type PolicyResolverReasonCode,
} from './policy-resolver.constants';
import { buildPolicyResolverContext } from './policy-resolver.context';
import {
  policyMatchesContext,
  selectBestPolicyMatches,
  sortMatchesDeterministic,
} from './policy-resolver.matching';
import type {
  PolicyResolverCandidate,
  PolicyResolverEvaluatedContext,
  PolicyResolverInput,
  PolicyResolverLegalBasisCandidate,
  PolicyResolverMatchedPolicy,
  PolicyResolverResult,
  ResolvePolicyEngineInput,
} from './policy-resolver.types';
import { isPolicyCurrentlyUsable } from '../privacy-domain/policy-lifecycle/policy-lifecycle.transitions';
import { resolveProviderKeyFromSourceSystem } from '../provider-grant-consolidation/provider-grant-consolidation.constants';

/**
 * Pure policy resolution engine — deterministic, no database access, no mutations.
 */
export function resolvePolicy(input: PolicyResolverInput): PolicyResolverResult {
  const { context, blockingReasons: inputErrors } = buildPolicyResolverContext(input);
  const evaluatedAt = new Date().toISOString();

  if (!context || inputErrors.length > 0) {
    return emptyResult({
      evaluatedAt,
      context: context ?? buildFallbackContext(input),
      decision: POLICY_RESOLVER_DECISION.DENY,
      blockingReasons: inputErrors.length ? inputErrors : [POLICY_RESOLVER_REASON.INPUT_INVALID],
    });
  }

  return resolvePolicyEngine({ context, candidates: [] });
}

export function resolvePolicyEngine(input: ResolvePolicyEngineInput): PolicyResolverResult {
  const evaluatedAt = new Date().toISOString();
  const at = new Date(input.context.effectiveTimestamp);

  const matchResults = input.candidates.map((c) =>
    policyMatchesContext(c, input.context, at),
  );
  const sorted = sortMatchesDeterministic(matchResults);
  const { winners, conflict } = selectBestPolicyMatches(sorted);

  if (conflict && winners.length > 1) {
    return emptyResult({
      evaluatedAt,
      context: input.context,
      decision: POLICY_RESOLVER_DECISION.CONFLICT,
      blockingReasons: [POLICY_RESOLVER_REASON.POLICY_CONFLICT],
      conflictingPolicyIds: winners.map((w) => w.candidate.enforcementPolicy.id),
    });
  }

  if (winners.length === 0) {
    const bestEffort = sorted[0];
    const reasons =
      bestEffort?.blockingReasons.length
        ? [...bestEffort.blockingReasons]
        : [POLICY_RESOLVER_REASON.NO_MATCHING_POLICY];
    return emptyResult({
      evaluatedAt,
      context: input.context,
      decision: POLICY_RESOLVER_DECISION.DENY,
      blockingReasons: reasons,
      scopeMatch: bestEffort?.scopeMatch,
    });
  }

  return evaluatePolicyStack(winners[0].candidate, input.context, at, evaluatedAt, winners[0]);
}

function evaluatePolicyStack(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
  at: Date,
  evaluatedAt: string,
  match: { priorityScore: number; scopeMatch: { matched: boolean; scopeType: string; detail?: string } },
): PolicyResolverResult {
  const blockingReasons: PolicyResolverReasonCode[] = [];
  const warnings: string[] = [];

  const matchedPolicy: PolicyResolverMatchedPolicy = {
    id: candidate.enforcementPolicy.id,
    policyFamilyId: candidate.enforcementPolicy.policyFamilyId,
    versionNumber: candidate.enforcementPolicy.versionNumber,
    enforcementMode: candidate.enforcementPolicy.enforcementMode,
    scopeType: candidate.enforcementPolicy.scopeType,
    processingActivityId: candidate.enforcementPolicy.processingActivityId,
    priorityScore: match.priorityScore,
  };

  const processingActivity = evaluateProcessingActivity(candidate, at, blockingReasons);
  const legalBasis = evaluateLegalBasis(candidate, at, blockingReasons);
  const consent = evaluateConsent(candidate, context, legalBasis, at, blockingReasons);
  const providerGrant = evaluateProviderGrant(
    candidate,
    context,
    at,
    blockingReasons,
    candidate.enforcementPolicy.status,
  );
  const dataSharing = evaluateDataSharing(candidate, context, at, blockingReasons);
  const dpa = evaluateDpa(candidate, context, at, blockingReasons);
  evaluateDpiaGate(candidate, context, legalBasis, blockingReasons);
  evaluateTransferGate(candidate, blockingReasons);

  if (!candidate.processingActivity) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INCOMPLETE_POLICY_DATASET);
  }

  const uniqueReasons = [...new Set(blockingReasons)];

  return {
    decisionCandidate: deriveDecision(candidate.enforcementPolicy.enforcementMode, uniqueReasons),
    matchedPolicy,
    policyVersion: candidate.enforcementPolicy.versionNumber,
    processingActivity,
    legalBasisStatus: legalBasis,
    consentStatus: consent,
    providerGrantStatus: providerGrant,
    dataSharingStatus: dataSharing,
    dpaStatus: dpa,
    scopeMatch: {
      matched: match.scopeMatch.matched,
      scopeType: candidate.enforcementPolicy.scopeType,
      detail: match.scopeMatch.detail,
    },
    blockingReasons: uniqueReasons,
    warnings,
    evaluatedAt,
    resolverVersion: POLICY_RESOLVER_VERSION,
    evaluatedContext: context,
  };
}

function evaluateProcessingActivity(
  candidate: PolicyResolverCandidate,
  at: Date,
  blockingReasons: PolicyResolverReasonCode[],
): PolicyResolverResult['processingActivity'] {
  const pa = candidate.processingActivity;
  if (!pa) {
    blockingReasons.push(POLICY_RESOLVER_REASON.PROCESSING_ACTIVITY_MISSING);
    return { status: 'NOT_FOUND' };
  }
  if (pa.organizationId !== candidate.enforcementPolicy.organizationId) {
    blockingReasons.push(POLICY_RESOLVER_REASON.TENANT_MISMATCH);
    return { status: pa.status, entityId: pa.id, activityCode: pa.activityCode, detail: 'tenant mismatch' };
  }
  if (pa.status !== PrivacyPolicyLifecycleStatus.ACTIVE) {
    blockingReasons.push(POLICY_RESOLVER_REASON.PROCESSING_ACTIVITY_INACTIVE);
    return { status: pa.status, entityId: pa.id, activityCode: pa.activityCode };
  }
  if (!isPolicyCurrentlyUsable({ status: pa.status, validFrom: pa.validFrom, validUntil: pa.validUntil, now: at })) {
    blockingReasons.push(POLICY_RESOLVER_REASON.PROCESSING_ACTIVITY_INACTIVE);
  }
  return { status: pa.status, entityId: pa.id, activityCode: pa.activityCode };
}

function evaluateLegalBasis(
  candidate: PolicyResolverCandidate,
  at: Date,
  blockingReasons: PolicyResolverReasonCode[],
): PolicyResolverResult['legalBasisStatus'] {
  const assessments = candidate.legalBasisAssessments.filter(
    (a) =>
      a.processingActivityId === candidate.enforcementPolicy.processingActivityId &&
      a.organizationId === candidate.enforcementPolicy.organizationId,
  );

  if (assessments.length === 0) {
    blockingReasons.push(POLICY_RESOLVER_REASON.LEGAL_BASIS_MISSING);
    return { status: 'NOT_FOUND' };
  }

  const active = assessments.filter(
    (a) =>
      a.status === PrivacyPolicyLifecycleStatus.ACTIVE &&
      isPolicyCurrentlyUsable({
        status: a.status,
        validFrom: a.validFrom,
        validUntil: a.validUntil,
        now: at,
      }),
  );

  if (active.length === 0) {
    const any = assessments[0];
    if (any.status === PrivacyPolicyLifecycleStatus.EXPIRED) {
      blockingReasons.push(POLICY_RESOLVER_REASON.LEGAL_BASIS_EXPIRED);
    } else {
      blockingReasons.push(POLICY_RESOLVER_REASON.LEGAL_BASIS_NOT_ACTIVE);
    }
    return {
      status: any.status,
      entityId: any.id,
      legalBasisType: any.legalBasisType,
      consentRequirement: any.consentRequirement,
    };
  }

  if (active.length > 1) {
    blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_CONFLICT);
  }

  const chosen = active.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  return {
    status: chosen.status,
    entityId: chosen.id,
    legalBasisType: chosen.legalBasisType,
    consentRequirement: chosen.consentRequirement,
  };
}

function evaluateConsent(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
  legalBasis: PolicyResolverResult['legalBasisStatus'],
  at: Date,
  blockingReasons: PolicyResolverReasonCode[],
): PolicyResolverResult['consentStatus'] {
  const requiresConsent =
    legalBasis.legalBasisType === PrivacyLegalBasisType.CONSENT ||
    legalBasis.consentRequirement !== LegalBasisConsentRequirement.NOT_APPLICABLE;

  if (!requiresConsent) {
    return { status: 'NOT_APPLICABLE' };
  }

  if (!context.dataSubjectReference) {
    blockingReasons.push(POLICY_RESOLVER_REASON.CONSENT_REQUIRED);
    return { status: 'NOT_FOUND', detail: 'dataSubjectReference required' };
  }

  const consents = candidate.dataSubjectConsents.filter(
    (c) =>
      c.processingActivityId === candidate.enforcementPolicy.processingActivityId &&
      c.purpose === context.purpose &&
      c.dataSubjectReference === context.dataSubjectReference,
  );

  if (consents.length === 0) {
    blockingReasons.push(POLICY_RESOLVER_REASON.CONSENT_MISSING);
    return { status: 'NOT_FOUND' };
  }

  const granted = consents.find((c) => c.consentStatus === DataSubjectConsentStatus.GRANTED);
  if (!granted) {
    const latest = consents[0];
    if (latest.consentStatus === DataSubjectConsentStatus.WITHDRAWN) {
      blockingReasons.push(POLICY_RESOLVER_REASON.CONSENT_WITHDRAWN);
    } else if (latest.consentStatus === DataSubjectConsentStatus.EXPIRED) {
      blockingReasons.push(POLICY_RESOLVER_REASON.CONSENT_EXPIRED);
    } else {
      blockingReasons.push(POLICY_RESOLVER_REASON.CONSENT_PENDING);
    }
    return { status: latest.consentStatus, entityId: latest.id };
  }

  if (granted.expiresAt && granted.expiresAt.getTime() <= at.getTime()) {
    blockingReasons.push(POLICY_RESOLVER_REASON.CONSENT_EXPIRED);
    return { status: DataSubjectConsentStatus.EXPIRED, entityId: granted.id };
  }

  return { status: DataSubjectConsentStatus.GRANTED, entityId: granted.id };
}

function evaluateProviderGrant(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
  at: Date,
  blockingReasons: PolicyResolverReasonCode[],
  policyStatus: PrivacyPolicyLifecycleStatus,
): PolicyResolverResult['providerGrantStatus'] {
  const needsProvider =
    context.sourceSystem === POLICY_RESOLVER_SOURCE_SYSTEM.DIMO ||
    context.sourceSystem === POLICY_RESOLVER_SOURCE_SYSTEM.HIGH_MOBILITY ||
    context.processorType === POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM;

  if (!needsProvider) {
    return { status: 'NOT_APPLICABLE' };
  }

  const providerKey = resolveProviderKeyFromSourceSystem(
    context.sourceSystem,
    context.processorId,
  );
  if (!providerKey) {
    blockingReasons.push(POLICY_RESOLVER_REASON.PROVIDER_GRANT_MISSING);
    return { status: 'NOT_FOUND', detail: 'unknown provider source' };
  }

  const grants = candidate.providerAccessGrants.filter((g) => {
    if (g.organizationId !== context.organizationId) return false;
    if (g.provider.toUpperCase() !== providerKey) return false;
    if (g.processingActivityId && g.processingActivityId !== candidate.enforcementPolicy.processingActivityId) {
      return false;
    }
    if (context.vehicleId && g.vehicleId && g.vehicleId !== context.vehicleId) return false;
    return true;
  });

  if (grants.length === 0) {
    blockingReasons.push(POLICY_RESOLVER_REASON.PROVIDER_GRANT_MISSING);
    return { status: 'NOT_FOUND' };
  }

  const active = grants.find((g) => g.providerStatus === ProviderAccessGrantStatus.ACTIVE);
  if (!active) {
    const g = grants[0];
    if (g.providerStatus === ProviderAccessGrantStatus.REVOKED) {
      blockingReasons.push(POLICY_RESOLVER_REASON.PROVIDER_GRANT_REVOKED);
    } else if (g.providerStatus === ProviderAccessGrantStatus.EXPIRED) {
      blockingReasons.push(POLICY_RESOLVER_REASON.PROVIDER_GRANT_EXPIRED);
    } else {
      blockingReasons.push(POLICY_RESOLVER_REASON.PROVIDER_GRANT_PENDING);
    }
    return { status: g.providerStatus, entityId: g.id };
  }

  if (active.expiresAt && active.expiresAt.getTime() <= at.getTime()) {
    blockingReasons.push(POLICY_RESOLVER_REASON.PROVIDER_GRANT_EXPIRED);
    return { status: ProviderAccessGrantStatus.EXPIRED, entityId: active.id };
  }

  if (
    active.providerStatus === ProviderAccessGrantStatus.ACTIVE &&
    (policyStatus === PrivacyPolicyLifecycleStatus.REVOKED ||
      policyStatus === PrivacyPolicyLifecycleStatus.SUSPENDED ||
      policyStatus === PrivacyPolicyLifecycleStatus.EXPIRED)
  ) {
    blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_REVOKED_PROVIDER_ACTIVE);
    blockingReasons.push(POLICY_RESOLVER_REASON.PROVIDER_GRANT_POLICY_CONTRADICTION);
  }

  return { status: ProviderAccessGrantStatus.ACTIVE, entityId: active.id };
}

function evaluateDataSharing(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
  at: Date,
  blockingReasons: PolicyResolverReasonCode[],
): PolicyResolverResult['dataSharingStatus'] {
  const needsSharing =
    context.action === POLICY_RESOLVER_ACTION.SHARE ||
    context.processorType === POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER ||
    context.sourceSystem === POLICY_RESOLVER_SOURCE_SYSTEM.PARTNER_ACCESS;

  if (!needsSharing) {
    return { status: 'NOT_APPLICABLE' };
  }

  const authorizations = candidate.dataSharingAuthorizations.filter(
    (a) =>
      a.processingActivityId === candidate.enforcementPolicy.processingActivityId &&
      a.purpose === context.purpose &&
      a.dataCategories.includes(context.dataCategory),
  );

  if (authorizations.length === 0) {
    blockingReasons.push(POLICY_RESOLVER_REASON.DATA_SHARING_MISSING);
    return { status: 'NOT_FOUND' };
  }

  const authorized = authorizations.filter(
    (a) => a.status === DataSharingAuthorizationStatus.AUTHORIZED,
  );

  if (authorized.length === 0) {
    blockingReasons.push(POLICY_RESOLVER_REASON.DATA_SHARING_UNAUTHORIZED);
    return { status: authorizations[0].status, entityId: authorizations[0].id };
  }

  const match = authorized.find(
    (a) =>
      (!a.validFrom || a.validFrom.getTime() <= at.getTime()) &&
      (!a.validUntil || a.validUntil.getTime() > at.getTime()),
  );

  if (!match) {
    blockingReasons.push(POLICY_RESOLVER_REASON.DATA_SHARING_EXPIRED);
    return { status: DataSharingAuthorizationStatus.EXPIRED, entityId: authorized[0].id };
  }

  return { status: DataSharingAuthorizationStatus.AUTHORIZED, entityId: match.id };
}

function evaluateDpa(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
  at: Date,
  blockingReasons: PolicyResolverReasonCode[],
): PolicyResolverResult['dpaStatus'] {
  const needsDpa = context.processorType === POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER;

  if (!needsDpa) {
    return { status: 'NOT_APPLICABLE' };
  }

  const dpas = candidate.dataProcessingAgreements.filter(
    (d) =>
      d.organizationId === context.organizationId &&
      (!d.processingActivityId ||
        d.processingActivityId === candidate.enforcementPolicy.processingActivityId),
  );

  if (dpas.length === 0) {
    blockingReasons.push(POLICY_RESOLVER_REASON.DPA_MISSING);
    return { status: 'NOT_FOUND' };
  }

  const active = dpas.filter((d) => d.status === DataProcessingAgreementStatus.ACTIVE);
  if (active.length === 0) {
    blockingReasons.push(POLICY_RESOLVER_REASON.DPA_NOT_ACTIVE);
    return { status: dpas[0].status, entityId: dpas[0].id };
  }

  const match = active.find(
    (d) =>
      d.processorLabel === context.processorId &&
      (!d.effectiveFrom || d.effectiveFrom.getTime() <= at.getTime()) &&
      (!d.effectiveUntil || d.effectiveUntil.getTime() > at.getTime()) &&
      d.signedAt != null,
  );

  if (!match) {
    blockingReasons.push(POLICY_RESOLVER_REASON.DPA_MISSING);
    return { status: 'NOT_FOUND', detail: 'no active DPA for processorId' };
  }

  return { status: DataProcessingAgreementStatus.ACTIVE, entityId: match.id };
}

function evaluateDpiaGate(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
  legalBasis: PolicyResolverResult['legalBasisStatus'],
  blockingReasons: PolicyResolverReasonCode[],
): void {
  const requires = POLICY_RESOLVER_DPIA_REQUIRED_COMBINATIONS.some(
    (combo) =>
      combo.dataCategory === context.dataCategory && combo.purpose === context.purpose,
  );
  if (!requires) return;

  blockingReasons.push(POLICY_RESOLVER_REASON.DPIA_REQUIRED);

  const assessment = candidate.legalBasisAssessments.find((a) => a.id === legalBasis.entityId);
  const hasDpiaEvidence =
    Boolean(assessment?.balancingTestReference?.trim()) ||
    assessment?.evidenceReferences.some((ref) => /dpia/i.test(ref)) ||
    legalBasis.legalBasisType === PrivacyLegalBasisType.LEGITIMATE_INTERESTS;

  if (!hasDpiaEvidence && legalBasis.status !== 'NOT_FOUND') {
    blockingReasons.push(POLICY_RESOLVER_REASON.DPIA_MISSING);
  }
}

function evaluateTransferGate(
  candidate: PolicyResolverCandidate,
  blockingReasons: PolicyResolverReasonCode[],
): void {
  for (const auth of candidate.dataSharingAuthorizations) {
    if (!auth.transferCountry) continue;
    const country = auth.transferCountry.trim().toUpperCase();
    if (POLICY_RESOLVER_EEA_COUNTRIES.has(country)) continue;
    if (!auth.transferMechanism) {
      blockingReasons.push(POLICY_RESOLVER_REASON.TRANSFER_MECHANISM_REQUIRED);
    }
  }
}

function deriveDecision(
  mode: PrivacyEnforcementMode,
  blockingReasons: PolicyResolverReasonCode[],
): PolicyResolverDecision {
  if (blockingReasons.includes(POLICY_RESOLVER_REASON.POLICY_CONFLICT)) {
    return POLICY_RESOLVER_DECISION.CONFLICT;
  }
  if (blockingReasons.includes(POLICY_RESOLVER_REASON.INCOMPLETE_POLICY_DATASET)) {
    return POLICY_RESOLVER_DECISION.INCOMPLETE;
  }
  if (blockingReasons.length === 0) {
    return POLICY_RESOLVER_DECISION.ALLOW;
  }
  if (mode === PrivacyEnforcementMode.SHADOW) {
    return POLICY_RESOLVER_DECISION.SHADOW_WOULD_DENY;
  }
  if (mode === PrivacyEnforcementMode.OFF) {
    return POLICY_RESOLVER_DECISION.ALLOW;
  }
  return POLICY_RESOLVER_DECISION.DENY;
}

function emptyResult(params: {
  evaluatedAt: string;
  context: PolicyResolverEvaluatedContext;
  decision: PolicyResolverDecision;
  blockingReasons: PolicyResolverReasonCode[];
  conflictingPolicyIds?: string[];
  scopeMatch?: PolicyResolverResult['scopeMatch'];
}): PolicyResolverResult {
  return {
    decisionCandidate: params.decision,
    matchedPolicy: null,
    policyVersion: null,
    processingActivity: { status: 'UNKNOWN' },
    legalBasisStatus: { status: 'UNKNOWN' },
    consentStatus: { status: 'UNKNOWN' },
    providerGrantStatus: { status: 'UNKNOWN' },
    dataSharingStatus: { status: 'UNKNOWN' },
    dpaStatus: { status: 'UNKNOWN' },
    scopeMatch: params.scopeMatch ?? { matched: false, scopeType: 'ORGANIZATION' },
    blockingReasons: params.blockingReasons,
    warnings: [],
    evaluatedAt: params.evaluatedAt,
    resolverVersion: POLICY_RESOLVER_VERSION,
    evaluatedContext: params.context,
    conflictingPolicyIds: params.conflictingPolicyIds,
  };
}

function buildFallbackContext(input: PolicyResolverInput): PolicyResolverEvaluatedContext {
  return {
    organizationId: input.organizationId ?? '',
    sourceSystem: input.sourceSystem,
    dataCategory: input.dataCategory,
    purpose: input.purpose,
    action: input.action,
    processorType: input.processorType,
    processorId: input.processorId ?? '',
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    stationId: input.stationId ?? null,
    customerId: input.customerId ?? null,
    bookingId: input.bookingId ?? null,
    vehicleId: input.vehicleId ?? null,
    dataSubjectReference: input.dataSubjectReference ?? null,
    effectiveTimestamp: new Date().toISOString(),
  };
}

/** Test helper — build engine candidates from partial fixtures. */
export function buildPolicyResolverCandidate(
  partial: Partial<PolicyResolverCandidate> & {
    enforcementPolicy: PolicyResolverCandidate['enforcementPolicy'];
  },
): PolicyResolverCandidate {
  return {
    processingActivity: partial.processingActivity ?? null,
    legalBasisAssessments: partial.legalBasisAssessments ?? [],
    dataSubjectConsents: partial.dataSubjectConsents ?? [],
    providerAccessGrants: partial.providerAccessGrants ?? [],
    dataSharingAuthorizations: partial.dataSharingAuthorizations ?? [],
    dataProcessingAgreements: partial.dataProcessingAgreements ?? [],
    scopeVehicleIds: partial.scopeVehicleIds ?? [],
    scopeCustomerIds: partial.scopeCustomerIds ?? [],
    scopeBookingIds: partial.scopeBookingIds ?? [],
    scopeStationIds: partial.scopeStationIds ?? [],
    enforcementPolicy: partial.enforcementPolicy,
  };
}

export type { PolicyResolverLegalBasisCandidate };
