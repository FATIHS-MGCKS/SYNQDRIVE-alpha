import { createHash } from 'node:crypto';
import type { CutoverEvidencePublicKeyring } from '@config/connectivity-physical-state-cutover-evidence.config';
import { loadCutoverEvidencePublicKeyring } from '@config/connectivity-physical-state-cutover-evidence.config';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import {
  canonicalizeCutoverEvidencePayload,
  hashCanonicalCutoverEvidencePayload,
} from './physical-state-cutover-evidence.canonical';
import { verifyEd25519Payload } from './physical-state-cutover-evidence.crypto';
import {
  CUTOVER_EVIDENCE_MIN_UNEXPLAINED_OBSERVATION_MS,
  CUTOVER_EVIDENCE_MIXED_REPLICA_MAX_AGE_MS,
  CUTOVER_EVIDENCE_PRESEED_MAX_AGE_MS,
} from './physical-state-cutover-evidence.policy';
import {
  PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM,
  PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION,
  PhysicalStateCutoverEvidenceArtifactRef,
  PhysicalStateCutoverEvidenceVerificationStatus,
  PhysicalStateCutoverEvidenceVerificationResult,
  SignedPhysicalStateCutoverEvidenceBundle,
} from './physical-state-cutover-evidence.types';
import {
  evaluateMixedReplicaCutoverInterlock,
  loadMixedReplicaInterlockFromEnv,
  parseReplicaPeerBuildIds,
} from './physical-state-cutover-mixed-replica-interlock';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export type VerifyCutoverEvidenceInput = {
  scope: PhysicalAuthorityScope;
  bundle?: SignedPhysicalStateCutoverEvidenceBundle | null;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  publicKeyring?: CutoverEvidencePublicKeyring | null;
};

function fail(
  status: Exclude<
    PhysicalStateCutoverEvidenceVerificationStatus,
    PhysicalStateCutoverEvidenceVerificationStatus.VALID
  >,
  details: string[],
): PhysicalStateCutoverEvidenceVerificationResult {
  return { status, details };
}

function scopesEqual(a: PhysicalAuthorityScope, b: PhysicalAuthorityScope): boolean {
  return (
    a.organizationId === b.organizationId &&
    a.vehicleId === b.vehicleId &&
    a.provider === b.provider
  );
}

function parseIsoMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function validateArtifactRef(
  artifact: PhysicalStateCutoverEvidenceArtifactRef | undefined,
): string[] {
  const errors: string[] = [];
  if (!artifact || typeof artifact !== 'object') {
    errors.push('artifact_missing');
    return errors;
  }
  if (!artifact.artifactId?.trim()) errors.push('artifact_id_missing');
  if (!SHA256_HEX.test(artifact.sha256 ?? '')) errors.push('artifact_sha256_invalid');
  if (!artifact.observedAt?.trim()) errors.push('artifact_observed_at_missing');
  if (!artifact.result?.trim()) errors.push('artifact_result_missing');
  return errors;
}

function isSignedBundleShape(value: unknown): value is SignedPhysicalStateCutoverEvidenceBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as SignedPhysicalStateCutoverEvidenceBundle;
  return (
    typeof bundle.schemaVersion === 'string' &&
    typeof bundle.algorithm === 'string' &&
    typeof bundle.keyId === 'string' &&
    typeof bundle.signature === 'string' &&
    bundle.payload !== null &&
    typeof bundle.payload === 'object'
  );
}

function computePeerSetDigest(buildIds: readonly string[]): string {
  const sorted = [...buildIds].sort();
  return createHash('sha256').update(sorted.join('|'), 'utf8').digest('hex');
}

export function verifyPhysicalStateCutoverEvidence(
  input: VerifyCutoverEvidenceInput,
): PhysicalStateCutoverEvidenceVerificationResult {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  if (!input.bundle) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.MISSING_BUNDLE, [
      'signed_evidence_bundle_required',
    ]);
  }

  if (!isSignedBundleShape(input.bundle)) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA, [
      'bundle_shape_invalid',
    ]);
  }

  const bundle = input.bundle;

  if (bundle.schemaVersion !== PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNSUPPORTED_SCHEMA_VERSION, [
      `unsupported_schema_version:${String(bundle.schemaVersion)}`,
    ]);
  }

  if (bundle.algorithm !== PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNSUPPORTED_ALGORITHM, [
      `unsupported_algorithm:${String(bundle.algorithm)}`,
    ]);
  }

  const keyring = input.publicKeyring ?? loadCutoverEvidencePublicKeyring(env);
  if (!keyring) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.PUBLIC_KEY_CONFIG_INVALID, [
      'missing_or_invalid_public_keyring',
    ]);
  }

  const keyEntry = keyring.keys.find((entry) => entry.keyId === bundle.keyId);
  if (!keyEntry) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNKNOWN_KEY_ID, [
      `unknown_key_id:${bundle.keyId}`,
    ]);
  }

  let canonicalPayload: string;
  let payloadCanonicalSha256: string;
  try {
    canonicalPayload = canonicalizeCutoverEvidencePayload(bundle.payload);
    payloadCanonicalSha256 = hashCanonicalCutoverEvidencePayload(bundle.payload);
  } catch (error) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA, [
      `canonicalization_failed:${error instanceof Error ? error.message : 'unknown'}`,
    ]);
  }

  const signatureValid = verifyEd25519Payload(
    Buffer.from(canonicalPayload, 'utf8'),
    bundle.signature,
    keyEntry.publicKey,
  );
  if (!signatureValid) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SIGNATURE, [
      'signature_verification_failed',
    ]);
  }

  const payload = bundle.payload;
  const issuedAtMs = parseIsoMs(payload.issuedAt);
  const expiresAtMs = parseIsoMs(payload.expiresAt);
  if (issuedAtMs === null || expiresAtMs === null) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA, [
      'invalid_bundle_timestamps',
    ]);
  }
  if (nowMs < issuedAtMs) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.NOT_YET_VALID, [
      'bundle_not_yet_valid',
    ]);
  }
  if (nowMs > expiresAtMs) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.EXPIRED, ['bundle_expired']);
  }

  if (!scopesEqual(input.scope, payload.scope)) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.SCOPE_MISMATCH, [
      'input_scope_mismatch_signed_payload',
    ]);
  }

  const artifactErrors = [
    ...validateArtifactRef(payload.targetApproval?.artifact),
    ...validateArtifactRef(payload.preseedRevalidation?.artifact),
    ...validateArtifactRef(payload.unexplainedObservation?.artifact),
    ...validateArtifactRef(payload.mixedReplica?.artifact),
    ...validateArtifactRef(payload.runtimeBuild?.artifact),
  ];
  if (artifactErrors.length > 0) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.ARTIFACT_REFERENCE_INVALID, artifactErrors);
  }

  if (
    payload.targetApproval?.status !== 'APPROVED' ||
    !scopesEqual(input.scope, payload.targetApproval.scope)
  ) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.TARGET_NOT_APPROVED, [
      'target_approval_missing_or_invalid',
    ]);
  }

  const preseed = payload.preseedRevalidation;
  if (
    !preseed ||
    preseed.dryRun !== true ||
    preseed.zeroMutation !== true ||
    preseed.conflictCount !== 0 ||
    !scopesEqual(input.scope, preseed.scope)
  ) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID, [
      'preseed_proof_semantics_invalid',
    ]);
  }
  const preseedExecutedAtMs = parseIsoMs(preseed.executedAt);
  if (preseedExecutedAtMs === null || nowMs - preseedExecutedAtMs > CUTOVER_EVIDENCE_PRESEED_MAX_AGE_MS) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_STALE, [
      'preseed_proof_stale_or_invalid_timestamp',
    ]);
  }

  const unexplained = payload.unexplainedObservation;
  const windowStartMs = parseIsoMs(unexplained?.observationWindowStart ?? '');
  const windowEndMs = parseIsoMs(unexplained?.observationWindowEnd ?? '');
  const generatedAtMs = parseIsoMs(unexplained?.generatedAt ?? '');
  if (windowStartMs === null || windowEndMs === null || generatedAtMs === null) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
      'unexplained_timestamps_invalid',
    ]);
  }
  if (windowEndMs <= windowStartMs) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
      'unexplained_window_invalid',
    ]);
  }
  if (windowEndMs - windowStartMs < CUTOVER_EVIDENCE_MIN_UNEXPLAINED_OBSERVATION_MS) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.OBSERVATION_WINDOW_INSUFFICIENT, [
      'unexplained_observation_window_insufficient',
    ]);
  }
  if (!unexplained || unexplained.comparisonCount <= 0) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
      'unexplained_comparison_count_zero',
    ]);
  }
  if (unexplained.correctnessBlockingCount !== 0) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_COUNT_NONZERO, [
      'unexplained_correctness_blocking_count_nonzero',
    ]);
  }

  const mixedReplica = payload.mixedReplica;
  const mixedVerifiedAtMs = parseIsoMs(mixedReplica?.verifiedAt ?? '');
  if (
    !mixedReplica ||
    mixedReplica.allReplicasCapable !== true ||
    !Array.isArray(mixedReplica.replicas) ||
    mixedReplica.replicas.length === 0 ||
    mixedVerifiedAtMs === null ||
    nowMs - mixedVerifiedAtMs > CUTOVER_EVIDENCE_MIXED_REPLICA_MAX_AGE_MS
  ) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.MIXED_REPLICA_PROOF_INVALID, [
      'mixed_replica_proof_missing_or_stale',
    ]);
  }

  const runtimeBuild = payload.runtimeBuild;
  const runtimeVerifiedAtMs = parseIsoMs(runtimeBuild?.verifiedAt ?? '');
  if (
    !runtimeBuild ||
    !runtimeBuild.capableBuildId?.trim() ||
    !runtimeBuild.applicationBuildId?.trim() ||
    runtimeVerifiedAtMs === null
  ) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.BUILD_MISMATCH, [
      'runtime_build_proof_invalid',
    ]);
  }

  const requiredCapableBuildId =
    env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID?.trim() ?? '';
  const currentBuildId = env.SYNQDRIVE_BUILD_ID ?? env.SYNQDRIVE_BUILD_SHA ?? '';
  const localPeers = parseReplicaPeerBuildIds(env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS);

  if (
    mixedReplica.capableBuildId !== requiredCapableBuildId ||
    runtimeBuild.capableBuildId !== requiredCapableBuildId ||
    runtimeBuild.applicationBuildId !== currentBuildId ||
    mixedReplica.deploymentBuildId !== requiredCapableBuildId
  ) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.BUILD_MISMATCH, [
      'signed_build_identity_mismatch_runtime',
    ]);
  }

  for (const replica of mixedReplica.replicas) {
    if (!replica.buildId?.trim() || replica.buildId !== requiredCapableBuildId) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.MIXED_REPLICA_PROOF_INVALID, [
        `replica_not_capable:${replica.replicaId}`,
      ]);
    }
  }

  const signedReplicaBuildIds = mixedReplica.replicas.map((replica) => replica.buildId);
  const signedPeerDigest = computePeerSetDigest(signedReplicaBuildIds);
  if (mixedReplica.peerSetDigest !== signedPeerDigest) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, [
      'signed_peer_set_digest_mismatch',
    ]);
  }

  if (mixedReplica.replicas.length > 1) {
    if (localPeers.length === 0) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, [
        'empty_local_peer_list_cannot_attest_fleet',
      ]);
    }
    const localPeerDigest = computePeerSetDigest([currentBuildId.trim(), ...localPeers]);
    if (localPeerDigest !== signedPeerDigest && signedPeerDigest !== computePeerSetDigest(localPeers)) {
      const expectedFromSignedReplicas = computePeerSetDigest(signedReplicaBuildIds);
      const runtimePeerSet = computePeerSetDigest(
        [...new Set([currentBuildId.trim(), ...localPeers])].sort(),
      );
      if (runtimePeerSet !== expectedFromSignedReplicas) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, [
          'runtime_peer_set_mismatch_signed_attestation',
        ]);
      }
    }
  }

  const interlock = evaluateMixedReplicaCutoverInterlock(loadMixedReplicaInterlockFromEnv(env));
  if (!interlock.safe) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.RUNTIME_INTERLOCK_UNSAFE, interlock.details);
  }

  return {
    status: PhysicalStateCutoverEvidenceVerificationStatus.VALID,
    bundle,
    payloadCanonicalSha256,
    scope: input.scope,
  };
}
