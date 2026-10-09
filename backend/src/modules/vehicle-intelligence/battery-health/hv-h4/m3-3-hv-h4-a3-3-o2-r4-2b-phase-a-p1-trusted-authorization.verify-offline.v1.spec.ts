import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePhaseAProductionP1AuthorizationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import {
  buildPhaseAP1TrustedAuthorizationSigningPayloadV1,
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
const CONSUMPTION_SHA = createHash('sha256').update('/var/lib/synqdrive/phase-a', 'utf8').digest('hex');
const AUTH_POLICY = 'M3_3_HV_H4_A3_PHASE_A_P1_AUTH_POLICY_V1';
const MW_POLICY = 'M3_3_HV_H4_A3_PHASE_A_MAINTENANCE_POLICY_V1';

function windowAround(nowMs: number) {
  const start = new Date(nowMs - 60_000).toISOString();
  const end = new Date(nowMs + 3600_000).toISOString();
  return { start, end };
}

function buildBaseArtifact(
  overrides: Partial<M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1> = {},
  nowMs = Date.now(),
): M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1 {
  const { start, end } = windowAround(nowMs);
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
    authorizationPolicyId: AUTH_POLICY,
    maintenanceWindowPolicyId: MW_POLICY,
    evidenceStorageDestination: 'evidence://chg-p1b0',
    consumptionStoreBinding: {
      absolutePathSha256: CONSUMPTION_SHA,
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

function buildSyntheticContext(nowMs = Date.now()) {
  return {
    runningReleaseSha: RELEASE_SHA,
    deploymentHost: 'app.synqdrive.eu',
    deploymentLabel: 'synqdrive-production',
    postgresTargetFingerprint: TARGET,
    auditRoleLogin: 'audit_ro',
    approvalId: 'apr-test-001',
    executeNonce: 'nonce-test-abc',
    changeTicket: 'CHG-P1B0-001',
    authorizationId: 'authz-test-001',
    queryManifestFingerprint: computePhaseAQueryManifestFingerprintV1(),
    consumptionStorePathSha256: CONSUMPTION_SHA,
    maintenanceWindowPolicyId: MW_POLICY,
    authorizationPolicyId: AUTH_POLICY,
    liveDeploymentIdentityVerified: false as const,
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
  const fixedNow = new Date('2026-10-09T12:00:00.000Z');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyId = 'operator-key-1';
  const trustStore = buildTrustStoreV1(publicKey, keyId);
  const context = buildSyntheticContext(fixedNow.getTime());

  it('verifies a valid detached Ed25519 signature (T01)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects tampered payload field after sign (T02)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    signed.changeTicket = 'CHG-TAMPERED';
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_SIGNATURE_INVALID');
  });

  it('rejects wrong trust key / keyId (T03)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const other = generateKeyPairSync('ed25519');
    const otherStore = buildTrustStoreV1(other.publicKey, 'other-key');
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      otherStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['PHASE_A_P1_SIGNATURE_INVALID', 'PHASE_A_P1_TRUST_KEY_NOT_FOUND']).toContain(
        result.reasonCode,
      );
    }
  });

  it('rejects keyId substitution after sign (H1)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const alt = generateKeyPairSync('ed25519');
    const dualStore: M3_3HvH4A3PhaseAP1TrustStoreV1 = {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys: [
        ...trustStore.keys,
        {
          keyId: 'operator-key-2',
          publicKeySpkiBase64: alt.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        },
      ],
      revokedKeyIds: [],
    };
    signed.signature.keyId = 'operator-key-2';
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      dualStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_SIGNATURE_INVALID');
  });

  it('rejects revoked trust key (T04)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const revokedStore = { ...trustStore, revokedKeyIds: [keyId] };
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      revokedStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_TRUST_KEY_REVOKED');
  });

  it('rejects duplicate public-key alias in trust store (H1)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const aliasStore: M3_3HvH4A3PhaseAP1TrustStoreV1 = {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys: [
        { keyId: 'operator-key-1', publicKeySpkiBase64: spki },
        { keyId: 'operator-key-alias', publicKeySpkiBase64: spki },
      ],
      revokedKeyIds: [],
    };
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      aliasStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_TRUST_STORE_DUPLICATE_KEY_ALIAS');
  });

  it('rejects expired authorization expiresAtUtc (T05)', () => {
    const past = new Date(fixedNow.getTime() - 7200_000);
    const { start, end } = windowAround(past.getTime());
    const signed = signArtifactV1(
      buildBaseArtifact(
        {
          issuedAtUtc: start,
          expiresAtUtc: end,
          maintenanceWindow: { startUtc: start, endUtc: end },
          approvalBinding: {
            approvalId: 'apr-test-001',
            executeNonce: 'nonce-test-abc',
            validFromUtc: start,
            validUntilUtc: end,
          },
        },
        past.getTime(),
      ),
      privateKey,
      keyId,
    );
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['PHASE_A_P1_AUTHORIZATION_EXPIRED', 'PHASE_A_P1_APPROVAL_BINDING_EXPIRED']).toContain(
        result.reasonCode,
      );
    }
  });

  it('rejects expired approval binding while artifact expiry appears valid (H1)', () => {
    const nowMs = fixedNow.getTime();
    const approvalEnd = new Date(nowMs - 1000).toISOString();
    const approvalStart = new Date(nowMs - 3600_000).toISOString();
    const windowEnd = new Date(nowMs + 3600_000).toISOString();
    const artifact = buildBaseArtifact(
      {
        approvalBinding: {
          approvalId: 'apr-test-001',
          executeNonce: 'nonce-test-abc',
          validFromUtc: approvalStart,
          validUntilUtc: approvalEnd,
        },
        maintenanceWindow: { startUtc: approvalStart, endUtc: windowEnd },
        expiresAtUtc: windowEnd,
        issuedAtUtc: approvalStart,
      },
      nowMs,
    );
    const signed = signArtifactV1(artifact, privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_APPROVAL_BINDING_EXPIRED');
  });

  it('rejects maintenance window closed (T06)', () => {
    const past = new Date(fixedNow.getTime() - 7200_000).toISOString();
    const end = new Date(fixedNow.getTime() + 3600_000).toISOString();
    const signed = signArtifactV1(
      buildBaseArtifact(
        {
          maintenanceWindow: { startUtc: past, endUtc: past },
          issuedAtUtc: past,
          expiresAtUtc: end,
          approvalBinding: {
            approvalId: 'apr-test-001',
            executeNonce: 'nonce-test-abc',
            validFromUtc: past,
            validUntilUtc: end,
          },
        },
        fixedNow.getTime(),
      ),
      privateKey,
      keyId,
    );
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_MAINTENANCE_WINDOW_CLOSED');
  });

  it('rejects release SHA mismatch (T07)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      {
        ...context,
        runningReleaseSha: '0000000000000000000000000000000000000000',
      },
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_RELEASE_SHA_MISMATCH');
  });

  it('rejects postgres target mismatch (T08)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      {
        ...context,
        postgresTargetFingerprint: 'other@host:5432/db',
      },
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_POSTGRES_TARGET_MISMATCH');
  });

  it('rejects query manifest mismatch (T09)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      {
        ...context,
        queryManifestFingerprint: 'f'.repeat(64),
      },
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_QUERY_MANIFEST_MISMATCH');
  });

  it('rejects forbidden authorization limits (T10)', () => {
    const artifact = buildBaseArtifact({}, fixedNow.getTime());
    const limits = { ...artifact.authorizationLimits } as Record<string, boolean>;
    limits.schemaChangesAuthorized = true;
    artifact.authorizationLimits = limits as typeof artifact.authorizationLimits;
    const signed = signArtifactV1(artifact, privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID');
  });

  it('rejects unsupported governance mode (T11)', () => {
    const signed = signArtifactV1(
      buildBaseArtifact({ governanceMode: 'SINGLE_OPERATOR_V1' as 'SINGLE_OPERATOR_V1' }),
      privateKey,
      keyId,
    );
    const raw = { ...signed, governanceMode: 'TWO_HUMAN_V1' };
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      raw,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_GOVERNANCE_MODE_UNSUPPORTED');
  });

  it('rejects malformed base64 signature (T12)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    signed.signature.detachedBase64 = 'not-valid-base64!!!';
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_SIGNATURE_MALFORMED');
  });

  it('rejects missing required field (T13)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const raw = { ...signed };
    delete (raw as { authorizationId?: string }).authorizationId;
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      raw,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID');
  });

  it('rejects unknown artifact field (H1)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      { ...signed, extraField: true },
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID');
  });

  it('rejects audit login mismatch (T14)', () => {
    const signed = signArtifactV1(
      buildBaseArtifact({ auditRoleLogin: 'wrong_login' }),
      privateKey,
      keyId,
    );
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_AUDIT_LOGIN_MISMATCH');
  });

  it('rejects inconsistent approval window (T15)', () => {
    const start = '2026-10-09T10:00:00.000Z';
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      buildBaseArtifact({
        approvalBinding: {
          approvalId: 'apr-test-001',
          executeNonce: 'nonce-test-abc',
          validFromUtc: '2026-10-09T14:00:00.000Z',
          validUntilUtc: '2026-10-09T12:00:00.000Z',
        },
        maintenanceWindow: { startUtc: start, endUtc: '2026-10-09T13:00:00.000Z' },
        issuedAtUtc: start,
        expiresAtUtc: '2026-10-09T13:00:00.000Z',
      }),
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_APPROVAL_WINDOW_INVALID');
  });

  it('rejects expired trust key notAfter (T16)', () => {
    const spki = publicKey.export({ type: 'spki', format: 'der' });
    const store: M3_3HvH4A3PhaseAP1TrustStoreV1 = {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys: [
        {
          keyId,
          publicKeySpkiBase64: spki.toString('base64'),
          notAfterUtc: '2026-10-09T11:00:00.000Z',
        },
      ],
      revokedKeyIds: [],
    };
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      store,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_TRUST_KEY_EXPIRED');
  });

  it('rejects signature over wrong canonical bytes (T17)', () => {
    const artifact = buildBaseArtifact({}, fixedNow.getTime());
    const wrongDigest = hashPhaseAP1TrustedAuthorizationSigningPayloadV1({
      ...artifact,
      changeTicket: 'different-ticket',
    });
    const detached = sign(null, wrongDigest, privateKey);
    const signed = {
      ...artifact,
      signature: { algorithm: 'Ed25519' as const, keyId, detachedBase64: detached.toString('base64') },
    };
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
      signed,
      trustStore,
      context,
      { now: fixedNow },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_P1_SIGNATURE_INVALID');
  });

  it('binding signing header includes keyId and algorithm (H1)', () => {
    const artifact = buildBaseArtifact({}, fixedNow.getTime());
    const payload = buildPhaseAP1TrustedAuthorizationSigningPayloadV1(artifact);
    expect(payload.signingHeader.signingKeyId).toBe('operator-key-1');
    expect(payload.signingHeader.signatureAlgorithm).toBe('Ed25519');
    expect(payload.signingHeader.contractVersion).toBe(
      M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
    );
  });

  it('rejects non-object artifact without throwing (H1)', () => {
    expect(
      verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(null, trustStore, context, {
        now: fixedNow,
      }).ok,
    ).toBe(false);
  });

  it('rejects context with liveDeploymentIdentityVerified true (H1)', () => {
    const signed = signArtifactV1(buildBaseArtifact({}, fixedNow.getTime()), privateKey, keyId);
    const result = verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(signed, trustStore, {
      ...context,
      liveDeploymentIdentityVerified: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_P1_VERIFY_CONTEXT_LIVE_IDENTITY_UNVERIFIED_REQUIRED');
    }
  });

  it('does not change runtime P1 authorization (T20)', () => {
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });
});

describe('verify-offline integration boundaries (T18–T19)', () => {
  it('verifier module does not import production Prisma or preflight runners', () => {
    const verifierPath = path.join(
      __dirname,
      'm3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.verify-offline.v1.ts',
    );
    const source = fs.readFileSync(verifierPath, 'utf8');
    expect(source).not.toMatch(/createPhaseAProductionPrismaClientV1/);
    expect(source).not.toMatch(/runM3_3HvH4A3PhaseAPreflightV1/);
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/consumeApproval/);
    expect(source).not.toMatch(/evaluatePhaseAPreflightProductionAdmissionV1/);
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
