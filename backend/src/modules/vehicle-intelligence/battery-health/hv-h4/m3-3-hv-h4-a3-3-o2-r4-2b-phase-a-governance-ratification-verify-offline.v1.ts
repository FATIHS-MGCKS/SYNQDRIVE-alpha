import { normalizePhaseAAuthorizedReleaseShaV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import { hashGovernanceRatificationAttestationSigningPayloadV1, hashRepositoryMergeEvidenceFingerprintV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import { verifyGovernanceEd25519SignatureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
  M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
  type M3_3HvH4A3GovernanceOwnerPolicyV1,
  type M3_3HvH4A3GovernanceRatificationAttestationV1,
  type M3_3HvH4A3GovernanceTrustStoreV1,
  type M3_3HvH4A3RepositoryMergeEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import {
  REPOSITORY_MERGE_PROVENANCE_UNVERIFIED_REASON_CODE,
  type M3_3HvH4A3GovernanceCryptographicVerificationStatusV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import { describeGovernanceEphemeralNonceDedupScopeV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-replay-boundary.v1';
import {
  canonicalBase64FromBytesV1,
  exportCanonicalEd25519SpkiDerV1,
  materializeEd25519TrustSpkiV1,
  sha256HexFingerprintV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

const TRUST_STORE_CONTRACT = 'M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_V1' as const;
const ISSUER_PURPOSES = new Set([
  'GOVERNANCE_RATIFICATION',
  'OPERATOR_RISK_ACCEPTANCE',
  'DEPLOYMENT_PROBE',
  'POSTGRES_TARGET',
]);

export type M3_3HvH4A3GovernanceRatificationOfflineVerifyResultV1 =
  | {
      ok: true;
      cryptographicVerificationStatus: 'SIGNATURE_VALID_WITH_SUPPLIED_KEY';
      independentAuthorityVerified: false;
      reasonCode: typeof REPOSITORY_MERGE_PROVENANCE_UNVERIFIED_REASON_CODE;
      ephemeralNonceDedupScope: ReturnType<typeof describeGovernanceEphemeralNonceDedupScopeV1>;
    }
  | { ok: false; reasonCode: string; cryptographicVerificationStatus?: M3_3HvH4A3GovernanceCryptographicVerificationStatusV1 };

export function isRepositoryMergeEvidenceProductionAuthoritativeV1(
  evidence: M3_3HvH4A3RepositoryMergeEvidenceV1,
): boolean {
  if (evidence.evidenceSource === 'GITHUB_REST_API_READONLY_FIXTURE') {
    return false;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGovernanceTrustStoreV1(
  parsed: unknown,
): { ok: true; store: M3_3HvH4A3GovernanceTrustStoreV1 } | { ok: false; reasonCode: string } {
  try {
    if (!isRecord(parsed) || parsed.contractVersion !== TRUST_STORE_CONTRACT) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
    }
    const keysRaw = parsed.keys;
    if (!Array.isArray(keysRaw) || keysRaw.length === 0) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
    }
    const revokedRaw = parsed.revokedKeyIds;
    if (!Array.isArray(revokedRaw) || revokedRaw.some((id) => typeof id !== 'string' || !id.trim())) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
    }
    const seenKeyIds = new Set<string>();
    const seenMaterial = new Set<string>();
    for (const entry of keysRaw) {
      if (!isRecord(entry)) {
        return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
      }
      const keyId = typeof entry.keyId === 'string' ? entry.keyId.trim() : '';
      const spkiB64 = typeof entry.publicKeySpkiBase64 === 'string' ? entry.publicKeySpkiBase64.trim() : '';
      const purpose = entry.issuerPurpose;
      if (!keyId || !spkiB64 || typeof purpose !== 'string' || !(ISSUER_PURPOSES as Set<string>).has(purpose)) {
        return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
      }
      if (seenKeyIds.has(keyId)) {
        return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_DUPLICATE_KEY_ID' };
      }
      seenKeyIds.add(keyId);
      const materialized = materializeEd25519TrustSpkiV1(spkiB64);
      if (!materialized.ok) {
        return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_KEY_MALFORMED' };
      }
      const canonicalB64 = canonicalBase64FromBytesV1(
        exportCanonicalEd25519SpkiDerV1(materialized.value.publicKey),
      );
      const fp = sha256HexFingerprintV1(Buffer.from(canonicalB64, 'utf8'));
      if (seenMaterial.has(fp)) {
        return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_DUPLICATE_KEY_MATERIAL' };
      }
      seenMaterial.add(fp);
      if (entry.notBeforeUtc !== undefined && typeof entry.notBeforeUtc !== 'string') {
        return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
      }
      if (entry.notAfterUtc !== undefined && typeof entry.notAfterUtc !== 'string') {
        return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
      }
    }
    return { ok: true, store: parsed as M3_3HvH4A3GovernanceTrustStoreV1 };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_STORE_INVALID' };
  }
}

export function parseGovernanceOwnerPolicyV1(
  parsed: unknown,
): { ok: true; policy: M3_3HvH4A3GovernanceOwnerPolicyV1 } | { ok: false; reasonCode: string } {
  if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OWNER_POLICY_INVALID' };
  }
  const logins = parsed.authorizedOwnerLogins;
  if (!Array.isArray(logins) || logins.length === 0 || logins.some((l) => typeof l !== 'string' || !l.trim())) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OWNER_POLICY_INVALID' };
  }
  if (logins.some((l) => l.trim().toUpperCase() === 'AUTHORITY_A')) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OWNER_POLICY_ROLE_LABEL_FORBIDDEN' };
  }
  return { ok: true, policy: parsed as M3_3HvH4A3GovernanceOwnerPolicyV1 };
}

export function parseRepositoryMergeEvidenceV1(
  parsed: unknown,
): { ok: true; evidence: M3_3HvH4A3RepositoryMergeEvidenceV1 } | { ok: false; reasonCode: string } {
  if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_REPOSITORY_EVIDENCE_INVALID' };
  }
  if (parsed.merged !== true) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_REPOSITORY_EVIDENCE_NOT_MERGED' };
  }
  const sha = normalizePhaseAAuthorizedReleaseShaV1(
    typeof parsed.mergeCommitSha === 'string' ? parsed.mergeCommitSha : undefined,
  );
  if (!sha.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_REPOSITORY_EVIDENCE_MERGE_SHA_INVALID' };
  }
  const evidence = parsed as M3_3HvH4A3RepositoryMergeEvidenceV1;
  evidence.mergeCommitSha = sha.normalized;
  return { ok: true, evidence };
}

export function parseGovernanceRatificationAttestationV1(
  parsed: unknown,
): { ok: true; attestation: M3_3HvH4A3GovernanceRatificationAttestationV1 } | { ok: false; reasonCode: string } {
  if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_ATTESTATION_INVALID' };
  }
  if (parsed.attestationPurpose !== 'GOVERNANCE_RATIFICATION_V1') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_ATTESTATION_INVALID' };
  }
  const sig = parsed.signature;
  if (!isRecord(sig) || sig.algorithm !== 'Ed25519') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_ATTESTATION_INVALID' };
  }
  const mergeSha = normalizePhaseAAuthorizedReleaseShaV1(
    typeof parsed.mergeCommitSha === 'string' ? parsed.mergeCommitSha : undefined,
  );
  if (!mergeSha.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_ATTESTATION_MERGE_SHA_INVALID' };
  }
  const attestation = parsed as M3_3HvH4A3GovernanceRatificationAttestationV1;
  attestation.mergeCommitSha = mergeSha.normalized;
  return { ok: true, attestation };
}

export function verifyGovernanceRatificationOfflineV1(
  input: {
    trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
    ownerPolicy: M3_3HvH4A3GovernanceOwnerPolicyV1;
    repositoryEvidence: M3_3HvH4A3RepositoryMergeEvidenceV1;
    attestation: M3_3HvH4A3GovernanceRatificationAttestationV1;
    now: Date;
    seenEvidenceNonces?: Set<string>;
  },
): M3_3HvH4A3GovernanceRatificationOfflineVerifyResultV1 {
  const { trustStore, ownerPolicy, repositoryEvidence, attestation, now } = input;
  const issued = parseUtcInstantStrictV1(attestation.issuedAtUtc);
  const expires = parseUtcInstantStrictV1(attestation.expiresAtUtc);
  if (!issued || !expires || expires <= issued) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_ATTESTATION_WINDOW_INVALID' };
  }
  if (now < issued || now > expires) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_ATTESTATION_EXPIRED' };
  }
  if (input.seenEvidenceNonces?.has(attestation.evidenceNonce)) {
    return {
      ok: false,
      reasonCode: 'PHASE_A_GOVERNANCE_EVIDENCE_NONCE_REPLAY_WITHIN_EPHEMERAL_SCOPE',
      cryptographicVerificationStatus: 'SIGNATURE_NOT_EVALUATED',
    };
  }

  const digest = hashGovernanceRatificationAttestationSigningPayloadV1(attestation);
  const sig = verifyGovernanceEd25519SignatureV1(
    trustStore,
    'GOVERNANCE_RATIFICATION',
    attestation.signature,
    digest,
    now,
  );
  if (!sig.ok) {
    return { ok: false, reasonCode: sig.reasonCode, cryptographicVerificationStatus: 'SIGNATURE_INVALID' };
  }

  const repoFingerprint = hashRepositoryMergeEvidenceFingerprintV1(repositoryEvidence);
  if (attestation.repositoryEvidenceFingerprintSha256 !== repoFingerprint) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_REPOSITORY_EVIDENCE_FINGERPRINT_MISMATCH' };
  }

  if (repositoryEvidence.repositoryFullName !== ownerPolicy.repositoryFullName) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_REPOSITORY_IDENTITY_MISMATCH' };
  }
  if (repositoryEvidence.pullRequestNumber !== ownerPolicy.expectedPullRequestNumber) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_PULL_REQUEST_MISMATCH' };
  }
  if (repositoryEvidence.mergeCommitSha !== attestation.mergeCommitSha) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_MERGE_SHA_MISMATCH' };
  }

  const ownerLogin = attestation.authenticatedOwnerLogin.trim().toLowerCase();
  const authorized = ownerPolicy.authorizedOwnerLogins.map((l) => l.trim().toLowerCase());
  if (!ownerLogin || !authorized.includes(ownerLogin)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OWNER_ACTOR_UNAUTHORIZED' };
  }

  if (attestation.governancePolicyId.trim() !== ownerPolicy.governancePolicyId.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_POLICY_ID_MISMATCH' };
  }
  if (attestation.governanceAdoptionProposalRef.trim() !== ownerPolicy.governanceAdoptionProposalRef.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_PROPOSAL_REF_MISMATCH' };
  }

  if (attestation.repositoryFullName !== repositoryEvidence.repositoryFullName) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_REPOSITORY_IDENTITY_MISMATCH' };
  }
  if (attestation.pullRequestNumber !== repositoryEvidence.pullRequestNumber) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_PULL_REQUEST_MISMATCH' };
  }

  input.seenEvidenceNonces?.add(attestation.evidenceNonce);
  if (isRepositoryMergeEvidenceProductionAuthoritativeV1(repositoryEvidence)) {
    return {
      ok: false,
      reasonCode: REPOSITORY_MERGE_PROVENANCE_UNVERIFIED_REASON_CODE,
      cryptographicVerificationStatus: 'SIGNATURE_VALID_WITH_SUPPLIED_KEY',
    };
  }
  return {
    ok: true,
    cryptographicVerificationStatus: 'SIGNATURE_VALID_WITH_SUPPLIED_KEY',
    independentAuthorityVerified: false,
    reasonCode: REPOSITORY_MERGE_PROVENANCE_UNVERIFIED_REASON_CODE,
    ephemeralNonceDedupScope: describeGovernanceEphemeralNonceDedupScopeV1(),
  };
}
