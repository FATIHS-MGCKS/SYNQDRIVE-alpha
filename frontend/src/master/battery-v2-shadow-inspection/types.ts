export type RestSessionFeatureShadowInspectionOverallStatus =
  | 'OK'
  | 'NO_FEATURE_ROWS'
  | 'INTEGRITY_WARNING'
  | 'INTEGRITY_PARTIAL';

export type RestSessionFeatureShadowInspectionV1 = {
  inspectionContractVersion: string;
  versionTuple: Record<string, string>;
  session: {
    id: string;
    organizationId: string;
    vehicleId: string;
    anchorType: string;
    anchorAt: string;
    sessionStatus: string;
    candidateTripId: string | null;
    confirmedTripId: string | null;
    openedAt: string;
    confirmedAt: string | null;
    endedAt: string | null;
    endReason: string | null;
    restObservationCount: number;
    validRestObservationCount: number;
  };
  featureSummary: {
    totalRows: number;
    latestSemanticRevision: number | null;
    incrementalRows: number;
    finalRows: number;
    validRows: number;
    invalidatedRows: number;
    canonicalFeatureRowId: string | null;
    canonicalSemanticRevision: number | null;
    revisionsTruncated: boolean;
  };
  canonicalFeature: RestSessionFeatureShadowInspectionRevisionV1 | null;
  revisions: RestSessionFeatureShadowInspectionRevisionV1[];
  integrity: {
    digestMismatchCount: number;
    digestRowsChecked: number;
    digestRowsUnchecked: number;
    digestVerificationScope: string;
    semanticRevisionGapCount: number;
    duplicateSemanticRevisionCount: number;
    canonicalSelectionStatus: string;
    countAggregateConsistent: boolean;
    overallStatus: RestSessionFeatureShadowInspectionOverallStatus;
  };
};

export type RestSessionFeatureShadowInspectionRevisionV1 = {
  id: string;
  semanticRevision: number;
  inputDigest: string;
  computationPhase: string;
  sessionTrust: string;
  chargeOpportunityClass: string;
  numberOfValidRestPoints: number;
  shutdownToFirstRestDeltaMv: number | null;
  robustRestSlopeMvPerHour: number | null;
  minimumRestVoltageMv: number | null;
  maximumRestVoltageMv: number | null;
  medianRestVoltageMv: number | null;
  restVoltageVarianceMv2: number | null;
  maxActualRestAgeMs: number | null;
  maxInterObservationGapMs: number | null;
  observationSpanMs: number | null;
  missingRungCount: number | null;
  computedAt: string;
  digestValid: boolean;
  inputSummary?: unknown;
  chargeOpportunityRaw?: unknown;
  pairwiseRestDeltas?: unknown;
};

export type BatteryV2RestSessionListItemV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  sessionStatus: string;
  anchorType: string;
  anchorAt: string;
  openedAt: string;
  endedAt: string | null;
  endReason: string | null;
  restObservationCount: number;
  validRestObservationCount: number;
};

export function formatMillivolts(mv: number | null | undefined): string {
  if (mv == null || Number.isNaN(mv)) return '—';
  return `${(mv / 1000).toFixed(3)} V`;
}

export function formatSlope(mvPerHour: number | null | undefined): string {
  if (mvPerHour == null || Number.isNaN(mvPerHour)) return '—';
  return `${mvPerHour.toFixed(1)} mV/h`;
}

export function retentionPointsFromInputSummary(inputSummary: unknown): unknown[] {
  if (!inputSummary || typeof inputSummary !== 'object') return [];
  const points = (inputSummary as { eligibleRetentionPoints?: unknown }).eligibleRetentionPoints;
  return Array.isArray(points) ? points : [];
}
