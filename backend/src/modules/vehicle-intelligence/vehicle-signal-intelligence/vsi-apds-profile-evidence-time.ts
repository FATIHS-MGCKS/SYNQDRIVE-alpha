import { parseSignalTimestampMs } from './vsi-capability-resolver.freshness';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';

export const VsiApdsProfileEvidenceInterpretation = {
  VERIFIED_DECISION_TIME_SNAPSHOT: 'VERIFIED_DECISION_TIME_SNAPSHOT',
  CURRENT_PROFILE_REVIEW: 'CURRENT_PROFILE_REVIEW',
  HISTORICAL_PROFILE_UNAVAILABLE: 'HISTORICAL_PROFILE_UNAVAILABLE',
} as const;

export type VsiApdsProfileEvidenceInterpretation =
  (typeof VsiApdsProfileEvidenceInterpretation)[keyof typeof VsiApdsProfileEvidenceInterpretation];

export type VsiApdsProfileTemporalAuthorityV1 = {
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  profileRevision: number;
};

export function classifyVsiApdsProfileEvidenceInterpretation(input: {
  profile: VsiCapabilityResolverProfileContext | null;
  temporal: VsiApdsProfileTemporalAuthorityV1 | null;
  shadowDecisionAt: Date;
}): {
  interpretation: VsiApdsProfileEvidenceInterpretation;
  limitations: string[];
  decisionTimeRetrospectiveAssessable: boolean;
} {
  const limitations: string[] = [];
  const decisionMs = input.shadowDecisionAt.getTime();
  if (!Number.isFinite(decisionMs)) {
    return {
      interpretation: VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
      limitations: ['INVALID_SHADOW_DECISION_TIMESTAMP'],
      decisionTimeRetrospectiveAssessable: false,
    };
  }
  if (input.shadowDecisionAt.getTime() > Date.now() + 60_000) {
    return {
      interpretation: VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
      limitations: ['SHADOW_DECISION_TIMESTAMP_IN_FUTURE'],
      decisionTimeRetrospectiveAssessable: false,
    };
  }

  if (!input.profile || !input.temporal) {
    return {
      interpretation: VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
      limitations: ['PROFILE_NOT_FOUND'],
      decisionTimeRetrospectiveAssessable: false,
    };
  }

  const { evaluatedAt, createdAt, updatedAt } = input.temporal;
  const evaluatedMs = evaluatedAt.getTime();
  const createdMs = createdAt.getTime();
  const updatedMs = updatedAt.getTime();

  if (input.profile.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1) {
    limitations.push('LEGACY_PROFILE_V1');
  }

  let futureSignalEvidence = false;
  for (const signal of input.profile.signals) {
    const ts = parseSignalTimestampMs(signal.lastSourceTimestamp);
    if (ts != null && ts > decisionMs) {
      futureSignalEvidence = true;
      limitations.push(`SIGNAL_EVIDENCE_AFTER_DECISION:${signal.canonicalSignalKey}`);
    }
  }

  const rowMutatedAfterDecision = updatedMs > decisionMs;
  const materializedAfterDecision = evaluatedMs > decisionMs;
  const profileCreatedAfterDecision = createdMs > decisionMs;

  if (
    profileCreatedAfterDecision ||
    materializedAfterDecision ||
    rowMutatedAfterDecision ||
    futureSignalEvidence
  ) {
    limitations.push('CURRENT_SNAPSHOT_NOT_DECISION_TIME_AUTHORITATIVE');
    if (profileCreatedAfterDecision) {
      limitations.push('PROFILE_CREATED_AFTER_SHADOW_DECISION');
    }
    if (materializedAfterDecision) {
      limitations.push('PROFILE_EVALUATED_AFTER_SHADOW_DECISION');
    }
    if (rowMutatedAfterDecision) {
      limitations.push('PROFILE_ROW_UPDATED_AFTER_SHADOW_DECISION');
    }
    return {
      interpretation: VsiApdsProfileEvidenceInterpretation.CURRENT_PROFILE_REVIEW,
      limitations,
      decisionTimeRetrospectiveAssessable: false,
    };
  }

  if (input.profile.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1) {
    return {
      interpretation: VsiApdsProfileEvidenceInterpretation.CURRENT_PROFILE_REVIEW,
      limitations,
      decisionTimeRetrospectiveAssessable: false,
    };
  }

  return {
    interpretation: VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT,
    limitations,
    decisionTimeRetrospectiveAssessable: true,
  };
}
