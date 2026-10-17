import type { LvMeasuredEpistemicBand, LvMeasuredOperationalContext } from './lv-measured-intelligence-context.policy';

export type LvMeasuredHistoricalQueryModeV1 = 'RECENT_DESC_LIMIT' | 'DATE_RANGE_ASC';

export type LvMeasuredIntelligenceReadInput = {
  organizationId: string;
  vehicleId: string;
  sessionLimit?: number;
  observationLimit?: number;
  measuredFrom?: Date;
  measuredTo?: Date;
};

export type LvMeasuredVoltagePointV1 = {
  epistemicBand: 'MEASURED';
  observationId: string;
  sourceMeasurementId: string;
  voltageV: number;
  voltageObservedAt: string;
  providerObservationAt: string | null;
  providerTimestampSource: string | null;
  operationalContext: LvMeasuredOperationalContext;
  evidenceClass: string;
  restSessionId: string | null;
  actualRestAgeHours: number | null;
  nominalLadderLabel: string | null;
  isLvCharging: boolean | null;
  engineRunning: boolean | null;
};

export type LvMeasuredSlopeInterpretabilityV1 = 'REST_SELF_DISCHARGE_TREND' | 'CONTEXT_LIMITED';

export type LvMeasuredSessionDerivedFeaturesV1 = {
  epistemicBand: 'DERIVED';
  canonicalFeatureRowId: string | null;
  semanticRevision: number | null;
  computationPhase: string | null;
  sessionTrust: string | null;
  minimumRestVoltageMv: number | null;
  maximumRestVoltageMv: number | null;
  medianRestVoltageMv: number | null;
  robustRestSlopeMvPerHour: number | null;
  slopeInterpretability: LvMeasuredSlopeInterpretabilityV1;
  slopeLimitationCodes: string[];
  numberOfValidRestPoints: number | null;
  missingRungCount: number | null;
  observationSpanMs: number | null;
  retentionPointCount: number;
};

export type LvMeasuredRestSessionEpisodeV1 = {
  restSessionId: string;
  sessionStatus: string;
  anchorType: string;
  anchorAt: string;
  openedAt: string;
  endedAt: string | null;
  endReason: string | null;
  restObservationCount: number;
  validRestObservationCount: number;
  measuredPoints: LvMeasuredVoltagePointV1[];
  derivedFeatures: LvMeasuredSessionDerivedFeaturesV1 | null;
  contextLimitedReason: string | null;
};

export type LvMeasuredIntelligenceProvenanceV1 = {
  openProviderObservabilityGapCount: number;
  deduplicationPolicy: 'ONE_ROW_PER_SOURCE_MEASUREMENT_ID';
  historicalQueryMode: LvMeasuredHistoricalQueryModeV1;
  historicalMeasuredFrom: string | null;
  historicalMeasuredTo: string | null;
  historicalObservationsTruncated: boolean;
  featureRowsTruncated: boolean;
};

export type LvMeasuredLongitudinalD4SummaryV1 = {
  epistemicBand: LvMeasuredEpistemicBand;
  latestRevisionId: string | null;
  latestRevisionCreatedAt: string | null;
  revisionCountBounded: number;
  sourceEvidenceAckCountOnLatest: number | null;
  note: string;
};

export type LvMeasuredIntelligenceV1 = {
  readModelContractVersion: 'LV_MEASURED_INTELLIGENCE_V1';
  organizationId: string;
  vehicleId: string;
  scientificBoundary: {
    batteryHealthAssessment: 'NOT_ASSESSED';
    customerPublication: 'OFF';
    e3Runtime: 'INACTIVE';
    f6Calibration: 'OFF';
    noSohPercent: true;
    noGoodBadClassification: true;
  };
  latestMeasured: LvMeasuredVoltagePointV1 | null;
  historicalMeasured: LvMeasuredVoltagePointV1[];
  restSessionEpisodes: LvMeasuredRestSessionEpisodeV1[];
  longitudinalD4: LvMeasuredLongitudinalD4SummaryV1;
  provenance: LvMeasuredIntelligenceProvenanceV1;
};
