export const LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN = /^[0-9a-f]{64}$/;

export class InvalidProfileFingerprintError extends Error {
  readonly code = 'INVALID_PROFILE_FINGERPRINT' as const;

  constructor(message = 'Invalid longitudinal profile fingerprint format') {
    super(message);
    this.name = 'InvalidProfileFingerprintError';
  }
}

export class ProfileFingerprintCollisionOrCanonicalizationDriftError extends Error {
  readonly code = 'PROFILE_FINGERPRINT_COLLISION_OR_CANONICALIZATION_DRIFT' as const;

  constructor(
    message = 'Fingerprint unique key matched but canonical scientific payload differed',
  ) {
    super(message);
    this.name = 'ProfileFingerprintCollisionOrCanonicalizationDriftError';
  }
}

export class ProfileFingerprintPayloadMismatchError extends Error {
  readonly code = 'PROFILE_FINGERPRINT_PAYLOAD_MISMATCH' as const;

  constructor(
    message = 'Supplied canonical profile fingerprint does not match scientificProfileJson payload',
  ) {
    super(message);
    this.name = 'ProfileFingerprintPayloadMismatchError';
  }
}

export class ProfileMaterializedMetadataDriftError extends Error {
  readonly code = 'PROFILE_MATERIALIZED_METADATA_DRIFT' as const;

  constructor(
    message = 'Canonical scientific payload matched but mirrored relational metadata differed',
  ) {
    super(message);
    this.name = 'ProfileMaterializedMetadataDriftError';
  }
}

export class ProfileIdempotencyConflictRowNotFoundError extends Error {
  readonly code = 'PROFILE_IDEMPOTENCY_CONFLICT_ROW_NOT_FOUND' as const;

  constructor(
    message = 'ON CONFLICT returned no row but exact scientific identity lookup found no row',
  ) {
    super(message);
    this.name = 'ProfileIdempotencyConflictRowNotFoundError';
  }
}
