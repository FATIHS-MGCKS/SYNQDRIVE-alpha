import { BatteryRestSessionChargeOpportunityClass } from '@prisma/client';

export type ChargeOpportunityWindowSource = 'CONFIRMED_TRIP' | 'CANDIDATE_TRIP' | 'NONE';

export type ChargeOpportunityTemperatureSource =
  | 'TRIP_EXTERIOR'
  | 'UNKNOWN';

export type ChargeContextCompletenessReason =
  | 'NO_RELIABLE_PRECEDING_TRIP'
  | 'TRIP_NOT_COMPLETED'
  | 'TRIP_START_MISSING'
  | 'TRIP_END_MISSING'
  | 'TRIP_START_AFTER_ANCHOR'
  | 'TRIP_END_ANCHOR_MISMATCH'
  | 'CANDIDATE_TRIP_CONTEXT'
  | 'NO_PROVIDER_QUALIFIED_LV'
  | 'NO_PROVIDER_OBSERVED_STATE'
  | 'STATE_FETCH_TIME_ONLY'
  | 'MISSING_DISTANCE'
  | 'MISSING_TEMPERATURE'
  | 'NO_PRIOR_SESSION_FEATURE'
  | 'FOREIGN_TRIP_OBSERVATIONS_EXCLUDED'
  | 'PARTIAL_CONTEXT';

export type ChargeOpportunityTripSnapshot = {
  id: string;
  vehicleId: string;
  tripStatus: string;
  startTime: Date | null;
  endTime: Date | null;
  distanceKm: number | null;
  outsideTemperatureStartC: number | null;
};

export type ChargeOpportunityRestSessionSnapshot = {
  id: string;
  organizationId: string;
  vehicleId: string;
  anchorAt: Date;
  confirmedTripId: string | null;
  candidateTripId: string | null;
};

export type ChargeOpportunityGeObservationInput = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  evidenceClass: string;
  voltage: number | null;
  voltageObservedAt: Date | null;
  providerTimestampSource: string | null;
  engineRunning: boolean | null;
  stateObservedAt: Date | null;
  stateTimestampSource: string | null;
  stateAlignmentClass: string;
  isLvCharging: boolean | null;
  isHvCharging: boolean | null;
};

export type ResolvedChargeOpportunityWindow = {
  windowSource: ChargeOpportunityWindowSource;
  precedingTripId: string | null;
  precedingTripStartAt: Date | null;
  precedingTripEndAt: Date | null;
  chargeContextStartAt: Date | null;
  chargeContextEndAt: Date;
  tripEndToAnchorDeltaMs: number | null;
  precedingTripDurationMs: number | null;
  precedingTripDistanceKm: number | null;
  outsideTemperatureStartC: number | null;
  completenessReasons: ChargeContextCompletenessReason[];
};

export type ChargeOpportunityRawFeaturesV1 = {
  policyVersion: string;
  windowSource: ChargeOpportunityWindowSource;
  precedingTripId: string | null;
  precedingTripStartAt: string | null;
  precedingTripEndAt: string | null;
  chargeContextStartAt: string | null;
  chargeContextEndAt: string;
  tripEndToAnchorDeltaMs: number | null;
  precedingTripDurationMs: number | null;
  precedingTripDistanceKm: number | null;
  generalizedEvidenceRowsConsidered: number;
  qualifiedLvObservationCount: number;
  alternatorBandLvSampleCount: number;
  engineRunningTrueProviderSnapshotObservationCount: number;
  runningAlternatorAlignedObservationCount: number;
  runningAlternatorPartialObservationCount: number;
  classifierDrivingChargingObservationCount: number;
  foreignTripObservationCount: number;
  stateFetchTimeOnlyObservationCount: number;
  engineRunningObservedCoverageMs: null;
  lvVoltageTimeProxyVms: null;
  lvVoltageTimeProxyCoveredMs: null;
  priorSessionMedianRestVoltageMv: null;
  temperatureC: number | null;
  temperatureSource: ChargeOpportunityTemperatureSource;
  temperatureObservedAt: string | null;
  temperatureAgeMs: number | null;
  temperatureUncertainty: null;
  contextCompleteness: ChargeContextCompletenessReason[];
  chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass;
  chargeContextSourceObservationIds: string[];
  qualifiedLvObservationIds: string[];
  engineRunningProviderSnapshotObservationIds: string[];
  runningAlternatorAlignedObservationIds: string[];
  runningAlternatorPartialObservationIds: string[];
};

export type ChargeOpportunityReadResult =
  | { status: 'SESSION_NOT_FOUND' }
  | { status: 'OK'; features: ChargeOpportunityRawFeaturesV1 };
