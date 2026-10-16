import { VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';
import { listConsumerRequirements } from './vsi-consumer-requirements.registry';
import {
  VsiDomainApprovalStatus,
  type VsiConsumerRequirementSpecV1,
} from './vsi-consumer-requirements.types';
import {
  findFallbackChain,
  isFallbackChainExecutable,
  VsiFallbackApprovalStatus,
} from './vsi-fallback-approval.registry';
import { computeSignalFreshnessAtEvaluation } from './vsi-capability-resolver.freshness';
import {
  VSI_CAPABILITY_RESOLVER_CONTRACT_VERSION,
  VsiCapabilityResolutionStatus,
  VsiCapabilityResolverReasonCode,
  type VsiCapabilityResolverInput,
  type VsiCapabilityResolverProfileContext,
  type VsiCapabilityResolverResultV1,
  type VsiCapabilitySignalEvaluationV1,
} from './vsi-capability-resolver.types';
import { VSI_PROFILE_MATERIALIZATION_KEYS } from './vsi-profile.types';

const MATERIALIZED = new Set<string>(VSI_PROFILE_MATERIALIZATION_KEYS);

const ATTRIBUTION_LIMITATIONS = new Set([
  'LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK',
  'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS',
  'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY',
]);

export type VsiCapabilityResolverEngineContext = {
  profile: VsiCapabilityResolverProfileContext | null;
  linkActive: boolean;
  linkSuperseded: boolean;
  tenantMatch: boolean;
  activeSourceLinkCount: number;
};

function isLegacyProfile(ctx: VsiCapabilityResolverProfileContext): boolean {
  return ctx.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1;
}

function hasP3QualityFields(signal: VsiCapabilityResolverProfileContext['signals'][number]): boolean {
  return (
    typeof signal.qualityClassification === 'string' &&
    typeof signal.confidenceLevel === 'string'
  );
}

function evaluateRequirement(
  req: VsiConsumerRequirementSpecV1,
  ctx: VsiCapabilityResolverProfileContext,
  evaluationTimeMs: number,
): { evaluations: VsiCapabilitySignalEvaluationV1[]; satisfied: boolean; reasons: VsiCapabilityResolverReasonCode[] } {
  const reasons: VsiCapabilityResolverReasonCode[] = [];
  const evaluations: VsiCapabilitySignalEvaluationV1[] = [];

  if (req.domainApprovalStatus === VsiDomainApprovalStatus.PENDING_DOMAIN_APPROVAL) {
    return {
      evaluations: req.canonicalSignalKeys.map((key) => ({
        canonicalSignalKey: key,
        satisfied: false,
        empiricalObservation: null,
        freshnessAtEvaluation: 'UNKNOWN',
        qualityClassification: null,
        confidenceLevel: null,
        lastSourceTimestamp: null,
        limitations: [],
        reasonCodes: [VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL],
      })),
      satisfied: false,
      reasons: [VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL],
    };
  }

  if (req.maxSignalAgeMs == null && req.minimumQuality !== 'ANY_OBSERVED') {
    return {
      evaluations: req.canonicalSignalKeys.map((key) => ({
        canonicalSignalKey: key,
        satisfied: false,
        empiricalObservation: null,
        freshnessAtEvaluation: 'UNKNOWN',
        qualityClassification: null,
        confidenceLevel: null,
        lastSourceTimestamp: null,
        limitations: [],
        reasonCodes: [VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL],
      })),
      satisfied: false,
      reasons: [VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL],
    };
  }

  let allSatisfied = true;

  for (const key of req.canonicalSignalKeys) {
    const rowReasons: VsiCapabilityResolverReasonCode[] = [];
    if (!MATERIALIZED.has(key)) {
      rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_NOT_MATERIALIZED);
      evaluations.push({
        canonicalSignalKey: key,
        satisfied: false,
        empiricalObservation: null,
        freshnessAtEvaluation: 'UNKNOWN',
        qualityClassification: null,
        confidenceLevel: null,
        lastSourceTimestamp: null,
        limitations: [],
        reasonCodes: rowReasons,
      });
      allSatisfied = false;
      continue;
    }

    const signal = ctx.signals.find((s) => s.canonicalSignalKey === key);
    if (!signal) {
      rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_NEVER_OBSERVED);
      evaluations.push({
        canonicalSignalKey: key,
        satisfied: false,
        empiricalObservation: null,
        freshnessAtEvaluation: 'UNKNOWN',
        qualityClassification: null,
        confidenceLevel: null,
        lastSourceTimestamp: null,
        limitations: [],
        reasonCodes: rowReasons,
      });
      allSatisfied = false;
      continue;
    }

    const freshnessAtEvaluation = computeSignalFreshnessAtEvaluation({
      lastSourceTimestamp: signal.lastSourceTimestamp,
      evaluationTimeMs,
    });

    if (req.minimumEvidence === 'EMPIRICAL_OBSERVED') {
      if (signal.empiricalObservation === 'NEVER_OBSERVED') {
        rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_NEVER_OBSERVED);
      }
    }

    if (
      req.minimumEvidence === 'DECLARED_LISTED' &&
      signal.declaredSupport !== 'LISTED' &&
      !req.declaredOnlySufficient
    ) {
      rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_DECLARED_ONLY);
    }

    if (req.maxSignalAgeMs != null && signal.lastSourceTimestamp) {
      const ageMs =
        evaluationTimeMs - Date.parse(signal.lastSourceTimestamp);
      if (Number.isFinite(ageMs) && ageMs > req.maxSignalAgeMs) {
        rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_STALE_AT_EVALUATION);
      }
    } else if (req.minimumQuality === 'FRESH_AT_EVALUATION' && freshnessAtEvaluation === 'STALE') {
      rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_STALE_AT_EVALUATION);
    }

    if (req.minimumQuality === 'QUALITY_OBSERVED_FRESH') {
      if (signal.qualityClassification !== 'OBSERVED_FRESH') {
        rowReasons.push(VsiCapabilityResolverReasonCode.QUALITY_INSUFFICIENT);
      }
    }

    if (req.minimumQuality === 'CONFIDENCE_HIGH' && signal.confidenceLevel !== 'HIGH') {
      rowReasons.push(VsiCapabilityResolverReasonCode.QUALITY_INSUFFICIENT);
    }

    if (req.historicalReliability === 'PER_SIGNAL_CADENCE_PROVEN') {
      if (
        signal.observedCadenceMedianSeconds == null ||
        signal.observedSamples == null
      ) {
        rowReasons.push(VsiCapabilityResolverReasonCode.HISTORICAL_RELIABILITY_UNAVAILABLE);
      }
    }

    const satisfied = rowReasons.length === 0;
    if (!satisfied) {
      allSatisfied = false;
      reasons.push(...rowReasons);
    }

    evaluations.push({
      canonicalSignalKey: key,
      satisfied,
      empiricalObservation: signal.empiricalObservation,
      freshnessAtEvaluation,
      qualityClassification: signal.qualityClassification ?? null,
      confidenceLevel: signal.confidenceLevel ?? null,
      lastSourceTimestamp: signal.lastSourceTimestamp,
      limitations: [...signal.limitations],
      reasonCodes: rowReasons,
    });
  }

  if (req.requireAllSignalsTogether && evaluations.some((e) => !e.satisfied)) {
    allSatisfied = false;
  }

  return { evaluations, satisfied: allSatisfied, reasons };
}

export function resolveVsiCapabilities(
  input: VsiCapabilityResolverInput,
  engineContext: VsiCapabilityResolverEngineContext,
): VsiCapabilityResolverResultV1 {
  const evaluationTimeMs = input.evaluationTime.getTime();
  const limitations: string[] = [];
  const reasonCodes: VsiCapabilityResolverReasonCode[] = [];
  const missingRequirementIds: string[] = [];
  const signalEvaluations: VsiCapabilitySignalEvaluationV1[] = [];
  let fallbackPlan = null as VsiCapabilityResolverResultV1['fallbackPlan'];

  if (!engineContext.tenantMatch) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.UNKNOWN,
      reasonCodes: [VsiCapabilityResolverReasonCode.TENANT_SCOPE_MISMATCH],
      limitations: ['TENANT_SCOPE_MISMATCH'],
    });
  }

  if (!engineContext.linkActive) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.UNKNOWN,
      reasonCodes: [VsiCapabilityResolverReasonCode.LINK_INACTIVE],
      limitations: ['SOURCE_LINK_INACTIVE'],
    });
  }

  if (engineContext.linkSuperseded) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.UNKNOWN,
      reasonCodes: [VsiCapabilityResolverReasonCode.LINK_SUPERSEDED],
      limitations: ['SOURCE_LINK_SUPERSEDED'],
    });
  }

  if (!engineContext.profile) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.INSUFFICIENT_EVIDENCE,
      reasonCodes: [VsiCapabilityResolverReasonCode.PROFILE_NOT_FOUND],
      limitations: ['PROFILE_NOT_FOUND'],
    });
  }

  const profile = engineContext.profile;
  limitations.push(...profile.profileLimitations);

  if (isLegacyProfile(profile)) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.NOT_ASSESSABLE,
      profile,
      reasonCodes: [VsiCapabilityResolverReasonCode.LEGACY_PROFILE_MISSING_P3_QUALITY],
      limitations: [...limitations, 'LEGACY_PROFILE_MISSING_P3_QUALITY'],
    });
  }

  if (
    profile.profileLimitations.some((l) => ATTRIBUTION_LIMITATIONS.has(l)) ||
    profile.signals.some((s) => s.limitations.some((l) => ATTRIBUTION_LIMITATIONS.has(l)))
  ) {
    reasonCodes.push(VsiCapabilityResolverReasonCode.ATTRIBUTION_UNKNOWN);
    if (profile.profileLimitations.includes('MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS')) {
      reasonCodes.push(VsiCapabilityResolverReasonCode.MULTI_ACTIVE_SOURCE_LINKS);
      reasonCodes.push(VsiCapabilityResolverReasonCode.DECLARED_CATALOG_AMBIGUOUS);
    }
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.UNKNOWN,
      profile,
      reasonCodes,
      limitations,
    });
  }

  if (engineContext.activeSourceLinkCount > 1) {
    limitations.push('MULTI_ACTIVE_SOURCE_LINKS_PRESENT');
  }

  const requirements = listConsumerRequirements({
    consumerModule: input.consumerModule,
    featureId: input.featureId,
    requirementsVersion: input.requirementsVersion,
  });

  if (requirements.length === 0) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.NOT_ASSESSABLE,
      profile,
      limitations: [...limitations, 'NO_REQUIREMENTS_FOR_FEATURE'],
    });
  }

  let anyAssessable = false;
  let allEligible = true;
  let anyInsufficient = false;

  for (const req of requirements) {
    if (!profile.signals.some((s) => hasP3QualityFields(s)) && req.minimumQuality !== 'ANY_OBSERVED') {
      missingRequirementIds.push(req.requirementId);
      reasonCodes.push(VsiCapabilityResolverReasonCode.LEGACY_PROFILE_MISSING_P3_QUALITY);
      allEligible = false;
      continue;
    }

    const outcome = evaluateRequirement(req, profile, evaluationTimeMs);
    signalEvaluations.push(...outcome.evaluations);

    if (
      outcome.reasons.includes(VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL)
    ) {
      missingRequirementIds.push(req.requirementId);
      reasonCodes.push(...outcome.reasons);
      allEligible = false;
      continue;
    }

    anyAssessable = true;

    if (!outcome.satisfied) {
      allEligible = false;
      anyInsufficient = true;
      missingRequirementIds.push(req.requirementId);
      reasonCodes.push(...outcome.reasons);

      if (req.fallbackChainId) {
        const chain = findFallbackChain(req.fallbackChainId);
        if (!chain) {
          reasonCodes.push(VsiCapabilityResolverReasonCode.FALLBACK_NOT_APPROVED);
        } else if (
          chain.status === VsiFallbackApprovalStatus.REVOKED ||
          chain.status === VsiFallbackApprovalStatus.REJECTED
        ) {
          reasonCodes.push(VsiCapabilityResolverReasonCode.FALLBACK_REVOKED);
          fallbackPlan = {
            chainId: chain.chainId,
            status: chain.status,
            executable: false,
            fromCanonicalSignalKey: chain.fromCanonicalSignalKey,
            toCanonicalSignalKey: chain.toCanonicalSignalKey,
            notes: chain.semanticNotes,
          };
        } else if (!isFallbackChainExecutable(chain.status)) {
          reasonCodes.push(VsiCapabilityResolverReasonCode.FALLBACK_NOT_APPROVED);
          fallbackPlan = {
            chainId: chain.chainId,
            status: chain.status,
            executable: false,
            fromCanonicalSignalKey: chain.fromCanonicalSignalKey,
            toCanonicalSignalKey: chain.toCanonicalSignalKey,
            notes: chain.semanticNotes,
          };
        } else {
          fallbackPlan = {
            chainId: chain.chainId,
            status: chain.status,
            executable: false,
            fromCanonicalSignalKey: chain.fromCanonicalSignalKey,
            toCanonicalSignalKey: chain.toCanonicalSignalKey,
            notes: [
              ...chain.semanticNotes,
              'P4_V1_NO_FALLBACK_EXECUTION — registry match only',
            ],
          };
        }
      }
    }
  }

  let resolutionStatus: VsiCapabilityResolutionStatus;
  if (!anyAssessable) {
    resolutionStatus = VsiCapabilityResolutionStatus.NOT_ASSESSABLE;
  } else if (allEligible) {
    resolutionStatus = VsiCapabilityResolutionStatus.ELIGIBLE;
  } else if (anyInsufficient) {
    resolutionStatus = VsiCapabilityResolutionStatus.INSUFFICIENT_EVIDENCE;
  } else {
    resolutionStatus = VsiCapabilityResolutionStatus.UNKNOWN;
  }

  return baseResult(input, {
    resolutionStatus,
    profile,
    signalEvaluations,
    missingRequirementIds,
    reasonCodes: [...new Set(reasonCodes)],
    limitations,
    fallbackPlan,
    evidenceProvenance: ['VEHICLE_SIGNAL_CAPABILITY_PROFILE'],
  });
}

function baseResult(
  input: VsiCapabilityResolverInput,
  partial: {
    resolutionStatus: VsiCapabilityResolutionStatus;
    profile?: VsiCapabilityResolverProfileContext | null;
    signalEvaluations?: VsiCapabilitySignalEvaluationV1[];
    missingRequirementIds?: string[];
    reasonCodes?: VsiCapabilityResolverReasonCode[];
    limitations?: string[];
    fallbackPlan?: VsiCapabilityResolverResultV1['fallbackPlan'];
    evidenceProvenance?: string[];
  },
): VsiCapabilityResolverResultV1 {
  const profile = partial.profile ?? null;
  return {
    contractVersion: VSI_CAPABILITY_RESOLVER_CONTRACT_VERSION,
    resolutionStatus: partial.resolutionStatus,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    consumerModule: input.consumerModule,
    featureId: input.featureId,
    requirementsVersion: input.requirementsVersion,
    evaluationTime: input.evaluationTime.toISOString(),
    profileContractVersion: profile?.profileContractVersion ?? null,
    profileRevision: profile?.profileRevision ?? null,
    profileContentFingerprint: profile?.contentFingerprint ?? null,
    signalEvaluations: partial.signalEvaluations ?? [],
    missingRequirementIds: partial.missingRequirementIds ?? [],
    limitations: partial.limitations ?? [],
    reasonCodes: partial.reasonCodes ?? [],
    fallbackPlan: partial.fallbackPlan ?? null,
    evidenceProvenance: partial.evidenceProvenance ?? [],
  };
}
