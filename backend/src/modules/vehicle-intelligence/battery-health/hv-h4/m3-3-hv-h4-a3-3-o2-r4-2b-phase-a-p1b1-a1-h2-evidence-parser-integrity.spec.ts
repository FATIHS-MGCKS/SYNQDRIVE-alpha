import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import {
  hashGovernanceOperatorRiskAttestationSigningPayloadV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V2,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { parseGovernanceSignedAttestationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.signature-parse.v1';
import { verifyGovernanceEd25519SignatureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto.v1';
import {
  parseGovernanceRatificationAttestationV1,
  verifyGovernanceRatificationOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import {
  parseGovernanceOperatorRiskAttestationV1,
  verifyGovernanceOperatorRiskAttestationOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-operator-risk-attestation-verify-offline.v1';
import {
  canonicalBase64FromBytesV1,
  exportCanonicalEd25519SpkiDerV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';

const NOW = new Date('2026-10-09T12:00:00.000Z');

function mintKey(keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = exportCanonicalEd25519SpkiDerV1(publicKey);
  return {
    keyId,
    privateKey,
    publicKeySpkiBase64: canonicalBase64FromBytesV1(spki),
  };
}

function signDigest(digest: Buffer, privateKey: KeyObject, keyId: string) {
  return {
    algorithm: 'Ed25519' as const,
    keyId,
    detachedBase64: sign(null, digest, privateKey).toString('base64'),
  };
}

describe('P1B1-A1-H2 evidence parser and timestamp integrity', () => {
  it('rejects malformed signature fields without throwing', () => {
    expect(parseGovernanceSignedAttestationV1(null).ok).toBe(false);
    expect(parseGovernanceSignedAttestationV1({ algorithm: 'Ed25519', keyId: '', detachedBase64: 'AAAA' }).ok).toBe(
      false,
    );
    expect(parseGovernanceSignedAttestationV1({ algorithm: 'Ed25519', keyId: 'k', detachedBase64: 123 }).ok).toBe(
      false,
    );
    expect(
      parseGovernanceSignedAttestationV1({ algorithm: 'Ed25519', keyId: 'k', detachedBase64: 'not-base64!!!' }).ok,
    ).toBe(false);

    const rat = parseGovernanceRatificationAttestationV1({
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
      attestationPurpose: 'GOVERNANCE_RATIFICATION_V1',
      signature: { algorithm: 'Ed25519', keyId: 'k' },
      mergeCommitSha: '68d3f913294f678d742e3215ffb7fcff90f0bfa6',
    });
    expect(rat.ok).toBe(false);

    expect(() =>
      verifyGovernanceRatificationOfflineV1({
        trustStore: { contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1, keys: [], revokedKeyIds: [] },
        ownerPolicy: {} as never,
        repositoryEvidence: {} as never,
        attestation: {} as never,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it('rejects acceptedAtUtc tampering on claims while signature unchanged', () => {
    const riskKey = mintKey('risk');
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId: 'risk', publicKeySpkiBase64: riskKey.publicKeySpkiBase64, issuerPurpose: 'OPERATOR_RISK_ACCEPTANCE' as const }],
      revokedKeyIds: [],
    };
    const ownerPolicy = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
      repositoryFullName: 'FATIHS-MGCKS/SYNQDRIVE-alpha',
      expectedPullRequestNumber: 1954,
      governancePolicyId: 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1',
      governanceAdoptionProposalRef: 'architecture/battery-v2/governance/proposal.md',
      authorizedOwnerLogins: ['owner-a-login'],
    };
    const binding = {
      approvalId: 'apr-1',
      executeNonce: 'nonce-1',
      validFrom: '2026-10-09T11:00:00.000Z',
      validUntil: '2026-10-09T14:00:00.000Z',
    };
    const attestation = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V2,
      acceptanceId: 'acc-1',
      operatorLogin: 'owner-a-login',
      changeTicket: 'CHG-1',
      approvalId: binding.approvalId,
      executeNonce: binding.executeNonce,
      authorizedReleaseSha: '68d3f913294f678d742e3215ffb7fcff90f0bfa6',
      postgresTargetFingerprint: 'audit_ro@prod-db.example.com:5432/synqdrive',
      maintenanceWindow: { startUtc: '2026-10-09T10:00:00.000Z', endUtc: '2026-10-09T15:00:00.000Z' },
      pathBSecurityReviewExceptionScope: 'scope',
      residualRiskAcknowledgement: true as const,
      acceptedAtUtc: binding.validFrom,
      evidenceNonce: 'n1',
      issuedAtUtc: '2026-10-09T11:00:00.000Z',
      expiresAtUtc: '2026-10-09T15:00:00.000Z',
      attestationPurpose: 'OPERATOR_RISK_ACCEPTANCE_V2' as const,
      signature: { algorithm: 'Ed25519' as const, keyId: 'risk', detachedBase64: '' },
    };
    const digest = hashGovernanceOperatorRiskAttestationSigningPayloadV1(attestation);
    attestation.signature = signDigest(digest, riskKey.privateKey, 'risk');

    const claimsOk = {
      contractVersion: M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
      governanceMode: 'SINGLE_OPERATOR_V1' as const,
      operatorIdentity: 'owner-a-login',
      authorizedOwnerIdentity: 'owner-a-login',
      changeTicket: 'CHG-1',
      approvalBinding: binding,
      maintenanceWindow: attestation.maintenanceWindow,
      pathBSecurityReviewExceptionScope: 'scope',
      residualRiskAcknowledgement: true as const,
      provenanceAuthenticationStatus: 'UNVERIFIED' as const,
      acceptedAtUtc: binding.validFrom,
      attestation: 'claim only',
    };
    const ok = verifyGovernanceOperatorRiskAttestationOfflineV1({
      trustStore,
      ownerPolicy,
      attestation,
      riskAcceptanceClaims: claimsOk,
      authorizedHumanApprover: 'owner-a-login',
      changeTicket: 'CHG-1',
      approvalBinding: binding,
      maintenanceWindow: attestation.maintenanceWindow,
      authorizedReleaseSha: attestation.authorizedReleaseSha,
      postgresTargetFingerprint: attestation.postgresTargetFingerprint,
      now: NOW,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.independentAuthorityVerified).toBe(false);
    }

    const tamperedClaims = { ...claimsOk, acceptedAtUtc: '2026-10-09T12:30:00.000Z' };
    const tampered = verifyGovernanceOperatorRiskAttestationOfflineV1({
      trustStore,
      ownerPolicy,
      attestation,
      riskAcceptanceClaims: tamperedClaims,
      authorizedHumanApprover: 'owner-a-login',
      changeTicket: 'CHG-1',
      approvalBinding: binding,
      maintenanceWindow: attestation.maintenanceWindow,
      authorizedReleaseSha: attestation.authorizedReleaseSha,
      postgresTargetFingerprint: attestation.postgresTargetFingerprint,
      now: NOW,
    });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) {
      expect(tampered.reasonCode).toBe('PHASE_A_OPERATOR_RISK_ACCEPTANCE_TIMESTAMP_SIGNATURE_MISMATCH');
    }
  });

  it('verifyGovernanceEd25519SignatureV1 fails closed on malformed detached signature', () => {
    const key = mintKey('k');
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId: 'k', publicKeySpkiBase64: key.publicKeySpkiBase64, issuerPurpose: 'GOVERNANCE_RATIFICATION' as const }],
      revokedKeyIds: [],
    };
    const result = verifyGovernanceEd25519SignatureV1(
      trustStore,
      'GOVERNANCE_RATIFICATION',
      { algorithm: 'Ed25519', keyId: 'k', detachedBase64: 'YQ==' },
      Buffer.alloc(32),
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it('parseGovernanceOperatorRiskAttestationV1 rejects V1 contract without acceptedAtUtc', () => {
    const parsed = parseGovernanceOperatorRiskAttestationV1({
      contractVersion: 'M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_V1',
      attestationPurpose: 'OPERATOR_RISK_ACCEPTANCE_V2',
      residualRiskAcknowledgement: true,
      signature: { algorithm: 'Ed25519', keyId: 'k', detachedBase64: sign(null, Buffer.alloc(32), generateKeyPairSync('ed25519').privateKey).toString('base64') },
    });
    expect(parsed.ok).toBe(false);
  });
});
