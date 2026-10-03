import {
  H4EvidenceAckIdempotencyConflictRowNotFoundError,
  H4EvidenceAckIdentityMismatchError,
  H4EvidenceEffectiveRevisionAmbiguityError,
  H4EvidenceRevisionIdempotencyConflictRowNotFoundError,
  H4EvidenceRevisionMirrorIncoherenceError,
  H4EvidenceRevisionMissingDurabilityAckError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
  H4EvidenceUnsupportedContractVersionError,
  H4InvalidSourceRevisionFingerprintError,
  H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';

/** Typed H4 durable-evidence integrity failures — fail closed per row, not generic ERROR. */
export function isH4EvidenceIntegrityFailureV1(err: unknown): boolean {
  return (
    err instanceof H4EvidenceRevisionStoredFingerprintMismatchError ||
    err instanceof H4EvidenceAckIdempotencyConflictRowNotFoundError ||
    err instanceof H4EvidenceRevisionIdempotencyConflictRowNotFoundError ||
    err instanceof H4EvidenceAckIdentityMismatchError ||
    err instanceof H4EvidenceRevisionMirrorIncoherenceError ||
    err instanceof H4InvalidSourceRevisionFingerprintError ||
    err instanceof H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError ||
    err instanceof H4EvidenceRevisionMissingDurabilityAckError ||
    err instanceof H4EvidenceEffectiveRevisionAmbiguityError ||
    err instanceof H4EvidenceUnsupportedContractVersionError
  );
}
