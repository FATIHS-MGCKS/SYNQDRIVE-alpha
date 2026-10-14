export type DiV0TripSpeedQualityProjectionErrorCode =
  | 'WORK_ITEM_NOT_FOUND'
  | 'TENANT_SCOPE_MISMATCH'
  | 'WORK_ITEM_NOT_ELIGIBLE'
  | 'WORK_ITEM_SUPERSEDED'
  | 'NOT_ACTIVE_PRIMARY'
  | 'MISSING_SHADOW_RUN'
  | 'MISSING_PINNED_SNAPSHOT'
  | 'SNAPSHOT_VERIFICATION_FAILED'
  | 'SHADOW_INTERVALS_MISSING'
  | 'UNSUPPORTED_CALIBRATION_VERSION'
  | 'PERSIST_AUTHORITY_REJECTED'
  | 'IDEMPOTENCY_CONTENT_MISMATCH';

export type DiV0TripSpeedQualityProjectionPersistenceErrorCode =
  | 'IDEMPOTENCY_CONTENT_MISMATCH'
  | 'PERSIST_AUTHORITY_REJECTED'
  | 'CURRENT_SCOPE_CONFLICT';

export class DiV0TripSpeedQualityProjectionError extends Error {
  readonly code: DiV0TripSpeedQualityProjectionErrorCode;

  constructor(code: DiV0TripSpeedQualityProjectionErrorCode, message: string) {
    super(`DI_V0_TRIP_SPEED_QUALITY:${code}:${message}`);
    this.name = 'DiV0TripSpeedQualityProjectionError';
    this.code = code;
  }
}

export class DiV0TripSpeedQualityProjectionPersistenceError extends Error {
  readonly code: DiV0TripSpeedQualityProjectionPersistenceErrorCode;

  constructor(code: DiV0TripSpeedQualityProjectionPersistenceErrorCode, message: string) {
    super(`DI_V0_TRIP_SPEED_QUALITY:${code}:${message}`);
    this.name = 'DiV0TripSpeedQualityProjectionPersistenceError';
    this.code = code;
  }
}

export function mapPersistAuthorityError(error: unknown): DiV0TripSpeedQualityProjectionError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('IDEMPOTENCY_CONTENT_MISMATCH')) {
    return new DiV0TripSpeedQualityProjectionError('IDEMPOTENCY_CONTENT_MISMATCH', message);
  }
  return new DiV0TripSpeedQualityProjectionError('PERSIST_AUTHORITY_REJECTED', message);
}
