import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';

export const PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION = '1' as const;
export const PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM = 'Ed25519' as const;

export type PhysicalStateCutoverEvidenceArtifactRef = {
  artifactId: string;
  sha256: string;
  observedAt: string;
  result: string;
  scope?: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  };
};

export type PhysicalStateCutoverTargetApprovalProofV1 = {
  scope: PhysicalAuthorityScope;
  artifact: PhysicalStateCutoverEvidenceArtifactRef;
  approvedAt: string;
  approvedBy: string;
  status: 'APPROVED';
};

export type PhysicalStateCutoverPreseedProofV1 = {
  scope: PhysicalAuthorityScope;
  dryRun: true;
  zeroMutation: true;
  conflictCount: 0;
  decision: string;
  artifact: PhysicalStateCutoverEvidenceArtifactRef;
  executedAt: string;
};

export type PhysicalStateCutoverUnexplainedProofV1 = {
  observationWindowStart: string;
  observationWindowEnd: string;
  comparisonCount: number;
  correctnessBlockingCount: number;
  classificationSummary: Record<string, number>;
  artifact: PhysicalStateCutoverEvidenceArtifactRef;
  generatedAt: string;
};

export type PhysicalStateCutoverReplicaAttestationV1 = {
  replicaId: string;
  buildId: string;
  role: 'REQUEST' | 'WORKER' | 'SCHEDULER';
  port?: number | null;
};

export type PhysicalStateCutoverMixedReplicaProofV1 = {
  deploymentBuildId: string;
  capableBuildId: string;
  verifiedAt: string;
  replicas: PhysicalStateCutoverReplicaAttestationV1[];
  peerSetDigest: string;
  allReplicasCapable: true;
  artifact: PhysicalStateCutoverEvidenceArtifactRef;
};

export type PhysicalStateCutoverRuntimeBuildProofV1 = {
  capableBuildId: string;
  applicationBuildId: string;
  artifact: PhysicalStateCutoverEvidenceArtifactRef;
  verifiedAt: string;
};

export type PhysicalStateCutoverEvidencePayloadV1 = {
  bundleId: string;
  issuedAt: string;
  expiresAt: string;
  issuer: string;
  scope: PhysicalAuthorityScope;
  targetApproval: PhysicalStateCutoverTargetApprovalProofV1;
  preseedRevalidation: PhysicalStateCutoverPreseedProofV1;
  unexplainedObservation: PhysicalStateCutoverUnexplainedProofV1;
  mixedReplica: PhysicalStateCutoverMixedReplicaProofV1;
  runtimeBuild: PhysicalStateCutoverRuntimeBuildProofV1;
};

export type SignedPhysicalStateCutoverEvidenceBundle = {
  schemaVersion: typeof PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION;
  algorithm: typeof PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM;
  keyId: string;
  payload: PhysicalStateCutoverEvidencePayloadV1;
  signature: string;
};

export enum PhysicalStateCutoverEvidenceVerificationStatus {
  VALID = 'VALID',
  MISSING_BUNDLE = 'MISSING_BUNDLE',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  UNSUPPORTED_SCHEMA_VERSION = 'UNSUPPORTED_SCHEMA_VERSION',
  UNSUPPORTED_ALGORITHM = 'UNSUPPORTED_ALGORITHM',
  UNKNOWN_KEY_ID = 'UNKNOWN_KEY_ID',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  NOT_YET_VALID = 'NOT_YET_VALID',
  EXPIRED = 'EXPIRED',
  SCOPE_MISMATCH = 'SCOPE_MISMATCH',
  TARGET_NOT_APPROVED = 'TARGET_NOT_APPROVED',
  PRESEED_PROOF_INVALID = 'PRESEED_PROOF_INVALID',
  PRESEED_PROOF_STALE = 'PRESEED_PROOF_STALE',
  UNEXPLAINED_PROOF_INVALID = 'UNEXPLAINED_PROOF_INVALID',
  UNEXPLAINED_COUNT_NONZERO = 'UNEXPLAINED_COUNT_NONZERO',
  OBSERVATION_WINDOW_INSUFFICIENT = 'OBSERVATION_WINDOW_INSUFFICIENT',
  MIXED_REPLICA_PROOF_INVALID = 'MIXED_REPLICA_PROOF_INVALID',
  BUILD_MISMATCH = 'BUILD_MISMATCH',
  PEER_SET_MISMATCH = 'PEER_SET_MISMATCH',
  RUNTIME_INTERLOCK_UNSAFE = 'RUNTIME_INTERLOCK_UNSAFE',
  ARTIFACT_REFERENCE_INVALID = 'ARTIFACT_REFERENCE_INVALID',
  PUBLIC_KEY_CONFIG_INVALID = 'PUBLIC_KEY_CONFIG_INVALID',
  OTHER_SAFETY_FAILURE = 'OTHER_SAFETY_FAILURE',
}

export type PhysicalStateCutoverEvidenceVerificationResult =
  | {
      status: PhysicalStateCutoverEvidenceVerificationStatus.VALID;
      bundle: SignedPhysicalStateCutoverEvidenceBundle;
      payloadCanonicalSha256: string;
      scope: PhysicalAuthorityScope;
    }
  | {
      status: Exclude<
        PhysicalStateCutoverEvidenceVerificationStatus,
        PhysicalStateCutoverEvidenceVerificationStatus.VALID
      >;
      details: string[];
    };

export type DerivedPhysicalStateCutoverEvidenceSnapshot = {
  provenanceVersion: typeof PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION;
  bundleId: string;
  schemaVersion: typeof PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION;
  keyId: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  payloadCanonicalSha256: string;
  scope: PhysicalAuthorityScope;
  signature: string;
  artifactRefs: PhysicalStateCutoverEvidenceArtifactRef[];
  deploymentBuildId: string;
  capableBuildId: string;
  peerSetDigest: string;
};
