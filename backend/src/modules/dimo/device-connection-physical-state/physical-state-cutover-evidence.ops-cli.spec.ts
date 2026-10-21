import { createRequire } from 'node:module';
import * as path from 'node:path';
import { hashCanonicalCutoverEvidencePayload } from './physical-state-cutover-evidence.canonical';
import { signPhysicalStateCutoverEvidenceBundle } from './physical-state-cutover-evidence.signer';
import { PhysicalStateCutoverEvidenceVerificationStatus } from './physical-state-cutover-evidence.types';
import { verifyPhysicalStateCutoverEvidence } from './physical-state-cutover-evidence.verifier';
import {
  buildValidSignedCutoverEvidenceBundleForScope,
  clearP25TestEvidencePublicKeyring,
  configureP25TestEvidencePublicKeyring,
  disableP25CutoverRuntimeEnv,
  enableP25CutoverRuntimeEnv,
  getP25TestEvidenceKeyMaterial,
  P25_TEST_CUTOVER_BUILD,
} from './testing/physical-state-cutover-evidence.test-fixtures';
import { buildDefaultCutoverEvidencePayload } from './physical-state-cutover-evidence.signer';

const nodeRequire = createRequire(__filename);
const opsLib = nodeRequire(path.join(__dirname, 'physical-state-cutover-evidence.ops-lib.cjs')) as {
  signCutoverEvidenceManifest: (input: {
    payload: unknown;
    privateKeyPem: string;
    keyId: string;
  }) =>
    | { ok: true; bundle: unknown; payloadCanonicalSha256: string }
    | { ok: false; errors: string[] };
  validateCutoverEvidenceManifest: (payload: unknown) => { ok: boolean; errors?: string[] };
  hashCanonicalCutoverEvidencePayload: (payload: unknown) => string;
};

const scope = {
  organizationId: 'org-cli',
  vehicleId: 'veh-cli',
  provider: 'DIMO',
};

describe('PROV-CLI ops signer trust-root parity', () => {
  afterEach(() => {
    disableP25CutoverRuntimeEnv();
    clearP25TestEvidencePublicKeyring();
  });

  it('PROV-CLI1 — valid ops-signed manifest verifies VALID', () => {
    const keyMaterial = configureP25TestEvidencePublicKeyring();
    enableP25CutoverRuntimeEnv(P25_TEST_CUTOVER_BUILD);
    const now = new Date();
    const payload = buildDefaultCutoverEvidencePayload(scope, {
      bundleId: 'bundle-cli-e2e',
      issuer: 'ops-cli-test',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      capableBuildId: P25_TEST_CUTOVER_BUILD,
      fleetReplicaCount: 1,
    });

    const signed = opsLib.signCutoverEvidenceManifest({
      payload,
      privateKeyPem: keyMaterial.privateKeyPem!,
      keyId: keyMaterial.keyId,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const verification = verifyPhysicalStateCutoverEvidence({
      scope,
      bundle: signed.bundle as ReturnType<typeof buildValidSignedCutoverEvidenceBundleForScope>,
      now,
      publicKeyring: {
        keys: [
          {
            keyId: keyMaterial.keyId,
            algorithm: 'Ed25519',
            publicKey: keyMaterial.publicKeyPem,
          },
        ],
      },
      env: {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      },
    });
    expect(verification.status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.VALID);
  });

  it('PROV-CLI2 — CLI/runtime canonical digest identical', () => {
    const keyMaterial = getP25TestEvidenceKeyMaterial();
    const now = new Date();
    const payload = buildDefaultCutoverEvidencePayload(scope, {
      bundleId: 'bundle-cli-digest',
      issuer: 'ops-cli-test',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      capableBuildId: P25_TEST_CUTOVER_BUILD,
    });

    const opsDigest = opsLib.hashCanonicalCutoverEvidencePayload(payload);
    const runtimeDigest = hashCanonicalCutoverEvidencePayload(payload);
    expect(opsDigest).toBe(runtimeDigest);

    const runtimeSigned = signPhysicalStateCutoverEvidenceBundle({
      keyId: keyMaterial.keyId,
      privateKeyPem: keyMaterial.privateKeyPem!,
      payload,
    });
    const opsSigned = opsLib.signCutoverEvidenceManifest({
      payload,
      privateKeyPem: keyMaterial.privateKeyPem!,
      keyId: keyMaterial.keyId,
    });
    expect(opsSigned.ok).toBe(true);
    if (!opsSigned.ok) return;
    expect(opsSigned.payloadCanonicalSha256).toBe(runtimeSigned.payloadCanonicalSha256);
  });

  it('PROV-CLI3 — semantically invalid manifest refused before signing', () => {
    const keyMaterial = getP25TestEvidenceKeyMaterial();
    const now = new Date();
    const payload = buildDefaultCutoverEvidencePayload(scope, {
      bundleId: 'bundle-cli-invalid',
      issuer: 'ops-cli-test',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      capableBuildId: P25_TEST_CUTOVER_BUILD,
    });
    const invalid = {
      ...payload,
      preseedRevalidation: {
        ...payload.preseedRevalidation,
        decision: 'NO_EVIDENCE' as 'WOULD_ESTABLISH',
      },
    };

    const validation = opsLib.validateCutoverEvidenceManifest(invalid);
    expect(validation.ok).toBe(false);

    const signed = opsLib.signCutoverEvidenceManifest({
      payload: invalid,
      privateKeyPem: keyMaterial.privateKeyPem!,
      keyId: keyMaterial.keyId,
    });
    expect(signed.ok).toBe(false);
  });
});
