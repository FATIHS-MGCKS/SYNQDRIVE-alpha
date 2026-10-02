import { REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION } from '../rest-session-feature.constants';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';

export function buildMinimalLongitudinalInputSummary(input: {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  anchorResolutionStatus?: 'SELECTED' | 'UNAVAILABLE' | 'AMBIGUOUS';
  inputContractVersion?: string;
  contextCompleteness?: string[];
  temperatureC?: number | null;
  temperatureSource?: string;
}): Record<string, unknown> {
  return {
    inputContractVersion:
      input.inputContractVersion ?? REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    restSessionId: input.restSessionId,
    featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
    retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
    chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
    session: {
      anchorType: 'ENGINE_OFF_TRANSITION',
      anchorAt: new Date().toISOString(),
      candidateTripId: null,
      confirmedTripId: null,
      sessionStatus: 'ENDED',
      computationPhase: 'FINAL',
      sessionTrust: 'VALID',
      openedAt: new Date().toISOString(),
      confirmedAt: null,
      endedAt: new Date().toISOString(),
      endReason: 'NATURAL',
    },
    anchorResolution: {
      status: input.anchorResolutionStatus ?? 'SELECTED',
      selectedObservationId: null,
      duplicateEquivalentObservationIds: [],
      conflictingCandidateObservationIds: [],
    },
    anchor: null,
    retentionPoints: [],
    chargeOpportunityRaw: {
      policyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
      restSessionId: input.restSessionId,
      windowSource: 'NONE',
      precedingTripId: null,
      precedingTripStartAt: null,
      precedingTripEndAt: null,
      chargeContextStartAt: null,
      chargeContextEndAt: new Date().toISOString(),
      tripEndToAnchorDeltaMs: null,
      precedingTripDurationMs: null,
      precedingTripDistanceKm: null,
      generalizedEvidenceRowsConsidered: 0,
      qualifiedLvObservationCount: 0,
      alternatorBandLvSampleCount: 0,
      engineRunningTrueProviderSnapshotObservationCount: 0,
      runningAlternatorAlignedObservationCount: 0,
      runningAlternatorPartialObservationCount: 0,
      classifierDrivingChargingObservationCount: 0,
      foreignTripObservationCount: 0,
      stateFetchTimeOnlyObservationCount: 0,
      engineRunningObservedCoverageMs: null,
      lvVoltageTimeProxyVms: null,
      lvVoltageTimeProxyCoveredMs: null,
      priorSessionMedianRestVoltageMv: null,
      temperatureC: input.temperatureC ?? null,
      temperatureSource: input.temperatureSource ?? 'UNKNOWN',
      temperatureObservedAt: null,
      temperatureAgeMs: null,
      temperatureUncertainty: null,
      contextCompleteness: input.contextCompleteness ?? [],
      chargeOpportunityClass: 'UNKNOWN',
      chargeContextSourceObservationIds: [],
      chargeContextSourceMeasurementIds: [],
      qualifiedLvObservationIds: [],
      qualifiedLvSourceMeasurementIds: [],
      engineRunningProviderSnapshotObservationIds: [],
      engineRunningProviderSnapshotSourceMeasurementIds: [],
      runningAlternatorAlignedObservationIds: [],
      runningAlternatorAlignedSourceMeasurementIds: [],
      runningAlternatorPartialObservationIds: [],
      runningAlternatorPartialSourceMeasurementIds: [],
    },
  };
}
