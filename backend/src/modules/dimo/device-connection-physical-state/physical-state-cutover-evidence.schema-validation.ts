import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import type {
  PhysicalStateCutoverEvidencePayloadV1,
  PhysicalStateCutoverReplicaAttestationV1,
  SignedPhysicalStateCutoverEvidenceBundle,
} from './physical-state-cutover-evidence.types';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const VALID_REPLICA_ROLES = new Set(['REQUEST', 'WORKER', 'SCHEDULER']);
const VALID_PRESEED_DECISION = 'WOULD_ESTABLISH';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateScope(value: unknown, label: string, errors: string[]): PhysicalAuthorityScope | null {
  if (!value || typeof value !== 'object') {
    errors.push(`${label}_scope_missing`);
    return null;
  }
  const scope = value as PhysicalAuthorityScope;
  if (!isNonEmptyString(scope.organizationId)) errors.push(`${label}_organization_missing`);
  if (!isNonEmptyString(scope.vehicleId)) errors.push(`${label}_vehicle_missing`);
  if (!isNonEmptyString(scope.provider)) errors.push(`${label}_provider_missing`);
  return scope;
}

function scopesEqual(a: PhysicalAuthorityScope, b: PhysicalAuthorityScope): boolean {
  return (
    a.organizationId === b.organizationId &&
    a.vehicleId === b.vehicleId &&
    a.provider === b.provider
  );
}

function validateArtifactRef(
  artifact: unknown,
  label: string,
  errors: string[],
  expectedScope?: PhysicalAuthorityScope,
): void {
  if (!artifact || typeof artifact !== 'object') {
    errors.push(`${label}_artifact_missing`);
    return;
  }
  const ref = artifact as Record<string, unknown>;
  if (!isNonEmptyString(ref.artifactId)) errors.push(`${label}_artifact_id_missing`);
  if (!SHA256_HEX.test(String(ref.sha256 ?? ''))) errors.push(`${label}_artifact_sha256_invalid`);
  if (!isNonEmptyString(ref.observedAt)) errors.push(`${label}_artifact_observed_at_missing`);
  if (!isNonEmptyString(ref.result)) errors.push(`${label}_artifact_result_missing`);
  if (expectedScope && ref.scope) {
    const artifactScope = validateScope(ref.scope, `${label}_artifact`, errors);
    if (artifactScope && !scopesEqual(artifactScope, expectedScope)) {
      errors.push(`${label}_artifact_scope_mismatch`);
    }
  }
}

function validateReplica(
  replica: unknown,
  index: number,
  errors: string[],
): PhysicalStateCutoverReplicaAttestationV1 | null {
  if (!replica || typeof replica !== 'object') {
    errors.push(`replica_${index}_missing`);
    return null;
  }
  const record = replica as PhysicalStateCutoverReplicaAttestationV1;
  if (!isNonEmptyString(record.replicaId)) errors.push(`replica_${index}_id_missing`);
  if (!isNonEmptyString(record.buildId)) errors.push(`replica_${index}_build_missing`);
  if (!VALID_REPLICA_ROLES.has(record.role)) errors.push(`replica_${index}_role_invalid`);
  if (record.port !== undefined && record.port !== null && typeof record.port !== 'number') {
    errors.push(`replica_${index}_port_invalid`);
  }
  return record;
}

export function validateSignedCutoverEvidencePayloadShape(
  payload: unknown,
): { ok: true; payload: PhysicalStateCutoverEvidencePayloadV1 } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['payload_missing'] };
  }

  const record = payload as Record<string, unknown>;
  if (!isNonEmptyString(record.bundleId)) errors.push('bundle_id_missing');
  if (!isNonEmptyString(record.issuedAt)) errors.push('issued_at_missing');
  if (!isNonEmptyString(record.expiresAt)) errors.push('expires_at_missing');
  if (!isNonEmptyString(record.issuer)) errors.push('issuer_missing');

  const scope = validateScope(record.scope, 'payload', errors);
  if (!scope) {
    return { ok: false, errors };
  }

  if (!record.targetApproval) errors.push('target_approval_missing');
  if (!record.preseedRevalidation) errors.push('preseed_revalidation_missing');
  if (!record.unexplainedObservation) errors.push('unexplained_observation_missing');
  if (!record.mixedReplica) errors.push('mixed_replica_missing');
  if (!record.runtimeBuild) errors.push('runtime_build_missing');

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const typed = payload as PhysicalStateCutoverEvidencePayloadV1;

  validateArtifactRef(typed.targetApproval?.artifact, 'target_approval', errors, scope);
  validateArtifactRef(typed.preseedRevalidation?.artifact, 'preseed', errors, scope);

  const preseed = typed.preseedRevalidation;
  if (!preseed || preseed.dryRun !== true || preseed.zeroMutation !== true || preseed.conflictCount !== 0) {
    errors.push('preseed_semantics_invalid');
  }
  if (!preseed?.scope || !scopesEqual(preseed.scope, scope)) {
    errors.push('preseed_scope_mismatch');
  }
  if (preseed?.decision !== VALID_PRESEED_DECISION) {
    errors.push(`preseed_decision_invalid:${String(preseed?.decision)}`);
  }

  const unexplained = typed.unexplainedObservation;
  if (
    !unexplained ||
    typeof unexplained.comparisonCount !== 'number' ||
    !Number.isInteger(unexplained.comparisonCount) ||
    typeof unexplained.correctnessBlockingCount !== 'number' ||
    !Number.isInteger(unexplained.correctnessBlockingCount) ||
    !unexplained.classificationSummary ||
    typeof unexplained.classificationSummary !== 'object' ||
    Array.isArray(unexplained.classificationSummary)
  ) {
    errors.push('unexplained_shape_invalid');
  } else {
    validateArtifactRef(unexplained.artifact, 'unexplained', errors);
  }

  const mixedReplica = typed.mixedReplica;
  if (
    !mixedReplica ||
    mixedReplica.allReplicasCapable !== true ||
    !Array.isArray(mixedReplica.replicas)
  ) {
    errors.push('mixed_replica_shape_invalid');
  } else if (mixedReplica.replicas.length === 0) {
    errors.push('mixed_replica_empty');
  } else {
    const replicaIds = new Set<string>();
    for (let index = 0; index < mixedReplica.replicas.length; index += 1) {
      const replica = validateReplica(mixedReplica.replicas[index], index, errors);
      if (replica) {
        if (replicaIds.has(replica.replicaId)) {
          errors.push(`duplicate_replica_id:${replica.replicaId}`);
        }
        replicaIds.add(replica.replicaId);
      }
    }
    validateArtifactRef(mixedReplica.artifact, 'mixed_replica', errors);
  }

  const runtimeBuild = typed.runtimeBuild;
  if (
    !runtimeBuild ||
    !isNonEmptyString(runtimeBuild.capableBuildId) ||
    !isNonEmptyString(runtimeBuild.applicationBuildId)
  ) {
    errors.push('runtime_build_shape_invalid');
  } else {
    validateArtifactRef(runtimeBuild.artifact, 'runtime_build', errors);
  }

  const targetApproval = typed.targetApproval;
  if (
    !targetApproval ||
    targetApproval.status !== 'APPROVED' ||
    !isNonEmptyString(targetApproval.approvedBy) ||
    !targetApproval.scope ||
    !scopesEqual(targetApproval.scope, scope)
  ) {
    errors.push('target_approval_shape_invalid');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, payload: typed };
}

export function isSignedBundleEnvelopeShape(
  value: unknown,
): value is SignedPhysicalStateCutoverEvidenceBundle {
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
