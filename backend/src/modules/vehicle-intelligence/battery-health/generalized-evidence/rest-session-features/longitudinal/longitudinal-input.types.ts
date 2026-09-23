import type { REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION } from './longitudinal-input.constants';
import type { RestSessionFeatureInputAnchorResolutionStatus } from '../rest-session-feature-input-snapshot.types';

export type LongitudinalInputInclusionMode = 'DEFAULT' | 'PROVISIONAL' | 'EXCLUDED';

export type LongitudinalInputExclusionReason =
  | 'NO_CANONICAL_ROW'
  | 'SESSION_INVALIDATED'
  | 'SESSION_TRUST_INVALIDATED'
  | 'INPUT_CONTRACT_VERSION_UNRESOLVED';

export type LongitudinalInputPerSessionInspectionStatus = 'NOT_EVALUATED';

export type LongitudinalInputVersionTuple = {
  featureModelVersion: string;
  retentionPolicyVersion: string;
  chargeOpportunityPolicyVersion: string;
  inputContractVersion: string;
};

export type LongitudinalInputSessionContext = {
  anchorAt: string;
  sessionStatus: string;
  endReason: string | null;
  openedAt: string;
  endedAt: string | null;
};

export type LongitudinalInputCanonicalContext = {
  canonicalFeatureRowId: string;
  semanticRevision: number;
  computationPhase: string;
  sessionTrust: string;
  inputDigest: string;
};

export type LongitudinalInputFeatureScalars = {
  shutdownToFirstRestDeltaMv: number | null;
  robustRestSlopeMvPerHour: number | null;
  minimumRestVoltageMv: number | null;
  maximumRestVoltageMv: number | null;
  medianRestVoltageMv: number | null;
  restVoltageVarianceMv2: number | null;
  numberOfValidRestPoints: number;
  maxActualRestAgeMs: number | null;
  maxInterObservationGapMs: number | null;
  observationSpanMs: number | null;
  missingRungCount: number | null;
  chargeOpportunityClass: string;
};

export type LongitudinalInputSnapshotContext = {
  anchorResolutionStatus: RestSessionFeatureInputAnchorResolutionStatus;
  chargeContextCompleteness: string[];
  temperatureC: number | null;
  temperatureSource: string | null;
};

export type LongitudinalInputQuality = {
  inclusionMode: LongitudinalInputInclusionMode;
  exclusionReasons: LongitudinalInputExclusionReason[];
  perSessionInspectionStatus: LongitudinalInputPerSessionInspectionStatus;
};

export type LongitudinalInputSessionInventoryItem = {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  session: LongitudinalInputSessionContext;
  canonical: LongitudinalInputCanonicalContext | null;
  version: LongitudinalInputVersionTuple | null;
  features: LongitudinalInputFeatureScalars | null;
  snapshot: LongitudinalInputSnapshotContext | null;
  quality: LongitudinalInputQuality;
};

export type LongitudinalInputReadRequest = {
  organizationId: string;
  vehicleId: string;
  /** Max sessions to load (hard-capped at DB safety bound). */
  sessionLimit: number;
};

export type LongitudinalInputReadRejectReason = 'SESSION_LIMIT_EXCEEDED';

export type LongitudinalInputReadResultV1 = {
  longitudinalInputContractVersion: typeof REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  dbSafetyMaxSessions: number;
  requestedSessionLimit: number;
  appliedSessionLimit: number;
  sessions: LongitudinalInputSessionInventoryItem[];
};

export type LongitudinalInputReadOutcome =
  | { status: 'OK'; result: LongitudinalInputReadResultV1 }
  | { status: 'REJECTED'; reason: LongitudinalInputReadRejectReason };
