import type { PrismaService } from '@shared/database/prisma.service';
import {
  buildTripDiBoundaryRevisionKey,
  canReleaseTripDiBoundaryAdmission,
  readTripDiBoundaryAdmissionV1,
  type TripDiBoundaryAdmissionBlockCode,
  type TripDiBoundaryAdmissionScope,
} from './trip-di-boundary-admission';

export type TripDiBoundaryAdmissionRecoveryCandidateOutcome =
  | { kind: 'NEEDS_RELEASE'; tripId: string }
  | { kind: 'ALREADY_CURRENT'; tripId: string }
  | { kind: 'GUARDED'; tripId: string; code: TripDiBoundaryAdmissionBlockCode };

export function classifyTripDiBoundaryAdmissionRecoveryCandidate(
  scope: TripDiBoundaryAdmissionScope,
): TripDiBoundaryAdmissionRecoveryCandidateOutcome {
  const block = canReleaseTripDiBoundaryAdmission(scope);
  if (block != null) {
    return { kind: 'GUARDED', tripId: scope.tripId, code: block };
  }
  const revisionKey = buildTripDiBoundaryRevisionKey({
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    tripId: scope.tripId,
    tripStatus: scope.tripStatus,
    startTime: scope.startTime,
    endTime: scope.endTime,
    dimoSegmentId: scope.dimoSegmentId,
    mergeParentTripId: scope.mergeParentTripId,
    rawDetectionMeta: scope.rawDetectionMeta,
  });
  const existing = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
  if (existing?.revisionKey === revisionKey) {
    return { kind: 'ALREADY_CURRENT', tripId: scope.tripId };
  }
  return { kind: 'NEEDS_RELEASE', tripId: scope.tripId };
}

/**
 * Bounded candidate scan: COMPLETED, RESTING FSM, no PROPOSED repairs, end_time in [eligibleFrom, now].
 * Does not admit CANCELLED rows (status filter). Stale/missing admission resolved in application layer.
 */
export async function listTripDiBoundaryAdmissionRecoveryCandidateTripIds(
  prisma: Pick<PrismaService, '$queryRaw'>,
  params: {
    vehicleId: string;
    eligibleFrom: Date;
    now: Date;
    limit: number;
  },
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ trip_id: string }>>`
    SELECT t.id AS trip_id
    FROM vehicle_trips t
    LEFT JOIN vehicle_trip_detection_states d ON d.vehicle_id = t.vehicle_id
    WHERE t.vehicle_id = ${params.vehicleId}
      AND t.trip_status::text = 'COMPLETED'
      AND t.start_time IS NOT NULL
      AND t.end_time IS NOT NULL
      AND t.end_time >= ${params.eligibleFrom}
      AND t.end_time <= ${params.now}
      AND NOT EXISTS (
        SELECT 1 FROM trip_repairs r
        WHERE r.trip_id = t.id AND r.status = 'PROPOSED'
      )
      AND (
        d.state IS NULL OR d.state::text = 'RESTING'
      )
      AND (
        d.active_trip_id IS NULL OR d.active_trip_id::text <> t.id::text
      )
    ORDER BY t.end_time ASC
    LIMIT ${params.limit}`;
  return rows.map((r) => r.trip_id);
}
