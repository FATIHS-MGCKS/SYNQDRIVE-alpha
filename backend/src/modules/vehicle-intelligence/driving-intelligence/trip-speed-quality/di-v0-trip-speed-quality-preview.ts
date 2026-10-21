import type { PrismaClient } from '@prisma/client';
import {
  computeDiV0TripSpeedQualityProjectionV1ForWorkItem,
  type DiV0TripSpeedQualityComputeInput,
} from './di-v0-trip-speed-quality-projection.engine';
import {
  DiV0TripSpeedQualityProjectionError,
  type DiV0TripSpeedQualityProjectionErrorCode,
} from './di-v0-trip-speed-quality-projection.errors';
import {
  DI_V0_TRIP_SPEED_QUALITY_PREVIEW_DISCLAIMER,
  type DiV0TripSpeedQualityPreviewReportV1,
} from './di-v0-trip-speed-quality-preview.types';

const PREVIEW_STATEMENT_TIMEOUT_MS = 30_000;

export interface DiV0TripSpeedQualityPreviewInput extends DiV0TripSpeedQualityComputeInput {}

function notAssessableReport(
  code: DiV0TripSpeedQualityProjectionErrorCode | 'UNKNOWN',
  detail: string,
): DiV0TripSpeedQualityPreviewReportV1 {
  return {
    schema: 'DI_V0_TRIP_SPEED_QUALITY_PREVIEW_V1',
    mode: 'READ_ONLY_PREVIEW',
    outcome: 'NOT_ASSESSABLE',
    notAssessableReasonCode: code,
    notAssessableDetail: detail,
    disclaimer: DI_V0_TRIP_SPEED_QUALITY_PREVIEW_DISCLAIMER,
    identity: null,
    snapshotVerified: false,
    projection: null,
  };
}

/**
 * Read-only in-memory QC preview for a single COMPLETED PRIMARY work item.
 * Never writes to the database; does not require the P2 projection table to exist.
 */
export async function previewDiV0TripSpeedQualityForWorkItem(
  prisma: PrismaClient,
  input: DiV0TripSpeedQualityPreviewInput,
): Promise<DiV0TripSpeedQualityPreviewReportV1> {
  try {
    const projection = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${PREVIEW_STATEMENT_TIMEOUT_MS}`);
        await tx.$executeRaw`SET LOCAL transaction_read_only = on`;
        return computeDiV0TripSpeedQualityProjectionV1ForWorkItem(tx, input);
      },
      { timeout: PREVIEW_STATEMENT_TIMEOUT_MS + 5_000 },
    );

    return {
      schema: 'DI_V0_TRIP_SPEED_QUALITY_PREVIEW_V1',
      mode: 'READ_ONLY_PREVIEW',
      outcome:
        projection.assessability.level === 'UNASSESSABLE' ? 'NOT_ASSESSABLE' : 'ASSESSED',
      notAssessableReasonCode:
        projection.assessability.level === 'UNASSESSABLE' ? 'INSUFFICIENT_EVIDENCE' : null,
      notAssessableDetail:
        projection.assessability.level === 'UNASSESSABLE'
          ? projection.assessability.reasons.join('; ') || 'assessability UNASSESSABLE'
          : null,
      disclaimer: DI_V0_TRIP_SPEED_QUALITY_PREVIEW_DISCLAIMER,
      identity: {
        organizationId: projection.identity.organizationId,
        tripId: projection.identity.tripId,
        workItemId: projection.identity.workItemId,
        vehicleId: projection.identity.vehicleId,
        boundaryFingerprint: projection.identity.boundaryFingerprint,
        pinnedSnapshotHash: projection.identity.pinnedSnapshotHash,
        shadowRunId: projection.identity.shadowRunId,
      },
      snapshotVerified: true,
      projection,
    };
  } catch (error) {
    if (error instanceof DiV0TripSpeedQualityProjectionError) {
      return notAssessableReport(error.code, error.message);
    }
    throw error;
  }
}
