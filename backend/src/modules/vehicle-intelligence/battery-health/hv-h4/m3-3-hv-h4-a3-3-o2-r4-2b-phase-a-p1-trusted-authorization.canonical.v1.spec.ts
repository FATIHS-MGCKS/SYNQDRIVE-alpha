import { generateKeyPairSync, sign, verify } from 'node:crypto';
import {
  buildPhaseAP1TrustedAuthorizationSigningPayloadV1,
  computePhaseAQueryManifestFingerprintV1,
  hashPhaseAP1TrustedAuthorizationSigningPayloadV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.canonical.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_SIGNING_DOMAIN_V1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';

describe('canonical P1 authorization payload hashing', () => {
  it('binds signingHeader keyId and algorithm while excluding detached signature bytes', () => {
    const artifact = {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
      authorizationId: 'a',
      governanceMode: 'SINGLE_OPERATOR_V1' as const,
      operatorIdentity: 'o',
      changeTicket: 'c',
      authorizedReleaseSha: '34555d6653cf7b9314d8385f056baee7231c1c06',
      deploymentIdentity: {
        releaseCheckoutSha: '34555d6653cf7b9314d8385f056baee7231c1c06',
        deploymentHost: 'h',
        deploymentLabel: 'l',
      },
      postgresTargetFingerprint: 'u@h:5432/db',
      auditRoleLogin: 'u',
      queryManifestFingerprint: computePhaseAQueryManifestFingerprintV1(),
      approvalBinding: {
        approvalId: 'apr',
        executeNonce: 'nonce12345',
        validFromUtc: '2026-10-09T10:00:00.000Z',
        validUntilUtc: '2026-10-09T12:00:00.000Z',
      },
      maintenanceWindow: {
        startUtc: '2026-10-09T10:00:00.000Z',
        endUtc: '2026-10-09T12:00:00.000Z',
      },
      authorizationLimits: {
        schemaChangesAuthorized: false,
        issuanceActivationAuthorized: false,
        applicationRuntimeFlagChangesAuthorized: false,
        hybridLoaderActivationAuthorized: false,
        attestationInsertOrUpdateAuthorized: false,
        retentionActivationAuthorized: false,
        reconciliationActivationAuthorized: false,
        backfillActivationAuthorized: false,
      },
      authorizationPolicyId: 'policy-1',
      maintenanceWindowPolicyId: 'mw-policy-1',
      evidenceStorageDestination: 'e',
      consumptionStoreBinding: {
        absolutePathSha256: 'a'.repeat(64),
        markerFileName: '.synqdrive_phase_a_production_consumption_store_v1' as const,
      },
      issuedAtUtc: '2026-10-09T10:00:00.000Z',
      expiresAtUtc: '2026-10-09T12:00:00.000Z',
      signature: { algorithm: 'Ed25519' as const, keyId: 'k', detachedBase64: 'ignored' },
    };
    const payload = buildPhaseAP1TrustedAuthorizationSigningPayloadV1(
      artifact as M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
    );
    expect(payload.signingDomain).toBe(M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_SIGNING_DOMAIN_V1);
    expect(payload.signingHeader.signingKeyId).toBe('k');
    expect(payload.signingHeader.signatureAlgorithm).toBe('Ed25519');
    expect(payload).not.toHaveProperty('signature');

    const digest = hashPhaseAP1TrustedAuthorizationSigningPayloadV1(
      artifact as M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
    );
    const tamperedKeyId = {
      ...artifact,
      signature: { ...artifact.signature, keyId: 'other' },
    };
    const digestTampered = hashPhaseAP1TrustedAuthorizationSigningPayloadV1(
      tamperedKeyId as M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
    );
    expect(digest.equals(digestTampered)).toBe(false);

    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const sig = sign(null, digest, privateKey);
    expect(verify(null, digest, publicKey, sig)).toBe(true);
  });
});
