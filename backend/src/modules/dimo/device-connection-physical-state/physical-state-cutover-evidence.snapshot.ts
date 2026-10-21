import type {
  DerivedPhysicalStateCutoverEvidenceSnapshot,
  SignedPhysicalStateCutoverEvidenceBundle,
} from './physical-state-cutover-evidence.types';
import { PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION } from './physical-state-cutover-evidence.types';

export function deriveEvidenceSnapshotFromVerifiedBundle(
  bundle: SignedPhysicalStateCutoverEvidenceBundle,
  payloadCanonicalSha256: string,
): DerivedPhysicalStateCutoverEvidenceSnapshot {
  const payload = bundle.payload;
  return {
    provenanceVersion: PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION,
    bundleId: payload.bundleId,
    schemaVersion: bundle.schemaVersion,
    keyId: bundle.keyId,
    issuer: payload.issuer,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    payloadCanonicalSha256,
    scope: payload.scope,
    signature: bundle.signature,
    artifactRefs: [
      payload.targetApproval.artifact,
      payload.preseedRevalidation.artifact,
      payload.unexplainedObservation.artifact,
      payload.mixedReplica.artifact,
      payload.runtimeBuild.artifact,
    ],
    deploymentBuildId: payload.mixedReplica.deploymentBuildId,
    capableBuildId: payload.mixedReplica.capableBuildId,
    peerSetDigest: payload.mixedReplica.peerSetDigest,
  };
}
