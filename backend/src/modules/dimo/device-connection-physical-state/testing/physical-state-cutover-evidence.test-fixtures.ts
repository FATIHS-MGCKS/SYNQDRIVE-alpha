import { CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON_ENV } from '@config/connectivity-physical-state-cutover-evidence.config';
import type { PhysicalAuthorityScope } from '../device-connection-physical-authority-cutover.repository';
import { generateTestEd25519KeyPair, type Ed25519KeyMaterial } from '../physical-state-cutover-evidence.crypto';
import {
  buildDefaultCutoverEvidencePayload,
  signPhysicalStateCutoverEvidenceBundle,
} from '../physical-state-cutover-evidence.signer';
import type { SignedPhysicalStateCutoverEvidenceBundle } from '../physical-state-cutover-evidence.types';

export const P25_TEST_CUTOVER_BUILD = 'p25-test-build';
export const P25_TEST_EVIDENCE_KEY_ID = 'p25-test-evidence-key';

let cachedTestKeyMaterial: Ed25519KeyMaterial | null = null;

export function getP25TestEvidenceKeyMaterial(): Ed25519KeyMaterial {
  if (!cachedTestKeyMaterial) {
    cachedTestKeyMaterial = generateTestEd25519KeyPair(P25_TEST_EVIDENCE_KEY_ID);
  }
  return cachedTestKeyMaterial;
}

export function configureP25TestEvidencePublicKeyring(): Ed25519KeyMaterial {
  const keyMaterial = getP25TestEvidenceKeyMaterial();
  process.env[CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON_ENV] = JSON.stringify({
    keys: [
      {
        keyId: keyMaterial.keyId,
        algorithm: keyMaterial.algorithm,
        publicKey: keyMaterial.publicKeyPem,
      },
    ],
  });
  return keyMaterial;
}

export function clearP25TestEvidencePublicKeyring(): void {
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON_ENV];
}

export function enableP25CutoverRuntimeEnv(buildId: string = P25_TEST_CUTOVER_BUILD): void {
  process.env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID = buildId;
  process.env.SYNQDRIVE_BUILD_ID = buildId;
}

export function disableP25CutoverRuntimeEnv(): void {
  delete process.env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID;
  delete process.env.SYNQDRIVE_BUILD_ID;
  delete process.env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS;
}

export function buildValidSignedCutoverEvidenceBundleForScope(
  scope: PhysicalAuthorityScope,
  options?: {
    now?: Date;
    capableBuildId?: string;
    peerBuildIds?: readonly string[];
    fleetReplicaCount?: number;
    bundleId?: string;
    skipEnvMutation?: boolean;
  },
): SignedPhysicalStateCutoverEvidenceBundle {
  const keyMaterial = configureP25TestEvidencePublicKeyring();
  const now = options?.now ?? new Date();
  const capableBuildId = options?.capableBuildId ?? P25_TEST_CUTOVER_BUILD;
  const fleetReplicaCount = options?.fleetReplicaCount ?? 1;
  if (!options?.skipEnvMutation) {
    enableP25CutoverRuntimeEnv(capableBuildId);
    if (fleetReplicaCount > 1) {
      const peerEntries = options?.peerBuildIds ?? Array.from({ length: fleetReplicaCount - 1 }, () => capableBuildId);
      process.env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS = peerEntries.join(',');
    } else if (options?.peerBuildIds?.length) {
      process.env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS = options.peerBuildIds.join(',');
    }
  }

  const payload = buildDefaultCutoverEvidencePayload(scope, {
    bundleId: options?.bundleId ?? `bundle-${scope.vehicleId}`,
    issuer: 'p25-test-ops',
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    capableBuildId,
    fleetReplicaCount,
    preseedExecutedAt: now,
    unexplainedWindowEnd: now,
    unexplainedWindowStart: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
  });

  const signed = signPhysicalStateCutoverEvidenceBundle({
    keyId: keyMaterial.keyId,
    privateKeyPem: keyMaterial.privateKeyPem!,
    payload,
  });

  return {
    schemaVersion: signed.schemaVersion,
    algorithm: signed.algorithm,
    keyId: signed.keyId,
    payload: signed.payload,
    signature: signed.signature,
  };
}
