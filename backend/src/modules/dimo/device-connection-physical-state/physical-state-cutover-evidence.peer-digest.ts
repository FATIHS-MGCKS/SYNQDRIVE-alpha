import { createHash } from 'node:crypto';
import type { PhysicalStateCutoverReplicaAttestationV1 } from './physical-state-cutover-evidence.types';

/**
 * Canonical cardinality-preserving fleet peer-set digest.
 * Used by signer, verifier, ops tooling, and tests — single implementation only.
 */
export function computeCutoverReplicaPeerSetDigest(
  replicas: readonly PhysicalStateCutoverReplicaAttestationV1[],
): string {
  const ordered = [...replicas].sort((left, right) => left.replicaId.localeCompare(right.replicaId));
  const descriptors = ordered.map(
    (replica) =>
      `${replica.replicaId}:${replica.role}:${replica.buildId.trim()}:${replica.port ?? ''}`,
  );
  return createHash('sha256').update(descriptors.join('|'), 'utf8').digest('hex');
}
