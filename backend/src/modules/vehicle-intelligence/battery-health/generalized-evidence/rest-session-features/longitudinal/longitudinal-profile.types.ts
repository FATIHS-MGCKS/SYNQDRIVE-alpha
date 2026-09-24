import type {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import type {
  LongitudinalInputCanonicalContext,
  LongitudinalInputExclusionReason,
  LongitudinalInputFeatureScalars,
  LongitudinalInputReadResultV1,
  LongitudinalInputSessionContext,
  LongitudinalInputSnapshotContext,
  LongitudinalInputVersionTuple,
} from './longitudinal-input.types';

/** Emitted by D2 V1 assembler only. */
export type LongitudinalProfileStatusV1 = 'OK' | 'NO_ELIGIBLE_SESSIONS';

export type LongitudinalProfileFlagV1 =
  | 'VERSION_SEGMENTED'
  | 'INPUT_CONTRACT_UNRESOLVED_PRESENT'
  | 'PROVISIONAL_SESSIONS_PRESENT';

export type LongitudinalProfileAssemblyRejectReason =
  | 'UNSUPPORTED_D1_CONTRACT'
  | 'IDENTITY_MISMATCH'
  | 'DUPLICATE_REST_SESSION'
  | 'INVALID_WINDOW_METADATA'
  | 'INCONSISTENT_DEFAULT_ITEM'
  | 'INCONSISTENT_PROVISIONAL_ITEM';

export type LongitudinalProfileVersionTupleV1 = {
  featureModelVersion: string;
  retentionPolicyVersion: string;
  chargeOpportunityPolicyVersion: string;
  inputContractVersion: string;
};

export type LongitudinalProfileObservationV1 = {
  restSessionId: string;
  anchorAt: string;
  sessionStatus: string;
  endReason: string | null;
  canonical: LongitudinalInputCanonicalContext;
  versionTuple: LongitudinalProfileVersionTupleV1;
  features: LongitudinalInputFeatureScalars;
  anchorResolutionStatus: LongitudinalInputSnapshotContext['anchorResolutionStatus'];
  perSessionInspectionStatus: 'NOT_EVALUATED';
  chargeContextCompleteness: string[];
  temperatureC: number | null;
  temperatureSource: string | null;
};

export type LongitudinalProfileExcludedSessionV1 = {
  restSessionId: string;
  anchorAt: string;
  sessionStatus: string;
  endReason: string | null;
  exclusionReasons: LongitudinalInputExclusionReason[];
  canonical: LongitudinalInputCanonicalContext | null;
  version: LongitudinalInputVersionTuple | null;
  inputDigest: string | null;
};

export type LongitudinalProfileVersionSegmentV1 = {
  segmentIndex: number;
  versionTuple: LongitudinalProfileVersionTupleV1;
  sessionCount: number;
  firstAnchorAt: string;
  lastAnchorAt: string;
};

export type LongitudinalProfileCoverageV1 = {
  candidateRestSessionCount: number;
  includedSessionCount: number;
  provisionalSessionCount: number;
  excludedSessionCount: number;
  excludedByReason: Partial<Record<LongitudinalInputExclusionReason, number>>;
  validEvidenceSpanMs: number | null;
};

export type LongitudinalProfileTrendReadinessV1 = {
  trendReadiness: 'NOT_EVALUATED';
  minimumSessionsForDescriptiveTrend: null;
  meetsMinimum: null;
};

export type LongitudinalProfileStatusReasonsV1 = {
  stableDefaultCount: number;
  provisionalCount: number;
  excludedCount: number;
  versionSegmentCount: number;
  excludedByReason: Partial<Record<LongitudinalInputExclusionReason, number>>;
};

export type LongitudinalProfileWindowV1 = {
  requestedSessionLimit: number;
  appliedSessionLimit: number;
  firstIncludedAnchorAt: string | null;
  lastIncludedAnchorAt: string | null;
  profileGeneratedAt: string;
};

export type LongitudinalProfileV1 = {
  longitudinalProfileContractVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION;
  profilePolicyVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION;
  organizationId: string;
  vehicleId: string;
  window: LongitudinalProfileWindowV1;
  coverage: LongitudinalProfileCoverageV1;
  profileStatus: LongitudinalProfileStatusV1;
  profileFlags: LongitudinalProfileFlagV1[];
  statusReasons: LongitudinalProfileStatusReasonsV1;
  trendReadiness: LongitudinalProfileTrendReadinessV1;
  observations: LongitudinalProfileObservationV1[];
  provisionalObservations: LongitudinalProfileObservationV1[];
  excludedSessions: LongitudinalProfileExcludedSessionV1[];
  versionSegments: LongitudinalProfileVersionSegmentV1[];
  derived: null;
};

export type LongitudinalProfileAssemblyInput = {
  inventory: LongitudinalInputReadResultV1;
  profileGeneratedAt: string;
};

export type LongitudinalProfileAssemblyOutcome =
  | { status: 'OK'; profile: LongitudinalProfileV1 }
  | { status: 'REJECTED'; reason: LongitudinalProfileAssemblyRejectReason };
