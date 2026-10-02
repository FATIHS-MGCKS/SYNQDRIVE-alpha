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
