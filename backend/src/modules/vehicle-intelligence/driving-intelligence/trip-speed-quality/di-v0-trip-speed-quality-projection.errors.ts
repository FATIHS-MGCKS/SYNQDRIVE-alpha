export type DiV0TripSpeedQualityProjectionErrorCode =
  | 'WORK_ITEM_NOT_FOUND'
  | 'TENANT_SCOPE_MISMATCH'
  | 'WORK_ITEM_NOT_ELIGIBLE'
  | 'WORK_ITEM_SUPERSEDED'
  | 'NOT_ACTIVE_PRIMARY'
  | 'MISSING_SHADOW_RUN'
  | 'MISSING_PINNED_SNAPSHOT'
  | 'SNAPSHOT_VERIFICATION_FAILED'
  | 'SHADOW_INTERVALS_MISSING';

export class DiV0TripSpeedQualityProjectionError extends Error {
  readonly code: DiV0TripSpeedQualityProjectionErrorCode;

  constructor(code: DiV0TripSpeedQualityProjectionErrorCode, message: string) {
    super(`DI_V0_TRIP_SPEED_QUALITY:${code}:${message}`);
    this.name = 'DiV0TripSpeedQualityProjectionError';
    this.code = code;
  }
}
