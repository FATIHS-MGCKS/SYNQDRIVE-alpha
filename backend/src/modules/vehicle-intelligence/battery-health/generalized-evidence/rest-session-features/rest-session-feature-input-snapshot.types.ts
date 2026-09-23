import type { ChargeOpportunityRawFeaturesV1 } from './charge-opportunity.types';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from './rest-session-feature.constants';
import type { CanonicalRestSessionRetentionAnchorResult } from './rest-session-retention-anchor.policy';
import { sortUtf16CodeUnitLexicographic } from './feature-input-canonical.serializer';

export type RestSessionFeatureInputAnchorResolutionStatus =
  | 'SELECTED'
  | 'UNAVAILABLE'
  | 'AMBIGUOUS';

export type RestSessionFeatureInputAnchorResolutionV1 = {
  status: RestSessionFeatureInputAnchorResolutionStatus;
  selectedObservationId: string | null;
  duplicateEquivalentObservationIds: string[];
  conflictingCandidateObservationIds: string[];
};

export type RestSessionFeatureInputSessionV1 = {
  anchorType: string;
  anchorAt: string;
  candidateTripId: string | null;
  confirmedTripId: string | null;
  sessionStatus: string;
  computationPhase: 'INCREMENTAL' | 'FINAL';
  sessionTrust: 'VALID' | 'INVALIDATED';
  openedAt: string;
  confirmedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
};

export type RestSessionFeatureInputAnchorV1 = {
  observationId: string;
  sourceMeasurementId: string;
  evidenceClass: string;
  evidenceConfidence: string;
  actualRestAgeMs: number;
  voltageMv: number;
  voltageObservedAt: string;
  providerTimestampSource: string;
};

export type RestSessionFeatureInputRetentionPointV1 = {
  observationId: string;
  sourceMeasurementId: string;
  evidenceClass: string;
  evidenceConfidence: string;
  stateAlignmentClass: string;
  actualRestAgeMs: number;
  voltageMv: number;
  providerObservationAt: string | null;
  nominalRestIntervalIndex: number | null;
};

export type RestSessionFeatureInputSnapshotV1 = {
  inputContractVersion: typeof REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  featureModelVersion: typeof REST_SESSION_FEATURE_MODEL_VERSION;
  retentionPolicyVersion: typeof REST_SESSION_RETENTION_POLICY_VERSION;
  chargeOpportunityPolicyVersion: typeof REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION;
  session: RestSessionFeatureInputSessionV1;
  anchorResolution: RestSessionFeatureInputAnchorResolutionV1;
  anchor: RestSessionFeatureInputAnchorV1 | null;
  retentionPoints: RestSessionFeatureInputRetentionPointV1[];
  chargeOpportunityRaw: ChargeOpportunityRawFeaturesV1;
};

export const FEATURE_INPUT_VERSION_TUPLE = {
  featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
  retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
  chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  inputContractVersion: REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
} as const;

export function buildRestSessionFeatureInputAnchorResolutionV1(
  resolution: CanonicalRestSessionRetentionAnchorResult,
): RestSessionFeatureInputAnchorResolutionV1 {
  if (resolution.status === 'UNAVAILABLE') {
    return {
      status: 'UNAVAILABLE',
      selectedObservationId: null,
      duplicateEquivalentObservationIds: [],
      conflictingCandidateObservationIds: [],
    };
  }
  if (resolution.status === 'AMBIGUOUS') {
    return {
      status: 'AMBIGUOUS',
      selectedObservationId: null,
      duplicateEquivalentObservationIds: [],
      conflictingCandidateObservationIds: sortUtf16CodeUnitLexicographic(
        resolution.conflictingCandidateObservationIds,
      ),
    };
  }
  return {
    status: 'SELECTED',
    selectedObservationId: resolution.snapshotAnchor.observationId,
    duplicateEquivalentObservationIds: sortUtf16CodeUnitLexicographic(
      resolution.duplicateEquivalentObservationIds,
    ),
    conflictingCandidateObservationIds: [],
  };
}
