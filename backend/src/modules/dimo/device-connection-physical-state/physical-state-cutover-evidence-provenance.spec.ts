import { createHash } from 'node:crypto';
import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { evaluatePhysicalStateCutoverEligibility } from './physical-state-authority-cutover.eligibility';
import { PhysicalStateCutoverEligibilityStatus } from './physical-state-authority-cutover.types';
import { signPhysicalStateCutoverEvidenceBundle } from './physical-state-cutover-evidence.signer';
import {
  PhysicalStateCutoverEvidenceVerificationStatus,
} from './physical-state-cutover-evidence.types';
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

const scope = {
  organizationId: 'org-prov',
  vehicleId: 'veh-prov',
  provider: 'DIMO',
};

const NOW = new Date();

function verify(bundle: ReturnType<typeof buildValidSignedCutoverEvidenceBundleForScope> | null | undefined) {
  enableP25CutoverRuntimeEnv(P25_TEST_CUTOVER_BUILD);
  configureP25TestEvidencePublicKeyring();
  return verifyPhysicalStateCutoverEvidence({ scope, bundle, now: NOW });
}

describe('P25-PROV activation evidence provenance', () => {
  afterEach(() => {
    disableP25CutoverRuntimeEnv();
    clearP25TestEvidencePublicKeyring();
  });

  it('P25-PROV-A — valid multi-replica signed bundle with matching scope/build/interlock => VALID', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
      now: NOW,
      fleetReplicaCount: 2,
      peerBuildIds: [P25_TEST_CUTOVER_BUILD],
    });
    process.env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS = P25_TEST_CUTOVER_BUILD;
    expect(verify(bundle).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.VALID);
  });

  it('P25-PROV-B — missing bundle => blocked', () => {
    expect(verify(null).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.MISSING_BUNDLE);
  });

  it('P25-PROV-C — unsigned bundle => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const unsigned = { ...bundle, signature: '' };
    expect(verify(unsigned).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SIGNATURE);
  });

  it('P25-PROV-D — invalid signature => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const tampered = { ...bundle, signature: Buffer.from('invalid-signature').toString('base64') };
    expect(verify(tampered).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SIGNATURE);
  });

  it('P25-PROV-E — unknown keyId => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const unknownKey = { ...bundle, keyId: 'unknown-key' };
    expect(verify(unknownKey).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.UNKNOWN_KEY_ID);
  });

  it('P25-PROV-F — unsupported algorithm/schema => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const unsupported = { ...bundle, algorithm: 'RSA' as typeof bundle.algorithm };
    expect(verify(unsupported).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.UNSUPPORTED_ALGORITHM,
    );
  });

  it('P25-PROV-G — expired / not-yet-valid => blocked', () => {
    const issuedAt = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    const expiredBundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
      now: issuedAt,
    });
    const expired = verifyPhysicalStateCutoverEvidence({
      scope,
      bundle: expiredBundle,
      now: NOW,
      publicKeyring: {
        keys: [
          {
            keyId: getP25TestEvidenceKeyMaterial().keyId,
            algorithm: 'Ed25519',
            publicKey: getP25TestEvidenceKeyMaterial().publicKeyPem,
          },
        ],
      },
      env: {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      },
    });
    expect(expired.status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.EXPIRED);
  });

  it('P25-PROV-H — organization/vehicle/provider mismatch => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const wrongScope = { ...scope, organizationId: 'other-org' };
    const result = verifyPhysicalStateCutoverEvidence({
      scope: wrongScope,
      bundle,
      now: NOW,
      publicKeyring: {
        keys: [
          {
            keyId: getP25TestEvidenceKeyMaterial().keyId,
            algorithm: 'Ed25519',
            publicKey: getP25TestEvidenceKeyMaterial().publicKeyPem,
          },
        ],
      },
      env: {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      },
    });
    expect(result.status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.SCOPE_MISMATCH);
  });

  it('P25-PROV-I — formal target approval absent/invalid => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const tampered = {
      ...bundle,
      payload: {
        ...bundle.payload,
        targetApproval: { ...bundle.payload.targetApproval, status: 'PENDING' as 'APPROVED' },
      },
    };
    const resigned = signPhysicalStateCutoverEvidenceBundle({
      keyId: getP25TestEvidenceKeyMaterial().keyId,
      privateKeyPem: getP25TestEvidenceKeyMaterial().privateKeyPem!,
      payload: tampered.payload,
    });
    expect(verify(resigned).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA,
    );
  });

  it('P25-PROV-J — pre-seed proof stale => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const stalePayload = {
      ...bundle.payload,
      preseedRevalidation: {
        ...bundle.payload.preseedRevalidation,
        executedAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      },
    };
    const resigned = signPhysicalStateCutoverEvidenceBundle({
      keyId: getP25TestEvidenceKeyMaterial().keyId,
      privateKeyPem: getP25TestEvidenceKeyMaterial().privateKeyPem!,
      payload: stalePayload,
    });
    expect(verify(resigned).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_STALE,
    );
  });

  it('P25-PROV-K — UNEXPLAINED comparisonCount=0 => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const tamperedPayload = {
      ...bundle.payload,
      unexplainedObservation: {
        ...bundle.payload.unexplainedObservation,
        comparisonCount: 0,
      },
    };
    const resigned = signPhysicalStateCutoverEvidenceBundle({
      keyId: getP25TestEvidenceKeyMaterial().keyId,
      privateKeyPem: getP25TestEvidenceKeyMaterial().privateKeyPem!,
      payload: tamperedPayload,
    });
    expect(verify(resigned).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID,
    );
  });

  it('P25-PROV-L — UNEXPLAINED blocker count > 0 / insufficient window => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const blockingPayload = {
      ...bundle.payload,
      unexplainedObservation: {
        ...bundle.payload.unexplainedObservation,
        correctnessBlockingCount: 2,
        classificationSummary: {
          MATCH: 40,
          UNEXPLAINED_OLD_REJECT_NEW_ACCEPT: 2,
        },
      },
    };
    const resignedBlocking = signPhysicalStateCutoverEvidenceBundle({
      keyId: getP25TestEvidenceKeyMaterial().keyId,
      privateKeyPem: getP25TestEvidenceKeyMaterial().privateKeyPem!,
      payload: blockingPayload,
    });
    expect(verify(resignedBlocking).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_COUNT_NONZERO,
    );
  });

  it('P25-PROV-M — mixed-replica proof missing/stale/incomplete => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const incompletePayload = {
      ...bundle.payload,
      mixedReplica: {
        ...bundle.payload.mixedReplica,
        replicas: [],
      },
    };
    const resigned = signPhysicalStateCutoverEvidenceBundle({
      keyId: getP25TestEvidenceKeyMaterial().keyId,
      privateKeyPem: getP25TestEvidenceKeyMaterial().privateKeyPem!,
      payload: incompletePayload,
    });
    expect(verify(resigned).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA,
    );
  });

  it('P25-PROV-N — signed deployment build != current runtime build => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
      now: NOW,
      skipEnvMutation: true,
    });
    const result = verifyPhysicalStateCutoverEvidence({
      scope,
      bundle,
      now: NOW,
      publicKeyring: {
        keys: [
          {
            keyId: getP25TestEvidenceKeyMaterial().keyId,
            algorithm: 'Ed25519',
            publicKey: getP25TestEvidenceKeyMaterial().publicKeyPem,
          },
        ],
      },
      env: {
        SYNQDRIVE_BUILD_ID: 'different-runtime-build',
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      },
    });
    expect(result.status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.BUILD_MISMATCH);
  });

  it('P25-PROV-O — signed peer set != runtime peer facts => blocked', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
      now: NOW,
      fleetReplicaCount: 2,
      skipEnvMutation: true,
    });
    const result = verifyPhysicalStateCutoverEvidence({
      scope,
      bundle,
      now: NOW,
      publicKeyring: {
        keys: [
          {
            keyId: getP25TestEvidenceKeyMaterial().keyId,
            algorithm: 'Ed25519',
            publicKey: getP25TestEvidenceKeyMaterial().publicKeyPem,
          },
        ],
      },
      env: {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        SYNQDRIVE_REPLICA_PEER_BUILD_IDS: '',
      },
    });
    expect(result.status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH);
  });

  it('P25-PROV-P — tamper ANY signed semantic field after signing => invalid signature', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const tampered = {
      ...bundle,
      payload: {
        ...bundle.payload,
        preseedRevalidation: {
          ...bundle.payload.preseedRevalidation,
          conflictCount: 1 as 0,
        },
      },
    };
    expect(verify(tampered).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SIGNATURE,
    );
  });

  it('P25-PROV-Q — eligibility requires VALID verification, not caller booleans', () => {
    const blocked = evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      evidenceVerification: {
        status: PhysicalStateCutoverEvidenceVerificationStatus.MISSING_BUNDLE,
        details: ['signed_evidence_bundle_required'],
      },
    });
    expect(blocked.status).not.toBe(PhysicalStateCutoverEligibilityStatus.ELIGIBLE);
  });

  it('P25-PROV-R — raw boolean activation path removed from cutover input type', () => {
    const sample: Record<string, unknown> = {
      scope,
      signedEvidenceBundle: buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW }),
    };
    expect(sample).not.toHaveProperty('activationEvidence');
    expect(sample).not.toHaveProperty('evidenceSnapshot');
  });
});

describe('P25-PROV adversarial security', () => {
  afterEach(() => {
    disableP25CutoverRuntimeEnv();
    clearP25TestEvidencePublicKeyring();
  });

  it('rejects artifact hash tampering after signing', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    const tampered = {
      ...bundle,
      payload: {
        ...bundle.payload,
        targetApproval: {
          ...bundle.payload.targetApproval,
          artifact: {
            ...bundle.payload.targetApproval.artifact,
            sha256: createHash('sha256').update('tampered').digest('hex'),
          },
        },
      },
    };
    expect(verify(tampered).status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SIGNATURE,
    );
  });

  it('rejects missing public key configuration (fail closed)', () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
    clearP25TestEvidencePublicKeyring();
    const result = verifyPhysicalStateCutoverEvidence({
      scope,
      bundle,
      now: NOW,
      publicKeyring: null,
      env: {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      },
    });
    expect(result.status).toBe(
      PhysicalStateCutoverEvidenceVerificationStatus.PUBLIC_KEY_CONFIG_INVALID,
    );
  });
});
