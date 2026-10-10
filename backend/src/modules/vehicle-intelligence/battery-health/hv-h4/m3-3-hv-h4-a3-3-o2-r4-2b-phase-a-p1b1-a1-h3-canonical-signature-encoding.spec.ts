import { generateKeyPairSync, sign } from 'node:crypto';
import { parseGovernanceSignedAttestationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.signature-parse.v1';
import { verifyGovernanceEd25519SignatureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { exportCanonicalEd25519SpkiDerV1, canonicalBase64FromBytesV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { resolvePhaseAGovernanceExternalAuthorityVerifierV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import { resolvePhaseAProductionP1AuthorizationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import { verifyGovernanceOperatorRiskAttestationOfflineV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-operator-risk-attestation-verify-offline.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V2,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { hashGovernanceOperatorRiskAttestationSigningPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import { M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import { PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';

const NOW = new Date('2026-10-09T12:00:00.000Z');

function mintEd25519DetachedBase64(): { keyId: string; detachedBase64: string; publicKeySpkiBase64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const digest = Buffer.alloc(32, 7);
  const bytes = sign(null, digest, privateKey);
  const detachedBase64 = bytes.toString('base64');
  const spki = exportCanonicalEd25519SpkiDerV1(publicKey);
  return {
    keyId: 'gov-test-key',
    detachedBase64,
    publicKeySpkiBase64: canonicalBase64FromBytesV1(spki),
  };
}

function findNonCanonicalBase64Alias(canonical: string): string | null {
  const bytes = Buffer.from(canonical, 'base64');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < canonical.length; i++) {
    if (canonical[i] === '=') {
      continue;
    }
    for (const c of alphabet) {
      if (c === canonical[i]) {
        continue;
      }
      const candidate = canonical.slice(0, i) + c + canonical.slice(i + 1);
      try {
        const decoded = Buffer.from(candidate, 'base64');
        if (decoded.equals(bytes) && candidate !== bytes.toString('base64')) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

describe('P1B1-A1-H3 canonical Ed25519 signature encoding', () => {
  it('accepts valid canonical 64-byte Ed25519 detached Base64', () => {
    const { keyId, detachedBase64 } = mintEd25519DetachedBase64();
    const parsed = parseGovernanceSignedAttestationV1({
      algorithm: 'Ed25519',
      keyId,
      detachedBase64,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.signature.detachedBase64).toBe(detachedBase64);
      expect(parsed.signature.keyId).toBe(keyId);
    }
  });

  it('rejects unpadded Base64 equivalent', () => {
    const { keyId, detachedBase64 } = mintEd25519DetachedBase64();
    const unpadded = detachedBase64.replace(/=+$/, '');
    expect(unpadded.length).toBeLessThan(detachedBase64.length);
    expect(
      parseGovernanceSignedAttestationV1({ algorithm: 'Ed25519', keyId, detachedBase64: unpadded }).ok,
    ).toBe(false);
  });

  it('rejects leading and trailing whitespace on detachedBase64', () => {
    const { keyId, detachedBase64 } = mintEd25519DetachedBase64();
    expect(
      parseGovernanceSignedAttestationV1({
        algorithm: 'Ed25519',
        keyId,
        detachedBase64: ` ${detachedBase64}`,
      }).ok,
    ).toBe(false);
    expect(
      parseGovernanceSignedAttestationV1({
        algorithm: 'Ed25519',
        keyId,
        detachedBase64: `${detachedBase64} `,
      }).ok,
    ).toBe(false);
  });

  it('rejects noncanonical padding-bit alias with identical decoded bytes', () => {
    const { keyId, detachedBase64 } = mintEd25519DetachedBase64();
    const alias = findNonCanonicalBase64Alias(detachedBase64);
    expect(alias).not.toBeNull();
    expect(
      parseGovernanceSignedAttestationV1({ algorithm: 'Ed25519', keyId, detachedBase64: alias! }).ok,
    ).toBe(false);
  });

  it('rejects keyId with leading or trailing whitespace without silent normalization', () => {
    const { detachedBase64 } = mintEd25519DetachedBase64();
    expect(
      parseGovernanceSignedAttestationV1({
        algorithm: 'Ed25519',
        keyId: ' padded ',
        detachedBase64,
      }).ok,
    ).toBe(false);
    const parsed = parseGovernanceSignedAttestationV1({
      algorithm: 'Ed25519',
      keyId: 'exact-key',
      detachedBase64,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.signature.keyId).toBe('exact-key');
    }
  });

  it('rejects missing and non-string signature fields fail-closed', () => {
    expect(parseGovernanceSignedAttestationV1({ algorithm: 'Ed25519', keyId: 'k' }).ok).toBe(false);
    expect(
      parseGovernanceSignedAttestationV1({
        algorithm: 'Ed25519',
        keyId: 1,
        detachedBase64: mintEd25519DetachedBase64().detachedBase64,
      }).ok,
    ).toBe(false);
  });

  it('verifyGovernanceEd25519SignatureV1 uses exact keyId for trust lookup', () => {
    const material = mintEd25519DetachedBase64();
    const digest = Buffer.alloc(32, 7);
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [
        {
          keyId: material.keyId,
          publicKeySpkiBase64: material.publicKeySpkiBase64,
          issuerPurpose: 'GOVERNANCE_RATIFICATION' as const,
        },
      ],
      revokedKeyIds: [],
    };
    const ok = verifyGovernanceEd25519SignatureV1(
      trustStore,
      'GOVERNANCE_RATIFICATION',
      { algorithm: 'Ed25519', keyId: material.keyId, detachedBase64: material.detachedBase64 },
      digest,
      NOW,
    );
    expect(ok.ok).toBe(true);

    const paddedKey = verifyGovernanceEd25519SignatureV1(
      trustStore,
      'GOVERNANCE_RATIFICATION',
      { algorithm: 'Ed25519', keyId: ` ${material.keyId}`, detachedBase64: material.detachedBase64 },
      digest,
      NOW,
    );
    expect(paddedKey.ok).toBe(false);
  });

  it('preserves H2 acceptedAtUtc signature binding on claims tamper', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const spki = exportCanonicalEd25519SpkiDerV1(publicKey);
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [
        {
          keyId: 'risk',
          publicKeySpkiBase64: canonicalBase64FromBytesV1(spki),
          issuerPurpose: 'OPERATOR_RISK_ACCEPTANCE' as const,
        },
      ],
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
    attestation.signature = {
      algorithm: 'Ed25519',
      keyId: 'risk',
      detachedBase64: sign(null, digest, privateKey).toString('base64'),
    };
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
    const tampered = verifyGovernanceOperatorRiskAttestationOfflineV1({
      trustStore,
      ownerPolicy,
      attestation,
      riskAcceptanceClaims: { ...claimsOk, acceptedAtUtc: '2026-10-09T12:30:00.000Z' },
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

  it('keeps independent authority verifier disabled and P1 NO_GO', () => {
    const resolver = resolvePhaseAGovernanceExternalAuthorityVerifierV1(process.env);
    const rat = resolver.verifyRatificationProvenanceV1({
      provenanceClaims: {} as never,
      adoptionRecord: {} as never,
    });
    expect(rat.reasonCode).toBe(PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED);
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });
});
