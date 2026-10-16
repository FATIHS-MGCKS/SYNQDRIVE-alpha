import type { PrismaClient } from '@prisma/client';
import { buildDiV0S4BoundaryFingerprint } from '../../driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { readCurrentBoundaryRepairGeneration } from '../boundary-repair.state.util';
import { evaluateTripDiBoundaryAdmission, type TripDiBoundaryAdmissionScope } from './trip-di-boundary-admission';

export type TripDiProductReadBoundaryGateResult =
  | { ok: true; boundaryFingerprint: string }
  | { ok: false; reason: 'TRIP_NOT_FOUND' | 'ADMISSION_NOT_SATISFIED' | 'BOUNDARY_FINGERPRINT_MISMATCH' };

async function loadAdmissionScope(prisma: PrismaClient, tripId: string): Promise<TripDiBoundaryAdmissionScope | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      organization_id: string;
      vehicle_id: string;
      trip_id: string;
      trip_status: string;
      start_time: Date;
      end_time: Date | null;
      dimo_segment_id: string | null;
      merge_parent_trip_id: string | null;
      raw_detection_meta: unknown;
      detection_state: string | null;
      active_trip_id: string | null;
      proposed_repairs: bigint;
    }>
  >`
    SELECT v.organization_id, t.vehicle_id, t.id AS trip_id, t.trip_status::text AS trip_status,
      t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
      t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
      dts.state::text AS detection_state, dts.active_trip_id::text AS active_trip_id,
      (SELECT count(*)::bigint FROM trip_repairs r
       WHERE r.trip_id = t.id AND r.status = 'PROPOSED') AS proposed_repairs
    FROM vehicle_trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN vehicle_trip_detection_states dts ON dts.vehicle_id = t.vehicle_id
    WHERE t.id = ${tripId}
    LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    organizationId: row.organization_id,
    vehicleId: row.vehicle_id,
    tripId: row.trip_id,
    tripStatus: row.trip_status,
    startTime: row.start_time,
    endTime: row.end_time,
    dimoSegmentId: row.dimo_segment_id,
    mergeParentTripId: row.merge_parent_trip_id,
    rawDetectionMeta: row.raw_detection_meta,
    detectionState: row.detection_state,
    activeTripId: row.active_trip_id,
    proposedBoundaryRepairCount: Number(row.proposed_repairs),
  };
}

/**
 * Read-only gate: CURRENT projections / READY product state require live trip admission + fingerprint match.
 */
export async function evaluateTripDiProductReadBoundaryGate(
  prisma: PrismaClient,
  tripId: string,
  expectedBoundaryFingerprint: string,
): Promise<TripDiProductReadBoundaryGateResult> {
  const scope = await loadAdmissionScope(prisma, tripId);
  if (!scope || scope.endTime == null) return { ok: false, reason: 'TRIP_NOT_FOUND' };
  const admission = evaluateTripDiBoundaryAdmission(scope);
  if (!admission.ok) return { ok: false, reason: 'ADMISSION_NOT_SATISFIED' };
  const current = buildDiV0S4BoundaryFingerprint({
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    tripId: scope.tripId,
    tripStatus: scope.tripStatus,
    startTime: scope.startTime,
    endTime: scope.endTime,
    dimoSegmentId: scope.dimoSegmentId,
    mergeParentTripId: scope.mergeParentTripId,
    boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(scope.rawDetectionMeta),
  });
  if (current !== expectedBoundaryFingerprint || current !== admission.admission.revisionKey) {
    return { ok: false, reason: 'BOUNDARY_FINGERPRINT_MISMATCH' };
  }
  return { ok: true, boundaryFingerprint: current };
}
