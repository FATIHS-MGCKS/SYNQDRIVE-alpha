import type { DiV0TripSpeedQualityProjectionV1 } from './di-v0-trip-speed-quality-projection.types';

export const DI_V0_TRIP_SPEED_QUALITY_PREVIEW_DISCLAIMER =
  'Speed QC summarizes telematics evidence under policy rules; it does not prove ground-truth speed without independent validation.';

export type DiV0TripSpeedQualityPreviewOutcome = 'ASSESSED' | 'NOT_ASSESSABLE';

export interface DiV0TripSpeedQualityPreviewIdentity {
  organizationId: string;
  tripId: string;
  workItemId: string;
  vehicleId: string;
  boundaryFingerprint: string;
  pinnedSnapshotHash: string;
  shadowRunId: string;
}

export interface DiV0TripSpeedQualityPreviewReportV1 {
  schema: 'DI_V0_TRIP_SPEED_QUALITY_PREVIEW_V1';
  mode: 'READ_ONLY_PREVIEW';
  outcome: DiV0TripSpeedQualityPreviewOutcome;
  notAssessableReasonCode: string | null;
  notAssessableDetail: string | null;
  disclaimer: string;
  identity: DiV0TripSpeedQualityPreviewIdentity | null;
  snapshotVerified: boolean;
  /** Present when outcome=ASSESSED — sanitized projection metrics (no raw coordinates). */
  projection: DiV0TripSpeedQualityProjectionV1 | null;
}
