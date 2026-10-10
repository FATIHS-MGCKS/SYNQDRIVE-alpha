import {
  parseDeploymentIdentityEvidenceV1,
  verifyDeploymentIdentityEvidenceOfflineV1,
  type M3_3HvH4A3DeploymentIdentityEvidenceVerifyResultV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-deployment-identity-evidence.v1';
import type { M3_3HvH4A3DeploymentIdentityEvidenceV1, M3_3HvH4A3GovernanceTrustStoreV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';

export type M3_3HvH4A3DeploymentProbeFoundationVerifyResultV1 =
  | (M3_3HvH4A3DeploymentIdentityEvidenceVerifyResultV1 & {
      deploymentShaVerifiedLive: false;
      productionProbeExecuted: false;
    })
  | { ok: false; reasonCode: string; deploymentShaVerifiedLive: false; productionProbeExecuted: false };

/**
 * A2 — non-executing deployment probe issuer/verification design.
 * Offline fixture verification only; live deployment identity remains UNVERIFIED.
 */
export function verifyDeploymentProbeFoundationOfflineV1(input: {
  trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
  evidence: M3_3HvH4A3DeploymentIdentityEvidenceV1;
  expected: {
    repositoryFullName: string;
    releaseCheckoutSha: string;
    deploymentHost: string;
    deploymentLabel: string;
    artifactFingerprintSha256: string;
  };
  verificationChallengeNonce: string;
  now: Date;
  seenProbeNonces?: Set<string>;
}): M3_3HvH4A3DeploymentProbeFoundationVerifyResultV1 {
  if (input.evidence.artifactFingerprintSha256 !== input.expected.artifactFingerprintSha256) {
    return {
      ok: false,
      reasonCode: 'PHASE_A_DEPLOYMENT_BUILD_ARTIFACT_FINGERPRINT_MISMATCH',
      deploymentShaVerifiedLive: false,
      productionProbeExecuted: false,
    };
  }
  const offline = verifyDeploymentIdentityEvidenceOfflineV1({
    trustStore: input.trustStore,
    evidence: input.evidence,
    expected: {
      repositoryFullName: input.expected.repositoryFullName,
      releaseCheckoutSha: input.expected.releaseCheckoutSha,
      deploymentHost: input.expected.deploymentHost,
      deploymentLabel: input.expected.deploymentLabel,
    },
    verificationChallengeNonce: input.verificationChallengeNonce,
    now: input.now,
    seenProbeNonces: input.seenProbeNonces,
  });
  if (!offline.ok) {
    return { ...offline, deploymentShaVerifiedLive: false, productionProbeExecuted: false };
  }
  return {
    ...offline,
    deploymentShaVerifiedLive: false,
    productionProbeExecuted: false,
  };
}

export { parseDeploymentIdentityEvidenceV1 };
