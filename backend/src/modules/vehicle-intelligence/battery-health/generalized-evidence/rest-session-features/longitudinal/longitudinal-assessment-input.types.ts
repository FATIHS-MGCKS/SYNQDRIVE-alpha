import { M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION } from './longitudinal-assessment-input.constants';
import type { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';
import type {
  D4DigestVerificationScope,
  D4InspectionFlagV1,
  D4InspectionOutcome,
  D4InspectionOverallStatus,
  D4RebuildabilityStatus,
} from './longitudinal-integrity-inspection.types';
import type {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import type { LongitudinalInputFeatureScalars } from './longitudinal-input.types';
import type { RestSessionFeatureInputAnchorResolutionStatus } from '../rest-session-feature-input-snapshot.types';
import type { LongitudinalProfileVersionTupleV1 } from './longitudinal-profile.types';

export type M3_3E_RevisionIdentityV1 = {
  organizationId: string;
  vehicleId: string;
  revisionId: string;
  canonicalProfileFingerprint: string;
  longitudinalProfileContractVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION;
  profilePolicyVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION;
};

export type M3_3E_AssessmentGradeInputAvailability =
  | 'ASSESSMENT_GRADE_INPUT_AVAILABLE'
  | 'NO_ASSESSMENT_GRADE_INPUT';

export type M3_3E_ModelSufficiency = 'NOT_EVALUATED';

export type M3_3E_ConsumptionRejectReason =
  | 'REVISION_NOT_FOUND'
  | 'REVISION_SELF_INTEGRITY_FAILED'
  | 'MALFORMED_D3_SCIENTIFIC_PROFILE'
  | 'D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH'
  | 'D3_D4_IDENTITY_MISMATCH'
  | 'UNSUPPORTED_D3_PROFILE_CONTRACT'
  | 'UNSUPPORTED_D3_PROFILE_POLICY'
  | 'UNSUPPORTED_D4_INSPECTION_CONTRACT'
  | 'D3_D4_SESSION_SET_MISMATCH'
  | 'D3_D4_PROFILE_SLICE_MISMATCH'
  | 'D3_D4_CANONICAL_REFERENCE_MISMATCH'
  | 'D3_D4_VERSION_TUPLE_MISMATCH'
  | 'DUPLICATE_SESSION_MAPPING'
  | 'D3_D4_CONTRACT_INCONSISTENCY';

export type M3_3E_AssessmentGradeObservationV1 = {
  restSessionId: string;
  anchorAt: string;
  canonicalFeatureRowId: string;
  inputDigest: string;
  versionTuple: LongitudinalProfileVersionTupleV1;
  features: LongitudinalInputFeatureScalars;
  anchorResolutionStatus: RestSessionFeatureInputAnchorResolutionStatus;
  chargeOpportunityClass: LongitudinalInputFeatureScalars['chargeOpportunityClass'];
  chargeContextCompleteness: string[];
  temperatureC: number | null;
  temperatureSource: string | null;
  integrityContext: {
    digestVerificationScope: D4DigestVerificationScope;
    integrityQualifiedDisposition: 'ELIGIBLE';
  };
};

export type M3_3E_LongitudinalAssessmentInputV1 = {
  contractVersion: typeof M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION;
  identity: {
    organizationId: string;
    vehicleId: string;
    revisionId: string;
    canonicalProfileFingerprint: string;
    longitudinalProfileContractVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION;
    profilePolicyVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION;
    integrityInspectionContractVersion: typeof REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION;
  };
  evidenceWindow: {
    firstEligibleAnchorAt: string | null;
    lastEligibleAnchorAt: string | null;
    eligibleEvidenceSpanMs: number | null;
  };
  coverage: {
    d3DefaultObservationCount: number;
    assessmentGradeObservationCount: number;
    quarantinedIntegrityWarningCount: number;
    sourceEvidenceLimitedCount: number;
    provisionalContextCount: number;
    excludedContextCount: number;
    d4DigestVerificationScope: D4DigestVerificationScope;
    d4Rebuildability: D4RebuildabilityStatus;
  };
  assessmentGradeObservations: M3_3E_AssessmentGradeObservationV1[];
  eligibleVersionSegments: Array<{
    sourceSegmentIndex: number;
    versionTuple: LongitudinalProfileVersionTupleV1;
    observationCount: number;
    firstAnchorAt: string;
    lastAnchorAt: string;
    restSessionIds: string[];
  }>;
  modelEvaluation: {
    inputAvailability: M3_3E_AssessmentGradeInputAvailability;
    modelSufficiency: M3_3E_ModelSufficiency;
  };
  diagnosticContext: {
    d4OverallStatus: D4InspectionOverallStatus;
    inspectionFlags: D4InspectionFlagV1[];
    rebuildability: D4RebuildabilityStatus;
  };
  consumptionInputFingerprint: string;
};

export type M3_3E_BuildOutcome =
  | { status: 'OK'; input: M3_3E_LongitudinalAssessmentInputV1 }
  | { status: 'REJECTED'; reason: M3_3E_ConsumptionRejectReason };

export type M3_3E_BuildLongitudinalAssessmentInputArgs = {
  scientificProfile: unknown;
  revisionIdentity: M3_3E_RevisionIdentityV1;
  d4Outcome: D4InspectionOutcome;
};
