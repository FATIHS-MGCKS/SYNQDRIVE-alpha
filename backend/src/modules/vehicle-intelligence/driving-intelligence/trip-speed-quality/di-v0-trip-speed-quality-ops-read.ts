import type { DiV0TripSpeedQualityPersistedRow } from './di-v0-trip-speed-quality-projection.repository';
import type { DiV0TripSpeedQualityProjectionV1 } from './di-v0-trip-speed-quality-projection.types';

/** Ops-only read DTO — not exposed on customer APIs. */
export interface DiV0TripSpeedQualityOpsReadV1 {
  projectionId: string;
  lifecycleStatus: 'CURRENT' | 'SUPERSEDED';
  contentFingerprint: string;
  idempotencyKey: string;
  createdAt: string;
  projection: DiV0TripSpeedQualityProjectionV1;
  disclaimers: string[];
}

export function toDiV0TripSpeedQualityOpsReadV1(row: DiV0TripSpeedQualityPersistedRow): DiV0TripSpeedQualityOpsReadV1 {
  return {
    projectionId: row.id,
    lifecycleStatus: row.lifecycleStatus,
    contentFingerprint: row.contentFingerprint,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    projection: row.projection,
    disclaimers: [
      'Internal speed QC projection — not customer-facing driving score.',
      'qcTrustedMeanKmh is the mean over TRUSTED intervals only, not whole-trip average speed.',
      'provisionalCalibration=true — kinematic thresholds are not production-calibrated.',
      'customerClaimAuthorized=false',
    ],
  };
}
