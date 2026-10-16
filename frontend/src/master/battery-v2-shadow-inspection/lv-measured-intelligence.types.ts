export type LvMeasuredOperationalContext = 'DRIVING' | 'CHARGING' | 'REST' | 'UNKNOWN';

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
  longitudinalD4: {
    epistemicBand: string;
    latestRevisionId: string | null;
    latestRevisionCreatedAt: string | null;
    revisionCountBounded: number;
    sourceEvidenceAckCountOnLatest: number | null;
    note: string;
  };
  provenance: {
    openProviderObservabilityGapCount: number;
    deduplicationPolicy: string;
    historicalObservationsTruncated: boolean;
    featureRowsTruncated: boolean;
  };
};
