import type { CutoverEvidencePublicKeyring } from '@config/connectivity-physical-state-cutover-evidence.config';
import { loadCutoverEvidencePublicKeyring } from '@config/connectivity-physical-state-cutover-evidence.config';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import { CUTOVER_EVIDENCE_ARTIFACT_RESULT } from './physical-state-cutover-evidence.artifact-semantics';
import { validateUnexplainedClassificationSummary } from './physical-state-cutover-evidence.classification-summary';
import {
  canonicalizeCutoverEvidencePayload,
  hashCanonicalCutoverEvidencePayload,
} from './physical-state-cutover-evidence.canonical';
import { verifyEd25519Payload } from './physical-state-cutover-evidence.crypto';
import { computeCutoverReplicaPeerSetDigest } from './physical-state-cutover-evidence.peer-digest';
import {
  CUTOVER_EVIDENCE_MIN_UNEXPLAINED_OBSERVATION_MS,
  CUTOVER_EVIDENCE_MIXED_REPLICA_MAX_AGE_MS,
  CUTOVER_EVIDENCE_PRESEED_MAX_AGE_MS,
} from './physical-state-cutover-evidence.policy';
import {
  isSignedBundleEnvelopeShape,
  validateSignedCutoverEvidencePayloadShape,
} from './physical-state-cutover-evidence.schema-validation';
import { validateCutoverEvidenceTimestamp } from './physical-state-cutover-evidence.timestamps';
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

function validateArtifactSemantics(
  result: string,
  expected: string,
  label: string,
): string | null {
  if (result !== expected) {
    return `${label}_artifact_result_invalid:${result}`;
  }
  return null;
}

function validateArtifactScopeBinding(
  artifact: PhysicalStateCutoverEvidenceArtifactRef,
  expectedScope: PhysicalAuthorityScope,
  label: string,
): string | null {
  if (!artifact.scope || typeof artifact.scope !== 'object') {
    return `${label}_artifact_scope_missing`;
  }
  if (
    !artifact.scope.organizationId?.trim() ||
    !artifact.scope.vehicleId?.trim() ||
    !artifact.scope.provider?.trim()
  ) {
    return `${label}_artifact_scope_malformed`;
  }
  if (!scopesEqual(artifact.scope, expectedScope)) {
    return `${label}_artifact_scope_mismatch`;
  }
  return null;
}

function failArtifactScope(
  detail: string,
): PhysicalStateCutoverEvidenceVerificationResult {
  if (detail.endsWith('_artifact_scope_mismatch')) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.SCOPE_MISMATCH, [detail]);
  }
  return fail(PhysicalStateCutoverEvidenceVerificationStatus.ARTIFACT_REFERENCE_INVALID, [detail]);
}

export function verifyPhysicalStateCutoverEvidence(
  input: VerifyCutoverEvidenceInput,
): PhysicalStateCutoverEvidenceVerificationResult {
  try {
    const env = input.env ?? process.env;
    const now = input.now ?? new Date();
    const nowMs = now.getTime();

    if (!input.bundle) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.MISSING_BUNDLE, [
        'signed_evidence_bundle_required',
      ]);
    }

    if (!isSignedBundleEnvelopeShape(input.bundle)) {
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

    const payloadShape = validateSignedCutoverEvidencePayloadShape(bundle.payload);
    if (!payloadShape.ok) {
      const errors = payloadShape.errors;
      if (
        errors.some(
          (error) =>
            error === 'preseed_semantics_invalid' ||
            error.startsWith('preseed_decision_invalid') ||
            error === 'preseed_artifact_result_invalid',
        )
      ) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID, errors);
      }
      if (errors.some((error) => error.startsWith('duplicate_replica_id:'))) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA, errors);
      }
      if (errors.some((error) => error === 'mixed_replica_peer_set_digest_mismatch')) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, errors);
      }
      if (
        errors.some(
          (error) =>
            error === 'classification_blocking_count_mismatch' ||
            error === 'classification_blocking_count_nonzero',
        )
      ) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_COUNT_NONZERO, errors);
      }
      if (
        errors.some(
          (error) =>
            error === 'unexplained_shape_invalid' ||
            error === 'classification_total_mismatch' ||
            error.startsWith('unknown_classification:') ||
            error.startsWith('classification_count_invalid:'),
        )
      ) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, errors);
      }
      const scopeMismatch = errors.find((error) => error.endsWith('_artifact_scope_mismatch'));
      if (scopeMismatch) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.SCOPE_MISMATCH, errors);
      }
      const scopeMissing = errors.find((error) => error.endsWith('_artifact_scope_missing'));
      if (scopeMissing) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.ARTIFACT_REFERENCE_INVALID, errors);
      }
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA, errors);
    }

    const payload = payloadShape.payload;

    const issuedAt = validateCutoverEvidenceTimestamp(payload.issuedAt, nowMs);
    const expiresAt = validateCutoverEvidenceTimestamp(payload.expiresAt, nowMs, {
      disallowFuture: false,
    });
    if (!issuedAt.ok || !expiresAt.ok) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA, [
        !issuedAt.ok ? issuedAt.reason : 'issued_at_invalid',
        !expiresAt.ok ? expiresAt.reason : 'expires_at_invalid',
      ]);
    }
    if (issuedAt.ms > nowMs) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.NOT_YET_VALID, [
        'bundle_not_yet_valid',
      ]);
    }
    if (expiresAt.ms <= issuedAt.ms) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.INVALID_SCHEMA, [
        'expires_at_before_issued_at',
      ]);
    }
    if (nowMs > expiresAt.ms) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.EXPIRED, ['bundle_expired']);
    }

    if (!scopesEqual(input.scope, payload.scope)) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.SCOPE_MISMATCH, [
        'input_scope_mismatch_signed_payload',
      ]);
    }

    const targetApproval = payload.targetApproval;
    const approvedAt = validateCutoverEvidenceTimestamp(targetApproval.approvedAt, nowMs);
    const targetArtifactAt = validateCutoverEvidenceTimestamp(
      targetApproval.artifact.observedAt,
      nowMs,
    );
    if (!approvedAt.ok || !targetArtifactAt.ok) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.TARGET_NOT_APPROVED, [
        !approvedAt.ok ? approvedAt.reason : 'target_approved_at_invalid',
        !targetArtifactAt.ok ? targetArtifactAt.reason : 'target_artifact_observed_at_invalid',
      ]);
    }
    const targetArtifactError = validateArtifactSemantics(
      targetApproval.artifact.result,
      CUTOVER_EVIDENCE_ARTIFACT_RESULT.TARGET_APPROVAL,
      'target_approval',
    );
    if (targetArtifactError) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.ARTIFACT_REFERENCE_INVALID, [
        targetArtifactError,
      ]);
    }
    const targetArtifactScopeError = validateArtifactScopeBinding(
      targetApproval.artifact,
      input.scope,
      'target_approval',
    );
    if (targetArtifactScopeError) {
      return failArtifactScope(targetArtifactScopeError);
    }
    if (
      targetApproval.status !== 'APPROVED' ||
      !targetApproval.approvedBy?.trim() ||
      !scopesEqual(input.scope, targetApproval.scope)
    ) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.TARGET_NOT_APPROVED, [
        'target_approval_missing_or_invalid',
      ]);
    }

    const preseed = payload.preseedRevalidation;
    const preseedExecutedAt = validateCutoverEvidenceTimestamp(preseed.executedAt, nowMs, {
      maxAgeMs: CUTOVER_EVIDENCE_PRESEED_MAX_AGE_MS,
    });
    const preseedArtifactAt = validateCutoverEvidenceTimestamp(preseed.artifact.observedAt, nowMs, {
      maxAgeMs: CUTOVER_EVIDENCE_PRESEED_MAX_AGE_MS,
    });
    if (!preseedExecutedAt.ok || !preseedArtifactAt.ok) {
      const stale =
        (!preseedExecutedAt.ok && preseedExecutedAt.reason === 'timestamp_stale') ||
        (!preseedArtifactAt.ok && preseedArtifactAt.reason === 'timestamp_stale');
      return fail(
        stale
          ? PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_STALE
          : PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID,
        [
          !preseedExecutedAt.ok ? preseedExecutedAt.reason : 'preseed_executed_at_ok',
          !preseedArtifactAt.ok ? preseedArtifactAt.reason : 'preseed_artifact_observed_at_ok',
        ],
      );
    }
    const preseedArtifactError = validateArtifactSemantics(
      preseed.artifact.result,
      CUTOVER_EVIDENCE_ARTIFACT_RESULT.PRESEED_DRY_RUN,
      'preseed',
    );
    if (preseedArtifactError) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID, [
        preseedArtifactError,
      ]);
    }
    const preseedArtifactScopeError = validateArtifactScopeBinding(
      preseed.artifact,
      input.scope,
      'preseed',
    );
    if (preseedArtifactScopeError) {
      return failArtifactScope(preseedArtifactScopeError);
    }
    if (
      preseed.decision !== 'WOULD_ESTABLISH' ||
      preseed.dryRun !== true ||
      preseed.zeroMutation !== true ||
      preseed.conflictCount !== 0 ||
      !scopesEqual(input.scope, preseed.scope)
    ) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.PRESEED_PROOF_INVALID, [
        'preseed_proof_semantics_invalid',
      ]);
    }

    const unexplained = payload.unexplainedObservation;
    const windowStart = validateCutoverEvidenceTimestamp(
      unexplained.observationWindowStart,
      nowMs,
    );
    const windowEnd = validateCutoverEvidenceTimestamp(unexplained.observationWindowEnd, nowMs);
    const generatedAt = validateCutoverEvidenceTimestamp(unexplained.generatedAt, nowMs);
    const unexplainedArtifactAt = validateCutoverEvidenceTimestamp(
      unexplained.artifact.observedAt,
      nowMs,
    );
    if (!windowStart.ok || !windowEnd.ok || !generatedAt.ok || !unexplainedArtifactAt.ok) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
        !windowStart.ok ? windowStart.reason : 'window_start_ok',
        !windowEnd.ok ? windowEnd.reason : 'window_end_ok',
        !generatedAt.ok ? generatedAt.reason : 'generated_at_ok',
        !unexplainedArtifactAt.ok ? unexplainedArtifactAt.reason : 'unexplained_artifact_ok',
      ]);
    }
    if (windowEnd.ms <= windowStart.ms) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
        'unexplained_window_invalid',
      ]);
    }
    if (generatedAt.ms < windowEnd.ms) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
        'unexplained_generated_before_window_end',
      ]);
    }
    if (windowEnd.ms - windowStart.ms < CUTOVER_EVIDENCE_MIN_UNEXPLAINED_OBSERVATION_MS) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.OBSERVATION_WINDOW_INSUFFICIENT, [
        'unexplained_observation_window_insufficient',
      ]);
    }
    if (unexplained.comparisonCount <= 0) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
        'unexplained_comparison_count_zero',
      ]);
    }
    const classification = validateUnexplainedClassificationSummary(
      unexplained.classificationSummary,
      unexplained.comparisonCount,
      unexplained.correctnessBlockingCount,
    );
    if (classification.errors.length > 0) {
      const status = classification.derivedBlockingCount > 0
        ? PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_COUNT_NONZERO
        : PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID;
      return fail(status, classification.errors);
    }
    if (classification.derivedBlockingCount > 0 || unexplained.correctnessBlockingCount > 0) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_COUNT_NONZERO, [
        'unexplained_correctness_blocking_count_nonzero',
      ]);
    }
    const unexplainedArtifactError = validateArtifactSemantics(
      unexplained.artifact.result,
      CUTOVER_EVIDENCE_ARTIFACT_RESULT.UNEXPLAINED_EXPORT,
      'unexplained',
    );
    if (unexplainedArtifactError) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.UNEXPLAINED_PROOF_INVALID, [
        unexplainedArtifactError,
      ]);
    }
    const unexplainedArtifactScopeError = validateArtifactScopeBinding(
      unexplained.artifact,
      input.scope,
      'unexplained',
    );
    if (unexplainedArtifactScopeError) {
      return failArtifactScope(unexplainedArtifactScopeError);
    }

    const mixedReplica = payload.mixedReplica;
    const mixedVerifiedAt = validateCutoverEvidenceTimestamp(mixedReplica.verifiedAt, nowMs, {
      maxAgeMs: CUTOVER_EVIDENCE_MIXED_REPLICA_MAX_AGE_MS,
    });
    const mixedArtifactAt = validateCutoverEvidenceTimestamp(mixedReplica.artifact.observedAt, nowMs, {
      maxAgeMs: CUTOVER_EVIDENCE_MIXED_REPLICA_MAX_AGE_MS,
    });
    if (!mixedVerifiedAt.ok || !mixedArtifactAt.ok) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.MIXED_REPLICA_PROOF_INVALID, [
        !mixedVerifiedAt.ok ? mixedVerifiedAt.reason : 'mixed_verified_at_ok',
        !mixedArtifactAt.ok ? mixedArtifactAt.reason : 'mixed_artifact_ok',
      ]);
    }
    const mixedArtifactError = validateArtifactSemantics(
      mixedReplica.artifact.result,
      CUTOVER_EVIDENCE_ARTIFACT_RESULT.MIXED_REPLICA_VERIFY,
      'mixed_replica',
    );
    if (mixedArtifactError) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.MIXED_REPLICA_PROOF_INVALID, [
        mixedArtifactError,
      ]);
    }
    const mixedArtifactScopeError = validateArtifactScopeBinding(
      mixedReplica.artifact,
      input.scope,
      'mixed_replica',
    );
    if (mixedArtifactScopeError) {
      return failArtifactScope(mixedArtifactScopeError);
    }

    const runtimeBuild = payload.runtimeBuild;
    const runtimeVerifiedAt = validateCutoverEvidenceTimestamp(runtimeBuild.verifiedAt, nowMs);
    const runtimeArtifactAt = validateCutoverEvidenceTimestamp(
      runtimeBuild.artifact.observedAt,
      nowMs,
    );
    if (!runtimeVerifiedAt.ok || !runtimeArtifactAt.ok) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.BUILD_MISMATCH, [
        !runtimeVerifiedAt.ok ? runtimeVerifiedAt.reason : 'runtime_verified_at_ok',
        !runtimeArtifactAt.ok ? runtimeArtifactAt.reason : 'runtime_artifact_ok',
      ]);
    }
    const runtimeArtifactError = validateArtifactSemantics(
      runtimeBuild.artifact.result,
      CUTOVER_EVIDENCE_ARTIFACT_RESULT.RUNTIME_BUILD,
      'runtime_build',
    );
    if (runtimeArtifactError) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.BUILD_MISMATCH, [
        runtimeArtifactError,
      ]);
    }
    const runtimeArtifactScopeError = validateArtifactScopeBinding(
      runtimeBuild.artifact,
      input.scope,
      'runtime_build',
    );
    if (runtimeArtifactScopeError) {
      return failArtifactScope(runtimeArtifactScopeError);
    }

    const requiredCapableBuildId =
      env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID?.trim() ?? '';
    const currentBuildId = (env.SYNQDRIVE_BUILD_ID ?? env.SYNQDRIVE_BUILD_SHA ?? '').trim();
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

    const signedPeerDigest = computeCutoverReplicaPeerSetDigest(mixedReplica.replicas);
    if (mixedReplica.peerSetDigest !== signedPeerDigest) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, [
        'signed_peer_set_digest_mismatch',
      ]);
    }

    const expectedLocalPeerCount = mixedReplica.replicas.length - 1;
    if (localPeers.length !== expectedLocalPeerCount) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, [
        `local_peer_count_mismatch:expected=${expectedLocalPeerCount}:actual=${localPeers.length}`,
      ]);
    }
    if (mixedReplica.replicas.length > 1 && localPeers.length === 0) {
      return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, [
        'empty_local_peer_list_cannot_attest_fleet',
      ]);
    }
    for (const peer of localPeers) {
      if (peer !== currentBuildId) {
        return fail(PhysicalStateCutoverEvidenceVerificationStatus.PEER_SET_MISMATCH, [
          `peer_build_mismatch:${peer}`,
        ]);
      }
    }

    const interlock = evaluateMixedReplicaCutoverInterlock(loadMixedReplicaInterlockFromEnv(env));
    if (!interlock.safe) {
      return fail(
        PhysicalStateCutoverEvidenceVerificationStatus.RUNTIME_INTERLOCK_UNSAFE,
        interlock.details,
      );
    }

    return {
      status: PhysicalStateCutoverEvidenceVerificationStatus.VALID,
      bundle,
      payloadCanonicalSha256,
      scope: input.scope,
    };
  } catch (error) {
    return fail(PhysicalStateCutoverEvidenceVerificationStatus.OTHER_SAFETY_FAILURE, [
      `verifier_unhandled:${error instanceof Error ? error.message : 'unknown'}`,
    ]);
  }
}
