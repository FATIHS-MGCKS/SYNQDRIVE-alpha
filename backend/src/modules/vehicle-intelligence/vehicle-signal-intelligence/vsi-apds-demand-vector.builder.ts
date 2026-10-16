import { VSI_CONSUMER_REQUIREMENTS_V1 } from './vsi-consumer-requirements.registry';
import {
  isConsumerRequirementDesignContractOnly,
  isConsumerRequirementRuntimeApproved,
} from './vsi-consumer-requirements.registry';
import { VsiDomainApprovalStatus } from './vsi-consumer-requirements.types';
import { VSI_PROFILE_MATERIALIZATION_KEYS } from './vsi-profile.types';
import { computeSignalFreshnessAtEvaluation } from './vsi-capability-resolver.freshness';
import { isQualifyingEmpiricalObservation } from './vsi-capability-resolver.empirical';
import {
  VsiApdsDemandClassification,
  type VsiApdsRequirementDemandRowV1,
} from './vsi-apds-p5.types';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';

const MATERIALIZED = new Set<string>(VSI_PROFILE_MATERIALIZATION_KEYS);

const ATTRIBUTION_UNKNOWN = new Set([
  'LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK',
  'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS',
  'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY',
]);

function classifyRequirementDemand(
  req: (typeof VSI_CONSUMER_REQUIREMENTS_V1)[number],
): VsiApdsDemandClassification {
  if (isConsumerRequirementDesignContractOnly(req.domainApprovalStatus)) {
    return VsiApdsDemandClassification.DESIGN_CONTRACT_ONLY;
  }
  if (req.domainApprovalStatus === VsiDomainApprovalStatus.PENDING_DOMAIN_APPROVAL) {
    return VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL;
  }
  if (isConsumerRequirementRuntimeApproved(req.domainApprovalStatus)) {
    return VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT;
  }
  if (req.minimumEvidence === 'DECLARED_LISTED') {
    return VsiApdsDemandClassification.DECLARED_REQUIREMENT;
  }
  return VsiApdsDemandClassification.UNKNOWN_CAPABILITY;
}

function assessRequirementAgainstProfile(
  req: (typeof VSI_CONSUMER_REQUIREMENTS_V1)[number],
  profile: VsiCapabilityResolverProfileContext | null,
  evaluationTimeMs: number,
  attributionUnknown: boolean,
): Pick<VsiApdsRequirementDemandRowV1, 'assessmentStatus' | 'discrepancyReasons'> {
  const reasons: string[] = [];
  if (attributionUnknown) {
    return { assessmentStatus: 'UNKNOWN', discrepancyReasons: ['SOURCE_LINK_ATTRIBUTION_UNKNOWN'] };
  }
  if (!profile) {
    return { assessmentStatus: 'NOT_ASSESSABLE', discrepancyReasons: ['PROFILE_NOT_FOUND'] };
  }
  if (isConsumerRequirementDesignContractOnly(req.domainApprovalStatus)) {
    return {
      assessmentStatus: 'NOT_ASSESSABLE',
      discrepancyReasons: ['DESIGN_CONTRACT_ONLY_NOT_RUNTIME_DEMAND'],
    };
  }
  if (!isConsumerRequirementRuntimeApproved(req.domainApprovalStatus)) {
    return {
      assessmentStatus: 'NOT_ASSESSABLE',
      discrepancyReasons: ['PENDING_DOMAIN_APPROVAL_NOT_EXECUTABLE_DEMAND'],
    };
  }

  let allSatisfied = true;
  for (const key of req.canonicalSignalKeys) {
    if (!MATERIALIZED.has(key)) {
      reasons.push(`UNMATERIALIZED_SIGNAL:${key}`);
      allSatisfied = false;
      continue;
    }
    const row = profile.signals.find((s) => s.canonicalSignalKey === key);
    if (!row) {
      reasons.push(`SIGNAL_ABSENT:${key}`);
      allSatisfied = false;
      continue;
    }
    if (req.minimumEvidence === 'EMPIRICAL_OBSERVED' && !isQualifyingEmpiricalObservation(row.empiricalObservation)) {
      reasons.push(`EMPIRICAL_INSUFFICIENT:${key}`);
      allSatisfied = false;
    }
    if (req.minimumQuality === 'FRESH_AT_EVALUATION') {
      const fresh = computeSignalFreshnessAtEvaluation({
        lastSourceTimestamp: row.lastSourceTimestamp,
        evaluationTimeMs,
      });
      if (fresh !== 'FRESH') {
        reasons.push(`NOT_FRESH_AT_EVALUATION:${key}`);
        allSatisfied = false;
      }
    }
    if (
      req.historicalReliability === 'PER_SIGNAL_CADENCE_PROVEN' &&
      (row.observedCadenceMedianSeconds == null || row.observedSamples == null)
    ) {
      reasons.push(`INSUFFICIENT_HISTORY:${key}`);
      allSatisfied = false;
    }
  }

  if (allSatisfied) {
    return { assessmentStatus: 'SATISFIED', discrepancyReasons: [] };
  }
  if (reasons.some((r) => r.startsWith('INSUFFICIENT_HISTORY'))) {
    return { assessmentStatus: 'INSUFFICIENT', discrepancyReasons: reasons };
  }
  return { assessmentStatus: 'INSUFFICIENT', discrepancyReasons: reasons };
}

export function buildVsiConsumerDemandVectorV1(input: {
  profile: VsiCapabilityResolverProfileContext | null;
  evaluationTimeMs: number;
  profileLimitations?: string[];
}): VsiApdsRequirementDemandRowV1[] {
  const limitations = input.profileLimitations ?? input.profile?.profileLimitations ?? [];
  const attributionUnknown = limitations.some((l) => ATTRIBUTION_UNKNOWN.has(l));

  return VSI_CONSUMER_REQUIREMENTS_V1.map((req) => {
    const demandClassification = classifyRequirementDemand(req);
    const assessment = assessRequirementAgainstProfile(
      req,
      input.profile,
      input.evaluationTimeMs,
      attributionUnknown,
    );
    return {
      requirementId: req.requirementId,
      consumerModule: req.consumerModule,
      featureId: req.featureId,
      canonicalSignalKeys: req.canonicalSignalKeys,
      domainApprovalStatus: req.domainApprovalStatus,
      demandClassification,
      assessmentStatus: assessment.assessmentStatus,
      discrepancyReasons: assessment.discrepancyReasons,
    };
  });
}
