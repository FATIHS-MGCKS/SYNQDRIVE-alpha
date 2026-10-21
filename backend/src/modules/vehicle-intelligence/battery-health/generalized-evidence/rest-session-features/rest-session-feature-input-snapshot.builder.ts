import type { ChargeOpportunityRawFeaturesV1 } from './charge-opportunity.types';
import type {
  RestSessionFeatureInputRetentionPointV1,
  RestSessionFeatureInputSnapshotV1,
  RestSessionFeatureInputAnchorResolutionV1,
} from './rest-session-feature-input-snapshot.types';
import { FEATURE_INPUT_VERSION_TUPLE } from './rest-session-feature-input-snapshot.types';
import type { RestSessionRetentionEligiblePoint } from './rest-session-retention.types';
import type { RestSessionFeatureInputSessionV1 } from './rest-session-feature-input-snapshot.types';
import type { RestSessionFeatureInputAnchorV1 } from './rest-session-feature-input-snapshot.types';

export function dateToUtcIsoString(date: Date): string {
  return date.toISOString();
}

export function buildRestSessionFeatureInputSnapshotV1(input: {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  session: RestSessionFeatureInputSessionV1;
  anchorResolution: RestSessionFeatureInputAnchorResolutionV1;
  anchor: RestSessionFeatureInputAnchorV1 | null;
  eligibleRetentionPoints: RestSessionRetentionEligiblePoint[];
  retentionMetadataByObservationId: Map<
    string,
    Pick<
      RestSessionFeatureInputRetentionPointV1,
      | 'sourceMeasurementId'
      | 'evidenceClass'
      | 'evidenceConfidence'
      | 'stateAlignmentClass'
      | 'providerObservationAt'
      | 'nominalRestIntervalIndex'
    >
  >;
  chargeOpportunityRaw: ChargeOpportunityRawFeaturesV1;
}): RestSessionFeatureInputSnapshotV1 {
  if (input.chargeOpportunityRaw.restSessionId !== input.restSessionId) {
    throw new Error('chargeOpportunityRaw.restSessionId mismatch');
  }

  const retentionPoints: RestSessionFeatureInputRetentionPointV1[] =
    input.eligibleRetentionPoints.map((point) => {
      const meta = input.retentionMetadataByObservationId.get(point.observationId);
      if (!meta) {
        throw new Error(`Missing retention metadata for observation ${point.observationId}`);
      }
      return {
        observationId: point.observationId,
        sourceMeasurementId: meta.sourceMeasurementId,
        evidenceClass: meta.evidenceClass,
        evidenceConfidence: meta.evidenceConfidence,
        stateAlignmentClass: meta.stateAlignmentClass,
        actualRestAgeMs: point.actualRestAgeMs,
        voltageMv: point.voltageMv,
        providerObservationAt: meta.providerObservationAt,
        nominalRestIntervalIndex: meta.nominalRestIntervalIndex,
      };
    });

  return {
    inputContractVersion: FEATURE_INPUT_VERSION_TUPLE.inputContractVersion,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    restSessionId: input.restSessionId,
    featureModelVersion: FEATURE_INPUT_VERSION_TUPLE.featureModelVersion,
    retentionPolicyVersion: FEATURE_INPUT_VERSION_TUPLE.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: FEATURE_INPUT_VERSION_TUPLE.chargeOpportunityPolicyVersion,
    session: input.session,
    anchorResolution: input.anchorResolution,
    anchor: input.anchor,
    retentionPoints,
    chargeOpportunityRaw: input.chargeOpportunityRaw,
  };
}

export function buildRestSessionFeatureInputSessionV1(input: {
  anchorType: string;
  anchorAt: Date;
  candidateTripId: string | null;
  confirmedTripId: string | null;
  sessionStatus: string;
  computationPhase: 'INCREMENTAL' | 'FINAL';
  sessionTrust: 'VALID' | 'INVALIDATED';
  openedAt: Date;
  confirmedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
}): RestSessionFeatureInputSessionV1 {
  return {
    anchorType: input.anchorType,
    anchorAt: dateToUtcIsoString(input.anchorAt),
    candidateTripId: input.candidateTripId,
    confirmedTripId: input.confirmedTripId,
    sessionStatus: input.sessionStatus,
    computationPhase: input.computationPhase,
    sessionTrust: input.sessionTrust,
    openedAt: dateToUtcIsoString(input.openedAt),
    confirmedAt: input.confirmedAt ? dateToUtcIsoString(input.confirmedAt) : null,
    endedAt: input.endedAt ? dateToUtcIsoString(input.endedAt) : null,
    endReason: input.endReason,
  };
}
