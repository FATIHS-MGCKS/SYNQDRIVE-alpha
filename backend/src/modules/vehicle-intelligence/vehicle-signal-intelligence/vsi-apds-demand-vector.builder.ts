import { VSI_CONSUMER_REQUIREMENTS_V1 } from './vsi-consumer-requirements.registry';
import {
  isConsumerRequirementDesignContractOnly,
  isConsumerRequirementRuntimeApproved,
} from './vsi-consumer-requirements.registry';
import { evaluateVsiConsumerRequirement } from './vsi-capability-resolver.engine';
import { VsiCapabilityResolverReasonCode } from './vsi-capability-resolver.types';
import { VsiDomainApprovalStatus } from './vsi-consumer-requirements.types';
import {
  VsiApdsDemandClassification,
  type VsiApdsRequirementDemandRowV1,
} from './vsi-apds-p5.types';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION, VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';

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

function mapP4OutcomeToP5Assessment(input: {
  satisfied: boolean;
  reasons: VsiCapabilityResolverReasonCode[];
}): Pick<VsiApdsRequirementDemandRowV1, 'assessmentStatus' | 'discrepancyReasons'> {
  if (
    input.reasons.includes(VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL) ||
    input.reasons.includes(VsiCapabilityResolverReasonCode.REQUIREMENT_RUNTIME_APPROVAL_ABSENT)
  ) {
    return {
      assessmentStatus: 'NOT_ASSESSABLE',
      discrepancyReasons: input.reasons.map(String),
    };
  }
  if (input.satisfied) {
    return { assessmentStatus: 'SATISFIED', discrepancyReasons: [] };
  }
  if (
    input.reasons.includes(VsiCapabilityResolverReasonCode.HISTORICAL_RELIABILITY_UNAVAILABLE) ||
    input.reasons.some((r) => r === VsiCapabilityResolverReasonCode.EMPIRICAL_OBSERVATION_INSUFFICIENT)
  ) {
    return { assessmentStatus: 'INSUFFICIENT', discrepancyReasons: input.reasons.map(String) };
  }
  return { assessmentStatus: 'INSUFFICIENT', discrepancyReasons: input.reasons.map(String) };
}

export function buildVsiConsumerDemandVectorV1(input: {
  profile: VsiCapabilityResolverProfileContext | null;
  evaluationTimeMs: number;
  profileLimitations?: string[];
  attributionUnknown: boolean;
  failClosed: boolean;
  decisionTimeRetrospectiveAssessable: boolean;
  requirements?: readonly (typeof VSI_CONSUMER_REQUIREMENTS_V1)[number][];
}): VsiApdsRequirementDemandRowV1[] {
  const limitations = input.profileLimitations ?? input.profile?.profileLimitations ?? [];
  const attributionBlocked =
    input.attributionUnknown || limitations.some((l) => ATTRIBUTION_UNKNOWN.has(l));
  const requirements = input.requirements ?? VSI_CONSUMER_REQUIREMENTS_V1;

  return requirements.map((req) => {
    const demandClassification = classifyRequirementDemand(req);
    if (input.failClosed) {
      return {
        requirementId: req.requirementId,
        consumerModule: req.consumerModule,
        featureId: req.featureId,
        canonicalSignalKeys: req.canonicalSignalKeys,
        domainApprovalStatus: req.domainApprovalStatus,
        demandClassification,
        assessmentStatus: 'UNKNOWN',
        discrepancyReasons: ['FAIL_CLOSED_DATA_PROTECTION'],
      };
    }
    if (attributionBlocked) {
      return {
        requirementId: req.requirementId,
        consumerModule: req.consumerModule,
        featureId: req.featureId,
        canonicalSignalKeys: req.canonicalSignalKeys,
        domainApprovalStatus: req.domainApprovalStatus,
        demandClassification,
        assessmentStatus: 'UNKNOWN',
        discrepancyReasons: ['SOURCE_LINK_ATTRIBUTION_UNKNOWN'],
      };
    }
    if (!input.profile) {
      return {
        requirementId: req.requirementId,
        consumerModule: req.consumerModule,
        featureId: req.featureId,
        canonicalSignalKeys: req.canonicalSignalKeys,
        domainApprovalStatus: req.domainApprovalStatus,
        demandClassification,
        assessmentStatus: 'NOT_ASSESSABLE',
        discrepancyReasons: ['PROFILE_NOT_FOUND'],
      };
    }
    if (input.profile.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1) {
      return {
        requirementId: req.requirementId,
        consumerModule: req.consumerModule,
        featureId: req.featureId,
        canonicalSignalKeys: req.canonicalSignalKeys,
        domainApprovalStatus: req.domainApprovalStatus,
        demandClassification,
        assessmentStatus: 'NOT_ASSESSABLE',
        discrepancyReasons: ['LEGACY_PROFILE_V1'],
      };
    }
    if (input.profile.profileContractVersion !== VSI_PROFILE_CONTRACT_VERSION) {
      return {
        requirementId: req.requirementId,
        consumerModule: req.consumerModule,
        featureId: req.featureId,
        canonicalSignalKeys: req.canonicalSignalKeys,
        domainApprovalStatus: req.domainApprovalStatus,
        demandClassification,
        assessmentStatus: 'NOT_ASSESSABLE',
        discrepancyReasons: ['UNSUPPORTED_PROFILE_CONTRACT_VERSION'],
      };
    }
    if (!input.decisionTimeRetrospectiveAssessable) {
      const baseReason =
        demandClassification === VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL ||
        demandClassification === VsiApdsDemandClassification.DESIGN_CONTRACT_ONLY
          ? []
          : ['DECISION_TIME_PROFILE_EVIDENCE_NOT_VERIFIED'];
      return {
        requirementId: req.requirementId,
        consumerModule: req.consumerModule,
        featureId: req.featureId,
        canonicalSignalKeys: req.canonicalSignalKeys,
        domainApprovalStatus: req.domainApprovalStatus,
        demandClassification,
        assessmentStatus: 'NOT_ASSESSABLE',
        discrepancyReasons:
          baseReason.length > 0
            ? baseReason
            : mapP4OutcomeToP5Assessment({
                satisfied: false,
                reasons: [VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL],
              }).discrepancyReasons,
      };
    }

    const outcome = evaluateVsiConsumerRequirement(req, input.profile, input.evaluationTimeMs);
    const assessment = mapP4OutcomeToP5Assessment(outcome);
    if (
      assessment.assessmentStatus === 'SATISFIED' &&
      !isConsumerRequirementRuntimeApproved(req.domainApprovalStatus)
    ) {
      return {
        requirementId: req.requirementId,
        consumerModule: req.consumerModule,
        featureId: req.featureId,
        canonicalSignalKeys: req.canonicalSignalKeys,
        domainApprovalStatus: req.domainApprovalStatus,
        demandClassification,
        assessmentStatus: 'NOT_ASSESSABLE',
        discrepancyReasons: ['RUNTIME_APPROVAL_ABSENT'],
      };
    }
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
