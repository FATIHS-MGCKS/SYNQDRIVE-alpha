import { normalizePhaseAAuthorizedReleaseShaV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import { hashDeploymentIdentityEvidenceSigningPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import { verifyGovernanceEd25519SignatureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto.v1';
import {
  M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1,
  type M3_3HvH4A3DeploymentIdentityEvidenceV1,
  type M3_3HvH4A3GovernanceTrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

export type M3_3HvH4A3DeploymentIdentityEvidenceVerifyResultV1 =
  | { ok: true; offlineVerified: true; deploymentIdentityBound: true }
  | { ok: false; reasonCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDeploymentIdentityEvidenceV1(
  parsed: unknown,
): { ok: true; evidence: M3_3HvH4A3DeploymentIdentityEvidenceV1 } | { ok: false; reasonCode: string } {
  if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_IDENTITY_EVIDENCE_INVALID' };
  }
  const sha = normalizePhaseAAuthorizedReleaseShaV1(
    typeof parsed.releaseCheckoutSha === 'string' ? parsed.releaseCheckoutSha : undefined,
  );
  if (!sha.ok) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_IDENTITY_RELEASE_SHA_INVALID' };
  }
  const evidence = parsed as M3_3HvH4A3DeploymentIdentityEvidenceV1;
  evidence.releaseCheckoutSha = sha.normalized;
  return { ok: true, evidence };
}

export function verifyDeploymentIdentityEvidenceOfflineV1(
  input: {
    trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
    evidence: M3_3HvH4A3DeploymentIdentityEvidenceV1;
    expected: {
      repositoryFullName: string;
      releaseCheckoutSha: string;
      deploymentHost: string;
      deploymentLabel: string;
    };
    now: Date;
    seenProbeNonces?: Set<string>;
  },
): M3_3HvH4A3DeploymentIdentityEvidenceVerifyResultV1 {
  const { evidence, now } = input;
  const probedAt = parseUtcInstantStrictV1(evidence.probedAtUtc);
  const freshUntil = parseUtcInstantStrictV1(evidence.freshnessValidUntilUtc);
  if (!probedAt || !freshUntil || freshUntil <= probedAt) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_IDENTITY_FRESHNESS_INVALID' };
  }
  if (now < probedAt || now > freshUntil) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_IDENTITY_STALE' };
  }
  if (input.seenProbeNonces?.has(evidence.probeNonce)) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_PROBE_NONCE_REPLAY' };
  }

  const digest = hashDeploymentIdentityEvidenceSigningPayloadV1(evidence);
  const sig = verifyGovernanceEd25519SignatureV1(
    input.trustStore,
    'DEPLOYMENT_PROBE',
    evidence.signature,
    digest,
    now,
  );
  if (!sig.ok) return sig;

  if (evidence.repositoryFullName !== input.expected.repositoryFullName) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_REPOSITORY_MISMATCH' };
  }
  if (evidence.releaseCheckoutSha !== input.expected.releaseCheckoutSha) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_RELEASE_SHA_MISMATCH' };
  }
  if (evidence.deploymentHost !== input.expected.deploymentHost) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_HOST_MISMATCH' };
  }
  if (evidence.deploymentLabel !== input.expected.deploymentLabel) {
    return { ok: false, reasonCode: 'PHASE_A_DEPLOYMENT_LABEL_MISMATCH' };
  }

  input.seenProbeNonces?.add(evidence.probeNonce);
  return { ok: true, offlineVerified: true, deploymentIdentityBound: true };
}
