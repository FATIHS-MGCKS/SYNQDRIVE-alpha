import {
  VSI_PROFILE_CONTRACT_VERSION,
  VSI_PROFILE_CONTRACT_VERSION_V1,
} from './vsi-profile.types';
import {
  isConsumerRequirementDesignContractOnly,
  isConsumerRequirementRuntimeApproved,
  listConsumerRequirements,
} from './vsi-consumer-requirements.registry';
import {
  VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
  VsiDomainApprovalStatus,
  type VsiConsumerRequirementSpecV1,
} from './vsi-consumer-requirements.types';
import {
  findFallbackChain,
  isFallbackChainExecutable,
  type VsiFallbackChainSpecV1,
  VsiFallbackApprovalStatus,
} from './vsi-fallback-approval.registry';
import {
  computeSignalFreshnessAtEvaluation,
  isSignalTimestampValidAtEvaluation,
  parseSignalTimestampMs,
} from './vsi-capability-resolver.freshness';
import {
  empiricalObservationFailureReason,
  isQualifyingEmpiricalObservation,
} from './vsi-capability-resolver.empirical';
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

export type VsiCapabilityResolverRegistryOverrides = {
  requirements?: readonly VsiConsumerRequirementSpecV1[];
  fallbackChains?: readonly VsiFallbackChainSpecV1[];
};

export type VsiCapabilityResolverEngineContext = {
  profile: VsiCapabilityResolverProfileContext | null;
  linkActive: boolean;
  linkSuperseded: boolean;
  tenantMatch: boolean;
  activeSourceLinkCount: number;
};

function resolveRequirements(
  input: VsiCapabilityResolverInput,
  overrides?: VsiCapabilityResolverRegistryOverrides,
): VsiConsumerRequirementSpecV1[] {
  if (overrides?.requirements) {
    return overrides.requirements.filter(
      (r) =>
        r.consumerModule === input.consumerModule && r.featureId === input.featureId,
    );
  }
  return listConsumerRequirements({
    consumerModule: input.consumerModule,
    featureId: input.featureId,
    requirementsVersion: input.requirementsVersion,
  });
}

function resolveFallbackChain(
  chainId: string,
  overrides?: VsiCapabilityResolverRegistryOverrides,
): VsiFallbackChainSpecV1 | undefined {
  if (overrides?.fallbackChains) {
    return overrides.fallbackChains.find((c) => c.chainId === chainId);
  }
  return findFallbackChain(chainId);
}

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

  if (isConsumerRequirementDesignContractOnly(req.domainApprovalStatus)) {
    const designReason = VsiCapabilityResolverReasonCode.REQUIREMENT_RUNTIME_APPROVAL_ABSENT;
    return {
      evaluations: req.canonicalSignalKeys.map((key) => {
        const signalRow = ctx.signals.find((s) => s.canonicalSignalKey === key);
        const freshnessAtEvaluation = computeSignalFreshnessAtEvaluation({
          lastSourceTimestamp: signalRow?.lastSourceTimestamp ?? null,
          evaluationTimeMs,
        });
        return {
          canonicalSignalKey: key,
          satisfied: false,
          empiricalObservation: signalRow?.empiricalObservation ?? null,
          freshnessAtEvaluation,
          qualityClassification: signalRow?.qualityClassification ?? null,
          confidenceLevel: signalRow?.confidenceLevel ?? null,
          lastSourceTimestamp: signalRow?.lastSourceTimestamp ?? null,
          limitations: signalRow ? [...signalRow.limitations] : [],
          reasonCodes: [designReason],
        };
      }),
      satisfied: false,
      reasons: [designReason],
    };
  }

  if (!isConsumerRequirementRuntimeApproved(req.domainApprovalStatus)) {
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
      if (!isQualifyingEmpiricalObservation(signal.empiricalObservation)) {
        rowReasons.push(empiricalObservationFailureReason(signal.empiricalObservation));
      }
    }

    if (req.minimumEvidence === 'DECLARED_LISTED') {
      if (signal.declaredSupport !== 'LISTED') {
        rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_DECLARED_ONLY);
      }
    }

    const timestampMs = parseSignalTimestampMs(signal.lastSourceTimestamp);
    const timestampValid = isSignalTimestampValidAtEvaluation(
      signal.lastSourceTimestamp,
      evaluationTimeMs,
    );

    if (req.minimumQuality === 'FRESH_AT_EVALUATION') {
      if (!timestampValid || timestampMs == null) {
        rowReasons.push(VsiCapabilityResolverReasonCode.INVALID_SIGNAL_TIMESTAMP);
      } else if (freshnessAtEvaluation !== 'FRESH') {
        rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_STALE_AT_EVALUATION);
      }
    }

    if (req.maxSignalAgeMs != null) {
      if (!timestampValid || timestampMs == null) {
        rowReasons.push(VsiCapabilityResolverReasonCode.INVALID_SIGNAL_TIMESTAMP);
      } else {
        const ageMs = evaluationTimeMs - timestampMs;
        if (ageMs > req.maxSignalAgeMs) {
          rowReasons.push(VsiCapabilityResolverReasonCode.SIGNAL_STALE_AT_EVALUATION);
        }
      }
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
  registryOverrides?: VsiCapabilityResolverRegistryOverrides,
): VsiCapabilityResolverResultV1 {
  const evaluationTimeMs = input.evaluationTime.getTime();
  if (!Number.isFinite(evaluationTimeMs)) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.NOT_ASSESSABLE,
      reasonCodes: [VsiCapabilityResolverReasonCode.INVALID_EVALUATION_TIME],
      limitations: ['INVALID_EVALUATION_TIME'],
    });
  }

  if (input.requirementsVersion !== VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.NOT_ASSESSABLE,
      reasonCodes: [VsiCapabilityResolverReasonCode.REQUIREMENTS_VERSION_MISMATCH],
      limitations: ['REQUIREMENTS_VERSION_UNSUPPORTED'],
    });
  }
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

  if (profile.profileContractVersion !== VSI_PROFILE_CONTRACT_VERSION) {
    return baseResult(input, {
      resolutionStatus: VsiCapabilityResolutionStatus.NOT_ASSESSABLE,
      profile,
      reasonCodes: [VsiCapabilityResolverReasonCode.UNSUPPORTED_PROFILE_CONTRACT_VERSION],
      limitations: [...limitations, 'UNSUPPORTED_PROFILE_CONTRACT_VERSION'],
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

  const requirements = resolveRequirements(input, registryOverrides);

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

    if (
      outcome.reasons.includes(VsiCapabilityResolverReasonCode.REQUIREMENT_RUNTIME_APPROVAL_ABSENT)
    ) {
      missingRequirementIds.push(req.requirementId);
      reasonCodes.push(...outcome.reasons);
      limitations.push('DESIGN_CONTRACT_ONLY_NO_RUNTIME_ELIGIBILITY');
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
        const chain = resolveFallbackChain(req.fallbackChainId, registryOverrides);
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
