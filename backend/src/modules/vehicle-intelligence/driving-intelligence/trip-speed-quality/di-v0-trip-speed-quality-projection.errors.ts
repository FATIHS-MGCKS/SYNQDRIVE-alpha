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
  | 'UNSUPPORTED_MOTION_STATE'
  | 'PERSIST_AUTHORITY_REJECTED'
  | 'PERSIST_DATABASE_REJECTED'
  | 'IDEMPOTENCY_CONTENT_MISMATCH';

const PROJECTION_ERROR_CODES = new Set<DiV0TripSpeedQualityProjectionErrorCode>([
  'WORK_ITEM_NOT_FOUND',
  'TENANT_SCOPE_MISMATCH',
  'WORK_ITEM_NOT_ELIGIBLE',
  'WORK_ITEM_SUPERSEDED',
  'NOT_ACTIVE_PRIMARY',
  'MISSING_SHADOW_RUN',
  'MISSING_PINNED_SNAPSHOT',
  'SNAPSHOT_VERIFICATION_FAILED',
  'SHADOW_INTERVALS_MISSING',
  'UNSUPPORTED_CALIBRATION_VERSION',
  'UNSUPPORTED_MOTION_STATE',
  'PERSIST_AUTHORITY_REJECTED',
  'PERSIST_DATABASE_REJECTED',
  'IDEMPOTENCY_CONTENT_MISMATCH',
]);

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
  if (error instanceof DiV0TripSpeedQualityProjectionPersistenceError) {
    if (error.code === 'IDEMPOTENCY_CONTENT_MISMATCH') {
      return new DiV0TripSpeedQualityProjectionError('IDEMPOTENCY_CONTENT_MISMATCH', error.message);
    }
    if (error.code === 'CURRENT_SCOPE_CONFLICT') {
      return new DiV0TripSpeedQualityProjectionError('PERSIST_AUTHORITY_REJECTED', error.message);
    }
    return new DiV0TripSpeedQualityProjectionError('PERSIST_AUTHORITY_REJECTED', error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('IDEMPOTENCY_CONTENT_MISMATCH')) {
    return new DiV0TripSpeedQualityProjectionError('IDEMPOTENCY_CONTENT_MISMATCH', message);
  }
  return new DiV0TripSpeedQualityProjectionError('PERSIST_AUTHORITY_REJECTED', message);
}

/** Stable outbox / ops code; avoids UNKNOWN when `instanceof` fails across duplicate bundles. */
export function resolveDiV0TripSpeedQualityProjectionErrorCode(
  error: unknown,
): DiV0TripSpeedQualityProjectionErrorCode | 'UNKNOWN' {
  if (error instanceof DiV0TripSpeedQualityProjectionError) {
    return error.code;
  }
  if (error instanceof DiV0TripSpeedQualityProjectionPersistenceError) {
    if (error.code === 'IDEMPOTENCY_CONTENT_MISMATCH') {
      return 'IDEMPOTENCY_CONTENT_MISMATCH';
    }
    return 'PERSIST_AUTHORITY_REJECTED';
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string' && PROJECTION_ERROR_CODES.has(code as DiV0TripSpeedQualityProjectionErrorCode)) {
      return code as DiV0TripSpeedQualityProjectionErrorCode;
    }
    if (typeof code === 'string' && code.startsWith('P')) {
      return 'PERSIST_DATABASE_REJECTED';
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  const prefix = message.match(/^DI_V0_TRIP_SPEED_QUALITY:([A-Z0-9_]+):/);
  if (prefix && PROJECTION_ERROR_CODES.has(prefix[1] as DiV0TripSpeedQualityProjectionErrorCode)) {
    return prefix[1] as DiV0TripSpeedQualityProjectionErrorCode;
  }
  if (message.includes('UNKNOWN_MOTION_STATE')) {
    return 'UNSUPPORTED_MOTION_STATE';
  }
  return 'UNKNOWN';
}

export function formatDiV0TripSpeedQualityProjectionErrorForLog(error: unknown): string {
  if (error instanceof DiV0TripSpeedQualityProjectionError) {
    return `code=${error.code} message=${error.message.slice(0, 240)}`;
  }
  if (error instanceof DiV0TripSpeedQualityProjectionPersistenceError) {
    return `persistCode=${error.code} message=${error.message.slice(0, 240)}`;
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const code = (error as { code: unknown }).code;
    const message = (error as { message: unknown }).message;
    const name =
      'name' in error && typeof (error as { name?: unknown }).name === 'string'
        ? (error as { name: string }).name
        : 'Error';
    return `name=${name} code=${String(code)} message=${String(message).slice(0, 240)}`;
  }
  if (error instanceof Error) {
    return `name=${error.name} message=${error.message.slice(0, 240)}`;
  }
  return `message=${String(error).slice(0, 240)}`;
}
