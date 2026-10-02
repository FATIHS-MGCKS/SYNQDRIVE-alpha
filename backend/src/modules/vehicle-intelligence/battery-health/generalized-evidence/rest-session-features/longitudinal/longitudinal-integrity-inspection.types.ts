import type { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';

export type D4DimensionResult = 'PASS' | 'FAIL' | 'NOT_EVALUATED' | 'NOT_APPLICABLE';

export type D4DigestVerificationScope =
  | 'FULL'
  | 'BOUNDED_LATEST_WINDOW'
  | 'NOT_EVALUATED';

export type D4InspectionFlagV1 =
  | 'INTEGRITY_LIMITED'
  | 'SOURCE_EVIDENCE_LIMITED'
  | 'REBUILDABILITY_LIMITED';

export type D4ProfileSlice = 'DEFAULT' | 'PROVISIONAL' | 'EXCLUDED';

export type D4IntegrityQualifiedDisposition =
  | 'ELIGIBLE'
  | 'QUARANTINED_INTEGRITY_WARNING'
  | 'SOURCE_EVIDENCE_LIMITED'
  | 'NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED'
  | 'NOT_APPLICABLE';

export type D4RebuildabilityStatus = 'FULL' | 'PARTIAL' | 'UNAVAILABLE';

export type D4SourceEvidenceAvailability =
  | 'FOUND'
  | 'MISSING'
  | 'NO_SOURCE_REFERENCE_EXPECTED';

export type D4InspectionOverallStatus =
  | 'OK'
  | 'INTEGRITY_PARTIAL'
  | 'INTEGRITY_WARNING'
  | 'SOURCE_EVIDENCE_LIMITED'
  | 'REVISION_SELF_INTEGRITY_FAILED';

export type D4ReasonCode =
  | 'UNSUPPORTED_PROFILE_CONTRACT'
  | 'UNSUPPORTED_PROFILE_POLICY_VERSION'
  | 'MALFORMED_SCIENTIFIC_PROFILE'
  | 'PROFILE_FINGERPRINT_MISMATCH'
  | 'PROFILE_METADATA_MIRROR_MISMATCH'
  | 'SOURCE_ROW_MISSING'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'SOURCE_VERSION_MISMATCH'
  | 'SOURCE_DIGEST_MISMATCH'
  | 'SOURCE_CONTENT_MISMATCH'
  | 'SOURCE_TEMPORAL_ORDER_INVALID'
  | 'SEMANTIC_REVISION_GAP'
  | 'SEMANTIC_REVISION_DUPLICATE'
  | 'SOURCE_INPUT_CONTRACT_VERSION_UNRESOLVED'
  | 'UNSUPPORTED_SOURCE_INPUT_CONTRACT'
  | 'DIGEST_COVERAGE_PARTIAL';

export type D4VersionTupleEnvelope =
  | {
      featureModelVersion: string;
      retentionPolicyVersion: string;
      chargeOpportunityPolicyVersion: string;
      inputContractVersion: string | null;
      inputContractResolution: 'RESOLVED' | 'UNRESOLVED';
    }
  | null;

export type D4PerSessionInspectionV1 = {
  restSessionId: string;
  profileSlice: D4ProfileSlice;
  versionTuple: D4VersionTupleEnvelope;
  canonicalFeatureRowId: string | null;
  sourceEvidenceAvailability: D4SourceEvidenceAvailability;
  sourceIdentity: D4DimensionResult;
  sourceFeatureScalarIntegrity: D4DimensionResult;
  sourceSnapshotContextIntegrity: D4DimensionResult;
  sourceTemporalProvenance: D4DimensionResult;
  digestIntegrity: D4DimensionResult;
  revisionLineage: D4DimensionResult;
  digestRowsChecked: number;
  digestRowsUnchecked: number;
  digestVerificationScope: D4DigestVerificationScope;
  integrityQualifiedDisposition: D4IntegrityQualifiedDisposition;
  reasons: D4ReasonCode[];
};

export type D4RevisionSelfIntegrityFailureV1 = {
  inspectionContractVersion: typeof REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION;
  inspectionGeneratedAt: string;
  snapshotIsolation: 'REPEATABLE_READ';
  identity: { organizationId: string; vehicleId: string; revisionId: string };
  storedRevisionEnvelope?: {
    canonicalProfileFingerprint: string;
    longitudinalProfileContractVersion: string;
    profilePolicyVersion: string;
  };
  selfIntegrity: 'SELF_INTEGRITY_FAILED';
  reasons: D4ReasonCode[];
};

export type M3_3D_D4_INTEGRITY_INSPECTION_V1 = {
  inspectionContractVersion: typeof REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION;
  inspectionGeneratedAt: string;
  snapshotIsolation: 'REPEATABLE_READ';
  identity: {
    organizationId: string;
    vehicleId: string;
    revisionId: string;
    canonicalProfileFingerprint: string;
  };
  materializedRevision: {
    selfIntegrity: 'SELF_INTEGRITY_OK' | 'SELF_INTEGRITY_FAILED';
    selfIntegrityReasons: D4ReasonCode[];
  };
  coverage: {
    candidateRestSessionCount: number;
    sourceReferencesExpected: number;
    sourceRowsFound: number;
    sourceRowsMissing: number;
    verifiableSourceReferenceCount: number;
    digestRowsChecked: number;
    digestRowsUnchecked: number;
    digestVerificationScope: D4DigestVerificationScope;
  };
  profile: {
    overallStatus: D4InspectionOverallStatus;
    inspectionFlags: D4InspectionFlagV1[];
    rebuildability: D4RebuildabilityStatus;
    defaultObservationCount: number;
    integrityQualifiedDefaultCount: number;
    quarantinedIntegrityWarningDefaultCount: number;
    sourceEvidenceLimitedDefaultCount: number;
    notEligibleRevisionSelfIntegrityFailedDefaultCount: number;
  };
  perSession: D4PerSessionInspectionV1[];
};

export type D4InspectionOutcome =
  | { status: 'REVISION_NOT_FOUND' }
  | { status: 'REVISION_SELF_INTEGRITY_FAILED'; failure: D4RevisionSelfIntegrityFailureV1 }
  | { status: 'OK'; inspection: M3_3D_D4_INTEGRITY_INSPECTION_V1 };

export type D4InspectionRequest = {
  organizationId: string;
  vehicleId: string;
  revisionId: string;
};

export type D4SourceReferenceKey = {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  featureModelVersion: string;
  retentionPolicyVersion: string;
  chargeOpportunityPolicyVersion: string;
  canonicalFeatureRowId: string;
};
