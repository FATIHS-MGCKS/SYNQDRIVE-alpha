import type { BatteryRestSessionFeature } from '@prisma/client';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_FEATURE_SHADOW_INSPECTION_CONTRACT_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from './rest-session-feature.constants';

export type RestSessionFeatureShadowInspectionOverallStatus =
  | 'OK'
  | 'NO_FEATURE_ROWS'
  | 'INTEGRITY_WARNING'
  | 'INTEGRITY_PARTIAL';

export type RestSessionFeatureShadowDigestVerificationScope =
  | 'FULL'
  | 'BOUNDED_LATEST_WINDOW';

export type RestSessionFeatureShadowCanonicalSelectionStatus =
  | 'NO_FEATURE_ROWS'
  | 'CANONICAL_SELECTED'
  | 'CANONICAL_NOT_RESOLVABLE';

export type RestSessionFeatureShadowInspectionInput = {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  includeRaw?: boolean;
};

export type RestSessionFeatureShadowInspectionOutcome =
  | { status: 'SESSION_NOT_FOUND' }
  | { status: 'OK'; inspection: RestSessionFeatureShadowInspectionV1 };

export type RestSessionFeatureShadowInspectionV1 = {
  inspectionContractVersion: typeof REST_SESSION_FEATURE_SHADOW_INSPECTION_CONTRACT_VERSION;
  versionTuple: {
    featureModelVersion: typeof REST_SESSION_FEATURE_MODEL_VERSION;
    retentionPolicyVersion: typeof REST_SESSION_RETENTION_POLICY_VERSION;
    chargeOpportunityPolicyVersion: typeof REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION;
    inputContractVersion: typeof REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION;
  };
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
    digestVerificationScope: RestSessionFeatureShadowDigestVerificationScope;
    semanticRevisionGapCount: number;
    duplicateSemanticRevisionCount: number;
    canonicalSelectionStatus: RestSessionFeatureShadowCanonicalSelectionStatus;
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

export function mapFeatureRowToInspectionRevision(
  row: BatteryRestSessionFeature,
  digestValid: boolean,
  includeRaw: boolean,
): RestSessionFeatureShadowInspectionRevisionV1 {
  return {
    id: row.id,
    semanticRevision: row.semanticRevision,
    inputDigest: row.inputDigest,
    computationPhase: row.computationPhase,
    sessionTrust: row.sessionTrust,
    chargeOpportunityClass: row.chargeOpportunityClass,
    numberOfValidRestPoints: row.numberOfValidRestPoints,
    shutdownToFirstRestDeltaMv: row.shutdownToFirstRestDeltaMv,
    robustRestSlopeMvPerHour: row.robustRestSlopeMvPerHour,
    minimumRestVoltageMv: row.minimumRestVoltageMv,
    maximumRestVoltageMv: row.maximumRestVoltageMv,
    medianRestVoltageMv: row.medianRestVoltageMv,
    restVoltageVarianceMv2: row.restVoltageVarianceMv2,
    maxActualRestAgeMs: row.maxActualRestAgeMs,
    maxInterObservationGapMs: row.maxInterObservationGapMs,
    observationSpanMs: row.observationSpanMs,
    missingRungCount: row.missingRungCount,
    computedAt: row.computedAt.toISOString(),
    digestValid,
    ...(includeRaw
      ? {
          inputSummary: row.inputSummary,
          chargeOpportunityRaw: row.chargeOpportunityRaw,
          pairwiseRestDeltas: row.pairwiseRestDeltas,
        }
      : {}),
  };
}
