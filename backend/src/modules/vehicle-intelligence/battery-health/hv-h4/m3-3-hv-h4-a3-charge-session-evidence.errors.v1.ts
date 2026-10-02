export class H4InvalidSourceRevisionFingerprintError extends Error {
  readonly code = 'H4_INVALID_SOURCE_REVISION_FINGERPRINT';

  constructor(message = 'sourceRevisionFingerprint must be 64 lowercase hex chars') {
    super(message);
    this.name = 'H4InvalidSourceRevisionFingerprintError';
  }
}

export class H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError extends Error {
  readonly code = 'H4_SOURCE_REVISION_FINGERPRINT_COLLISION_OR_CANONICALIZATION_DRIFT';

  constructor(
    message = 'Versioned scientific identity collision with differing canonical evidence payload',
  ) {
    super(message);
    this.name = 'H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError';
  }
}

export class H4EvidenceRevisionStoredFingerprintMismatchError extends Error {
  readonly code = 'H4_EVIDENCE_REVISION_STORED_FINGERPRINT_MISMATCH';

  constructor(
    message = 'Stored sourceRevisionFingerprint does not recompute from scientificEvidenceJson',
  ) {
    super(message);
    this.name = 'H4EvidenceRevisionStoredFingerprintMismatchError';
  }
}

export class H4EvidenceRevisionMirrorIncoherenceError extends Error {
  readonly code = 'H4_EVIDENCE_REVISION_MIRROR_INCOHERENCE';

  constructor(message = 'Persisted DB mirror columns incoherent with scientificEvidenceJson') {
    super(message);
    this.name = 'H4EvidenceRevisionMirrorIncoherenceError';
  }
}

export class H4EvidenceAckIdentityMismatchError extends Error {
  readonly code = 'H4_EVIDENCE_ACK_IDENTITY_MISMATCH';

  constructor(message = 'Durability ACK identity mirrors disagree with referenced revision') {
    super(message);
    this.name = 'H4EvidenceAckIdentityMismatchError';
  }
}

export class H4EvidenceRevisionIdempotencyConflictRowNotFoundError extends Error {
  readonly code = 'H4_EVIDENCE_REVISION_IDEMPOTENCY_CONFLICT_ROW_NOT_FOUND';

  constructor(
    message = 'Unique collision on evidence revision insert but existing row not found',
  ) {
    super(message);
    this.name = 'H4EvidenceRevisionIdempotencyConflictRowNotFoundError';
  }
}

export class H4EvidenceAckIdempotencyConflictRowNotFoundError extends Error {
  readonly code = 'H4_EVIDENCE_ACK_IDEMPOTENCY_CONFLICT_ROW_NOT_FOUND';

  constructor(message = 'Unique collision on durability ACK insert but existing row not found') {
    super(message);
    this.name = 'H4EvidenceAckIdempotencyConflictRowNotFoundError';
  }
}
