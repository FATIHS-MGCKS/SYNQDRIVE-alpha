'use strict';
const { createHash, createPrivateKey, sign } = require('node:crypto');

/**
 * Shared canonical serialization + manifest semantic validation for P2.5 cutover evidence.
 * Consumed by runtime (via createRequire), ops CLI, and parity tests — single trust root.
 */

const SCHEMA_VERSION = '1';
const ALGORITHM = 'Ed25519';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const VALID_PRESEED_DECISION = 'WOULD_ESTABLISH';
const VALID_REPLICA_ROLES = new Set(['REQUEST', 'WORKER', 'SCHEDULER']);

const CUTOVER_EVIDENCE_ARTIFACT_RESULT = {
  TARGET_APPROVAL: 'APPROVED',
  PRESEED_DRY_RUN: 'PASS',
  UNEXPLAINED_EXPORT: 'PASS',
  MIXED_REPLICA_VERIFY: 'PASS',
  RUNTIME_BUILD: 'PASS',
};

const KNOWN_CLASSIFICATIONS = new Set([
  'MATCH',
  'EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT',
  'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT',
  'OLD_ACCEPT_NEW_REJECT_EXPECTED',
  'UNEXPLAINED_OLD_ACCEPT_NEW_REJECT',
  'STATE_DIVERGENCE_CORRECTNESS_UNKNOWN',
  'BINDING_DIVERGENCE',
  'TIMESTAMP_DIVERGENCE',
  'CONFLICT',
]);

const CORRECTNESS_BLOCKING = new Set([
  'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT',
  'UNEXPLAINED_OLD_ACCEPT_NEW_REJECT',
  'STATE_DIVERGENCE_CORRECTNESS_UNKNOWN',
  'BINDING_DIVERGENCE',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalizeCutoverEvidenceValue(value) {
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('non_finite_number');
    }
    if (Object.is(value, -0)) {
      return '0';
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeCutoverEvidenceValue(item)).join(',')}]`;
  }
  if (valueType === 'object') {
    const record = value;
    const keys = Object.keys(record).sort();
    if (keys.length !== new Set(keys).size) {
      throw new Error('duplicate_object_keys');
    }
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalizeCutoverEvidenceValue(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('unsupported_canonical_value');
}

function canonicalizeCutoverEvidencePayload(payload) {
  return canonicalizeCutoverEvidenceValue(payload);
}

function hashCanonicalCutoverEvidencePayload(payload) {
  const canonical = canonicalizeCutoverEvidencePayload(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function assertCanonicalIso8601Utc(value) {
  if (!ISO_8601_UTC.test(value)) {
    throw new Error('non_canonical_timestamp');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('invalid_timestamp');
  }
  return new Date(parsed).toISOString();
}

function validateScope(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(`${label}_scope_missing`);
    return null;
  }
  if (!isNonEmptyString(value.organizationId)) errors.push(`${label}_organization_missing`);
  if (!isNonEmptyString(value.vehicleId)) errors.push(`${label}_vehicle_missing`);
  if (!isNonEmptyString(value.provider)) errors.push(`${label}_provider_missing`);
  return value;
}

function scopesEqual(a, b) {
  return (
    a.organizationId === b.organizationId &&
    a.vehicleId === b.vehicleId &&
    a.provider === b.provider
  );
}

function validateArtifactRef(artifact, label, errors, expectedScope) {
  if (!artifact || typeof artifact !== 'object') {
    errors.push(`${label}_artifact_missing`);
    return;
  }
  if (!isNonEmptyString(artifact.artifactId)) errors.push(`${label}_artifact_id_missing`);
  if (!SHA256_HEX.test(String(artifact.sha256 ?? ''))) errors.push(`${label}_artifact_sha256_invalid`);
  if (!isNonEmptyString(artifact.observedAt)) errors.push(`${label}_artifact_observed_at_missing`);
  if (!isNonEmptyString(artifact.result)) errors.push(`${label}_artifact_result_missing`);

  if (!artifact.scope || typeof artifact.scope !== 'object') {
    errors.push(`${label}_artifact_scope_missing`);
    return;
  }
  const artifactScope = validateScope(artifact.scope, `${label}_artifact`, errors);
  if (artifactScope && expectedScope && !scopesEqual(artifactScope, expectedScope)) {
    errors.push(`${label}_artifact_scope_mismatch`);
  }
}

function validateReplica(replica, index, errors) {
  if (!replica || typeof replica !== 'object') {
    errors.push(`replica_${index}_missing`);
    return null;
  }
  if (!isNonEmptyString(replica.replicaId)) errors.push(`replica_${index}_id_missing`);
  if (!isNonEmptyString(replica.buildId)) errors.push(`replica_${index}_build_missing`);
  if (!VALID_REPLICA_ROLES.has(replica.role)) errors.push(`replica_${index}_role_invalid`);
  if (replica.port !== undefined && replica.port !== null && typeof replica.port !== 'number') {
    errors.push(`replica_${index}_port_invalid`);
  }
  return replica;
}

function computeCutoverReplicaPeerSetDigest(replicas) {
  const ordered = [...replicas].sort((left, right) => left.replicaId.localeCompare(right.replicaId));
  const descriptors = ordered.map(
    (replica) =>
      `${replica.replicaId}:${replica.role}:${replica.buildId.trim()}:${replica.port ?? ''}`,
  );
  return createHash('sha256').update(descriptors.join('|'), 'utf8').digest('hex');
}

function validateClassificationSummary(summary, comparisonCount, reportedBlockingCount, errors) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    errors.push('classification_summary_missing');
    return;
  }

  let totalCount = 0;
  let derivedBlockingCount = 0;
  for (const [key, count] of Object.entries(summary)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      errors.push(`classification_count_invalid:${key}`);
      continue;
    }
    if (!KNOWN_CLASSIFICATIONS.has(key)) {
      errors.push(`unknown_classification:${key}`);
      continue;
    }
    totalCount += count;
    if (CORRECTNESS_BLOCKING.has(key)) {
      derivedBlockingCount += count;
    }
  }

  if (totalCount !== comparisonCount) {
    errors.push('classification_total_mismatch');
  }
  if (derivedBlockingCount !== reportedBlockingCount) {
    errors.push('classification_blocking_count_mismatch');
  }
}

function validateTimestampField(value, label, errors, options = {}) {
  if (!isNonEmptyString(value)) {
    errors.push(`${label}_missing`);
    return null;
  }
  try {
    const canonical = assertCanonicalIso8601Utc(value);
    const ms = Date.parse(canonical);
    if (!Number.isFinite(ms)) {
      errors.push(`${label}_unparseable`);
      return null;
    }
    if (options.disallowFuture !== false && options.nowMs !== undefined && ms > options.nowMs) {
      errors.push(`${label}_in_future`);
    }
    return { canonical, ms };
  } catch {
    errors.push(`${label}_non_canonical`);
    return null;
  }
}

function validateCutoverEvidenceManifest(payload, options = {}) {
  const enforceWallClock = options.enforceWallClock !== false;
  const nowMs = options.nowMs ?? Date.now();
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['payload_missing'] };
  }

  const required = [
    'bundleId',
    'issuedAt',
    'expiresAt',
    'issuer',
    'scope',
    'targetApproval',
    'preseedRevalidation',
    'unexplainedObservation',
    'mixedReplica',
    'runtimeBuild',
  ];
  for (const field of required) {
    if (!payload[field]) {
      errors.push(`manifest_missing_field:${field}`);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (!isNonEmptyString(payload.bundleId)) errors.push('bundle_id_missing');
  if (!isNonEmptyString(payload.issuer)) errors.push('issuer_missing');

  const scope = validateScope(payload.scope, 'payload', errors);
  if (!scope) {
    return { ok: false, errors };
  }

  const issuedAt = validateTimestampField(payload.issuedAt, 'issued_at', errors, {
    nowMs,
    disallowFuture: enforceWallClock,
  });
  const expiresAt = validateTimestampField(payload.expiresAt, 'expires_at', errors, {
    nowMs,
    disallowFuture: false,
  });
  if (issuedAt && expiresAt && expiresAt.ms <= issuedAt.ms) {
    errors.push('expires_at_before_issued_at');
  }
  if (enforceWallClock && expiresAt && expiresAt.ms < nowMs) {
    errors.push('bundle_expired');
  }

  const targetApproval = payload.targetApproval;
  if (
    !targetApproval ||
    targetApproval.status !== 'APPROVED' ||
    !isNonEmptyString(targetApproval.approvedBy) ||
    !targetApproval.scope ||
    !scopesEqual(targetApproval.scope, scope)
  ) {
    errors.push('target_approval_shape_invalid');
  } else {
    validateArtifactRef(targetApproval.artifact, 'target_approval', errors, scope);
    if (
      targetApproval.artifact?.result &&
      targetApproval.artifact.result !== CUTOVER_EVIDENCE_ARTIFACT_RESULT.TARGET_APPROVAL
    ) {
      errors.push('target_approval_artifact_result_invalid');
    }
    validateTimestampField(targetApproval.approvedAt, 'target_approved_at', errors, {
      nowMs,
      disallowFuture: enforceWallClock,
    });
  }

  const preseed = payload.preseedRevalidation;
  if (
    !preseed ||
    preseed.dryRun !== true ||
    preseed.zeroMutation !== true ||
    preseed.conflictCount !== 0 ||
    preseed.decision !== VALID_PRESEED_DECISION ||
    !preseed.scope ||
    !scopesEqual(preseed.scope, scope)
  ) {
    errors.push('preseed_semantics_invalid');
  } else {
    validateArtifactRef(preseed.artifact, 'preseed', errors, scope);
    if (
      preseed.artifact?.result &&
      preseed.artifact.result !== CUTOVER_EVIDENCE_ARTIFACT_RESULT.PRESEED_DRY_RUN
    ) {
      errors.push('preseed_artifact_result_invalid');
    }
    validateTimestampField(preseed.executedAt, 'preseed_executed_at', errors, {
      nowMs,
      disallowFuture: enforceWallClock,
    });
  }

  const unexplained = payload.unexplainedObservation;
  if (
    !unexplained ||
    typeof unexplained.comparisonCount !== 'number' ||
    !Number.isInteger(unexplained.comparisonCount) ||
    unexplained.comparisonCount <= 0 ||
    typeof unexplained.correctnessBlockingCount !== 'number' ||
    !Number.isInteger(unexplained.correctnessBlockingCount)
  ) {
    errors.push('unexplained_shape_invalid');
  } else {
    validateArtifactRef(unexplained.artifact, 'unexplained', errors, scope);
    if (
      unexplained.artifact?.result &&
      unexplained.artifact.result !== CUTOVER_EVIDENCE_ARTIFACT_RESULT.UNEXPLAINED_EXPORT
    ) {
      errors.push('unexplained_artifact_result_invalid');
    }
    validateClassificationSummary(
      unexplained.classificationSummary,
      unexplained.comparisonCount,
      unexplained.correctnessBlockingCount,
      errors,
    );
    const windowStart = validateTimestampField(
      unexplained.observationWindowStart,
      'unexplained_window_start',
      errors,
      { nowMs, disallowFuture: enforceWallClock },
    );
    const windowEnd = validateTimestampField(
      unexplained.observationWindowEnd,
      'unexplained_window_end',
      errors,
      { nowMs, disallowFuture: enforceWallClock },
    );
    validateTimestampField(unexplained.generatedAt, 'unexplained_generated_at', errors, {
      nowMs,
      disallowFuture: enforceWallClock,
    });
    if (windowStart && windowEnd && windowEnd.ms <= windowStart.ms) {
      errors.push('unexplained_window_invalid');
    }
  }

  const mixedReplica = payload.mixedReplica;
  if (
    !mixedReplica ||
    mixedReplica.allReplicasCapable !== true ||
    !Array.isArray(mixedReplica.replicas) ||
    mixedReplica.replicas.length === 0
  ) {
    errors.push('mixed_replica_shape_invalid');
  } else {
    const replicaIds = new Set();
    for (let index = 0; index < mixedReplica.replicas.length; index += 1) {
      const replica = validateReplica(mixedReplica.replicas[index], index, errors);
      if (replica) {
        if (replicaIds.has(replica.replicaId)) {
          errors.push(`duplicate_replica_id:${replica.replicaId}`);
        }
        replicaIds.add(replica.replicaId);
      }
    }
    validateArtifactRef(mixedReplica.artifact, 'mixed_replica', errors, scope);
    if (
      mixedReplica.artifact?.result &&
      mixedReplica.artifact.result !== CUTOVER_EVIDENCE_ARTIFACT_RESULT.MIXED_REPLICA_VERIFY
    ) {
      errors.push('mixed_replica_artifact_result_invalid');
    }
    const signedDigest = computeCutoverReplicaPeerSetDigest(mixedReplica.replicas);
    if (mixedReplica.peerSetDigest !== signedDigest) {
      errors.push('mixed_replica_peer_set_digest_mismatch');
    }
    validateTimestampField(mixedReplica.verifiedAt, 'mixed_replica_verified_at', errors, {
      nowMs,
      disallowFuture: enforceWallClock,
    });
  }

  const runtimeBuild = payload.runtimeBuild;
  if (
    !runtimeBuild ||
    !isNonEmptyString(runtimeBuild.capableBuildId) ||
    !isNonEmptyString(runtimeBuild.applicationBuildId)
  ) {
    errors.push('runtime_build_shape_invalid');
  } else {
    validateArtifactRef(runtimeBuild.artifact, 'runtime_build', errors, scope);
    if (
      runtimeBuild.artifact?.result &&
      runtimeBuild.artifact.result !== CUTOVER_EVIDENCE_ARTIFACT_RESULT.RUNTIME_BUILD
    ) {
      errors.push('runtime_build_artifact_result_invalid');
    }
    validateTimestampField(runtimeBuild.verifiedAt, 'runtime_build_verified_at', errors, {
      nowMs,
      disallowFuture: enforceWallClock,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

function signCutoverEvidenceManifest({ payload, privateKeyPem, keyId }) {
  const validation = validateCutoverEvidenceManifest(payload, { enforceWallClock: true });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const canonical = canonicalizeCutoverEvidencePayload(payload);
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
  const digest = hashCanonicalCutoverEvidencePayload(payload);

  return {
    ok: true,
    bundle: {
      schemaVersion: SCHEMA_VERSION,
      algorithm: ALGORITHM,
      keyId,
      payload,
      signature,
    },
    payloadCanonicalSha256: digest,
  };
}

module.exports = {
  SCHEMA_VERSION,
  ALGORITHM,
  CUTOVER_EVIDENCE_ARTIFACT_RESULT,
  canonicalizeCutoverEvidenceValue,
  canonicalizeCutoverEvidencePayload,
  hashCanonicalCutoverEvidencePayload,
  computeCutoverReplicaPeerSetDigest,
  validateCutoverEvidenceManifest,
  signCutoverEvidenceManifest,
};
