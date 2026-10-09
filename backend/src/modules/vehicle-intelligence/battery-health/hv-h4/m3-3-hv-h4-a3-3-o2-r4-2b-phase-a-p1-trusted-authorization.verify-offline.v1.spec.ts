import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { resolvePhaseAProductionP1AuthorizationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import {
  computePhaseAQueryManifestFingerprintV1,
  hashPhaseAP1TrustedAuthorizationSigningPayloadV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.canonical.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  type M3_3HvH4A3PhaseAP1TrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';
import { verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.verify-offline.v1';

const RELEASE_SHA = '34555d6653cf7b9314d8385f056baee7231c1c06';
const TARGET = 'audit_ro@prod-db.example.com:5432/synqdrive';

function buildBaseArtifact(
  overrides: Partial<M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1> = {},
): M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1 {
  const now = Date.now();
  const start = new Date(now - 60_000).toISOString();
  const end = new Date(now + 3600_000).toISOString();
  return {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
    authorizationId: 'authz-test-001',
    governanceMode: 'SINGLE_OPERATOR_V1',
    operatorIdentity: 'owner@example.com',
    changeTicket: 'CHG-P1B0-001',
    authorizedReleaseSha: RELEASE_SHA,
    deploymentIdentity: {
      releaseCheckoutSha: RELEASE_SHA,
      deploymentHost: 'app.synqdrive.eu',
      deploymentLabel: 'synqdrive-production',
    },
    postgresTargetFingerprint: TARGET,
    auditRoleLogin: 'audit_ro',
    queryManifestFingerprint: computePhaseAQueryManifestFingerprintV1(),
    approvalBinding: {
      approvalId: 'apr-test-001',
      executeNonce: 'nonce-test-abc',
      validFromUtc: start,
      validUntilUtc: end,
    },
    maintenanceWindow: { startUtc: start, endUtc: end },
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
    evidenceStorageDestination: 'evidence://chg-p1b0',
    consumptionStoreBinding: {
      absolutePathSha256: createHash('sha256').update('/var/lib/synqdrive/phase-a', 'utf8').digest('hex'),
      markerFileName: '.synqdrive_phase_a_production_consumption_store_v1',
    },
    issuedAtUtc: start,
    expiresAtUtc: end,
    signature: {
      algorithm: 'Ed25519',
      keyId: 'operator-key-1',
      detachedBase64: 'AAAA',
    },
    ...overrides,
  };
}

function signArtifactV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  privateKey: KeyObject,
  keyId: string,
): M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1 {
  const digest = hashPhaseAP1TrustedAuthorizationSigningPayloadV1(artifact);
  const detached = sign(null, digest, privateKey);
  return {
    ...artifact,
    signature: {
      algorithm: 'Ed25519',
      keyId,
      detachedBase64: detached.toString('base64'),
    },
  };
}

function buildTrustStoreV1(publicKey: KeyObject, keyId: string): M3_3HvH4A3PhaseAP1TrustStoreV1 {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
    keys: [
      {
        keyId,
        publicKeySpkiBase64: spki.toString('base64'),
      },
    ],
    revokedKeyIds: [],
  };
}

describe('verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyId = 'operator-key-1';
  const trustStore = buildTrustStoreV1(publicKey, keyId);
  const context = {
    authorizedReleaseSha: RELEASE_SHA,
    postgresTargetFingerprint: TARGET,
    queryManifestFingerprint: computePhaseAQueryManifestFingerprintV1(),
  };

  it('verifies a valid detached Ed25519 signature (T01)', () => {
    const signed = signArtifactV1(buildBaseArtifact(), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects tampered payload (T02)', () => {
    const signed = signArtifactV1(buildBaseArtifact(), privateKey, keyId);
    signed.changeTicket = 'CHG-TAMPERED';
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_SIGNATURE_INVALID');
  });

  it('rejects revoked trust key (T04)', () => {
    const signed = signArtifactV1(buildBaseArtifact(), privateKey, keyId);
    const revokedStore = { ...trustStore, revokedKeyIds: [keyId] };
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      revokedStore,
      context,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_TRUST_KEY_REVOKED');
  });

  it('rejects expired authorization (T05)', () => {
    const past = new Date(Date.now() - 7200_000).toISOString();
    const signed = signArtifactV1(
      buildBaseArtifact({ expiresAtUtc: past, maintenanceWindow: { startUtc: past, endUtc: past } }),
      privateKey,
      keyId,
    );
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: new Date() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_AUTHORIZATION_EXPIRED');
  });

  it('rejects release SHA mismatch (T07)', () => {
    const signed = signArtifactV1(buildBaseArtifact(), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(signed, trustStore, {
      ...context,
      authorizedReleaseSha: '0000000000000000000000000000000000000000',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_RELEASE_SHA_MISMATCH');
  });

  it('rejects forbidden authorization limits (T10)', () => {
    const artifact = buildBaseArtifact();
    const limits = { ...artifact.authorizationLimits } as Record<string, boolean>;
    limits.schemaChangesAuthorized = true;
    artifact.authorizationLimits = limits as typeof artifact.authorizationLimits;
    const signed = signArtifactV1(artifact, privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_AUTHORIZATION_LIMITS_FORBIDDEN');
  });

  it('does not change runtime P1 authorization (T20)', () => {
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });
});

describe('computePhaseAQueryManifestFingerprintV1', () => {
  it('is stable for the approved manifest', () => {
    const a = computePhaseAQueryManifestFingerprintV1();
    const b = computePhaseAQueryManifestFingerprintV1();
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
