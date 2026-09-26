import { createHash } from 'crypto';
import type { DiV0ShadowRunIdentity } from './di-v0-shadow-types';

/**
 * Deterministic run idempotency key — stable across retries/replicas for the same
 * trip, version tuple, and input evidence identity. New calibration/estimator
 * versions produce a new key and therefore a new run row.
 */
export function buildDiV0ShadowRunIdempotencyKey(identity: DiV0ShadowRunIdentity): string {
  const payload = [
    identity.tripId,
    identity.sourceFamily,
    identity.versions.structuralVersion,
    identity.versions.estimatorVersion,
    identity.versions.calibrationVersion,
    identity.versions.sourceFamilyPolicyVersion,
    identity.inputEvidenceVersion,
  ].join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
