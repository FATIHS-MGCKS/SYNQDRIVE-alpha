import { createPublicKey } from 'node:crypto';
import { parseCutoverEvidencePublicKeyring } from '@config/connectivity-physical-state-cutover-evidence.config';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import { computeCutoverReplicaPeerSetDigest } from './physical-state-cutover-evidence.peer-digest';
import { signPhysicalStateCutoverEvidenceBundle } from './physical-state-cutover-evidence.signer';
import {
  PhysicalStateCutoverEvidencePayloadV1,
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
  organizationId: 'org-sec',
  vehicleId: 'veh-sec',
  provider: 'DIMO',
};

const NOW = new Date('2026-09-15T12:00:00.000Z');

function verifyEnv(
  bundle: ReturnType<typeof buildValidSignedCutoverEvidenceBundleForScope>,
  env: NodeJS.ProcessEnv,
) {
  configureP25TestEvidencePublicKeyring();
  return verifyPhysicalStateCutoverEvidence({
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
    env,
  });
}

function resign(payload: PhysicalStateCutoverEvidencePayloadV1) {
  return signPhysicalStateCutoverEvidenceBundle({
    keyId: getP25TestEvidenceKeyMaterial().keyId,
    privateKeyPem: getP25TestEvidenceKeyMaterial().privateKeyPem!,
    payload,
  });
}

describe('supplementary provenance security closure', () => {
  afterEach(() => {
    disableP25CutoverRuntimeEnv();
    clearP25TestEvidencePublicKeyring();
  });

  describe('PROV-S preseed decision validation', () => {
    it('PROV-S1 — WOULD_ESTABLISH accepted', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
        now: NOW,
        fleetReplicaCount: 2,
        peerBuildIds: [P25_TEST_CUTOVER_BUILD],
      });
      expect(verifyEnv(bundle, {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        SYNQDRIVE_REPLICA_PEER_BUILD_IDS: P25_TEST_CUTOVER_BUILD,
      }).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.VALID);
    });

    it('PROV-S2 — INSUFFICIENT_EVIDENCE blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        preseedRevalidation: {
          ...bundle.payload.preseedRevalidation,
          decision: 'INSUFFICIENT_EVIDENCE' as 'WOULD_ESTABLISH',
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      }).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID);
    });

    it('PROV-S3 — conflict outcome blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        preseedRevalidation: {
          ...bundle.payload.preseedRevalidation,
          conflictCount: 1 as 0,
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      }).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA);
    });

    it('PROV-S4 — unknown decision string blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        preseedRevalidation: {
          ...bundle.payload.preseedRevalidation,
          decision: 'ARBITRARY' as 'WOULD_ESTABLISH',
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      }).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID);
    });
  });

  describe('PROV-MR multi-replica peer digest', () => {
    const multiReplicaEnv = {
      SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      SYNQDRIVE_REPLICA_PEER_BUILD_IDS: P25_TEST_CUTOVER_BUILD,
    };

    it('PROV-MR1 — 2 replicas same build with complete peer list => VALID', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
        now: NOW,
        fleetReplicaCount: 2,
        skipEnvMutation: true,
      });
      expect(verifyEnv(bundle, multiReplicaEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.VALID,
      );
    });

    it('PROV-MR2 — missing peer => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
        now: NOW,
        fleetReplicaCount: 2,
        skipEnvMutation: true,
      });
      expect(
        verifyEnv(bundle, {
          ...multiReplicaEnv,
          SYNQDRIVE_REPLICA_PEER_BUILD_IDS: '',
        }).status,
      ).toBe(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH);
    });

    it('PROV-MR3 — extra peer => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
        now: NOW,
        fleetReplicaCount: 2,
        skipEnvMutation: true,
      });
      expect(
        verifyEnv(bundle, {
          ...multiReplicaEnv,
          SYNQDRIVE_REPLICA_PEER_BUILD_IDS: `${P25_TEST_CUTOVER_BUILD},extra-peer`,
        }).status,
      ).toBe(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH);
    });

    it('PROV-MR4 — same build but wrong fleet cardinality digest => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
        now: NOW,
        fleetReplicaCount: 2,
        skipEnvMutation: true,
      });
      const oneReplicaDigest = computeCutoverReplicaPeerSetDigest([
        bundle.payload.mixedReplica.replicas[0],
      ]);
      const payload = {
        ...bundle.payload,
        mixedReplica: {
          ...bundle.payload.mixedReplica,
          peerSetDigest: oneReplicaDigest,
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, multiReplicaEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH,
      );
    });

    it('PROV-MR5 — duplicate replicaId => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, {
        now: NOW,
        fleetReplicaCount: 2,
        skipEnvMutation: true,
      });
      const payload = {
        ...bundle.payload,
        mixedReplica: {
          ...bundle.payload.mixedReplica,
          replicas: [
            bundle.payload.mixedReplica.replicas[0],
            { ...bundle.payload.mixedReplica.replicas[0] },
          ],
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, multiReplicaEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA,
      );
    });
  });

  describe('PROV-T timestamp fail-closed', () => {
    const baseEnv = {
      SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
    };

    it('PROV-T1 — future preseed timestamp => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
      const payload = {
        ...bundle.payload,
        preseedRevalidation: {
          ...bundle.payload.preseedRevalidation,
          executedAt: future,
          artifact: {
            ...bundle.payload.preseedRevalidation.artifact,
            observedAt: future,
          },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID,
      );
    });

    it('PROV-T2 — future mixed-replica verifiedAt => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
      const payload = {
        ...bundle.payload,
        mixedReplica: {
          ...bundle.payload.mixedReplica,
          verifiedAt: future,
          artifact: { ...bundle.payload.mixedReplica.artifact, observedAt: future },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.MIXED_REPLICA_PROOF_INVALID,
      );
    });

    it('PROV-T3 — future observation window => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const payload = {
        ...bundle.payload,
        unexplainedObservation: {
          ...bundle.payload.unexplainedObservation,
          observationWindowEnd: future,
          generatedAt: future,
          artifact: { ...bundle.payload.unexplainedObservation.artifact, observedAt: future },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID,
      );
    });

    it('PROV-T4 — future target approval => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
      const payload = {
        ...bundle.payload,
        targetApproval: {
          ...bundle.payload.targetApproval,
          approvedAt: future,
          artifact: { ...bundle.payload.targetApproval.artifact, observedAt: future },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.TARGET_NOT_APPROVED,
      );
    });

    it('PROV-T5 — non-canonical timezone string => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        issuedAt: '2026-09-15T12:00:00+00:00',
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA,
      );
    });

    it('PROV-T6 — expiresAt before issuedAt => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        expiresAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA,
      );
    });
  });

  describe('PROV-C signed payload internal consistency', () => {
    const baseEnv = {
      SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
    };

    it('PROV-C1 — contradictory classification summary => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        unexplainedObservation: {
          ...bundle.payload.unexplainedObservation,
          correctnessBlockingCount: 0,
          classificationSummary: {
            MATCH: 40,
            [PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT]: 2,
          },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_COUNT_NONZERO,
      );
    });

    it('PROV-C2 — classification counts do not sum => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        unexplainedObservation: {
          ...bundle.payload.unexplainedObservation,
          comparisonCount: 10,
          classificationSummary: { MATCH: 5 },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID,
      );
    });

    it('PROV-C3 — unknown classification key => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        unexplainedObservation: {
          ...bundle.payload.unexplainedObservation,
          classificationSummary: { UNKNOWN_CLASS: 42 },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID,
      );
    });

    it('PROV-C4 — artifact scope mismatch => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        preseedRevalidation: {
          ...bundle.payload.preseedRevalidation,
          artifact: {
            ...bundle.payload.preseedRevalidation.artifact,
            scope: { ...scope, organizationId: 'other-org' },
          },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA,
      );
    });

    it('PROV-C5 — target approvedBy empty => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        targetApproval: {
          ...bundle.payload.targetApproval,
          approvedBy: '   ',
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA,
      );
    });

    it('PROV-C6 — artifact FAIL while wrapper PASS => blocked', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = {
        ...bundle.payload,
        preseedRevalidation: {
          ...bundle.payload.preseedRevalidation,
          artifact: {
            ...bundle.payload.preseedRevalidation.artifact,
            result: 'FAIL',
          },
        },
      };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, baseEnv).status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID,
      );
    });
  });

  describe('malformed payload and keyring hardening', () => {
    it('malformed signed payload missing preseed => INVALID_SCHEMA', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const payload = { ...bundle.payload, preseedRevalidation: {} as typeof bundle.payload.preseedRevalidation };
      const resigned = resign(payload);
      expect(verifyEnv(resigned, {
        SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
      }).status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID);
    });

    it('duplicate keyId in keyring => PUBLIC_KEY_CONFIG_INVALID', () => {
      const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope, { now: NOW });
      const key = getP25TestEvidenceKeyMaterial();
      const duplicateRing = parseCutoverEvidencePublicKeyring(
        JSON.stringify({
          keys: [
            { keyId: key.keyId, algorithm: 'Ed25519', publicKey: key.publicKeyPem },
            { keyId: key.keyId, algorithm: 'Ed25519', publicKey: key.publicKeyPem },
          ],
        }),
      );
      expect(duplicateRing).toBeNull();
      const result = verifyPhysicalStateCutoverEvidence({
        scope,
        bundle,
        now: NOW,
        publicKeyring: duplicateRing,
        env: {
          SYNQDRIVE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
          CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID: P25_TEST_CUTOVER_BUILD,
        },
      });
      expect(result.status).toBe(
        PhysicalStateCutoverEvidenceVerificationStatus.PUBLIC_KEY_CONFIG_INVALID,
      );
    });

    it('malformed PEM in keyring => PUBLIC_KEY_CONFIG_INVALID', () => {
      const malformed = parseCutoverEvidencePublicKeyring(
        JSON.stringify({
          keys: [{ keyId: 'bad', algorithm: 'Ed25519', publicKey: 'not-a-pem' }],
        }),
      );
      expect(malformed).toBeNull();
    });

    it('valid PEM parsing sanity', () => {
      const key = getP25TestEvidenceKeyMaterial();
      expect(() => createPublicKey(key.publicKeyPem)).not.toThrow();
    });
  });
});
