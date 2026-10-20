/**
 * Narrow eligibility for LIVE_FSM mid-gap split segments that reconciliation
 * intra-gap scans skip (parent end_detection_mode MID_TRIP_GAP_SPLIT).
 */
import type { Prisma } from '@prisma/client';
import { readTripDiBoundaryAdmissionV1 } from './trip-di-boundary-admission';

export const LIVE_FSM_SPLIT_TRIGGER = 'LIVE_FSM';

export function isLiveFsmSplitTriggeredMeta(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>).splitTriggeredBy === LIVE_FSM_SPLIT_TRIGGER;
}

export function isLiveFsmSplitParentCandidate(
  trip: {
    tripStatus: string;
    endDetectionMode: string | null;
    rawDetectionMeta: unknown;
  },
): boolean {
  if (trip.tripStatus !== 'COMPLETED') return false;
  if (trip.endDetectionMode !== 'MID_TRIP_GAP_SPLIT') return false;
  if (!isLiveFsmSplitTriggeredMeta(trip.rawDetectionMeta)) return false;
  return readTripDiBoundaryAdmissionV1(trip.rawDetectionMeta) == null;
}

export function isLiveFsmSplitContinuationCandidate(
  trip: {
    tripStatus: string;
    rawDetectionMeta: unknown;
  },
): boolean {
  if (trip.tripStatus !== 'COMPLETED') return false;
  if (!isLiveFsmSplitTriggeredMeta(trip.rawDetectionMeta)) return false;
  if (trip.rawDetectionMeta == null || typeof trip.rawDetectionMeta !== 'object' || Array.isArray(trip.rawDetectionMeta)) {
    return false;
  }
  const splitFrom = (trip.rawDetectionMeta as Record<string, unknown>).splitFrom;
  if (typeof splitFrom !== 'string' || splitFrom.length === 0) return false;
  return readTripDiBoundaryAdmissionV1(trip.rawDetectionMeta) == null;
}

/** Trip ids on a vehicle that may receive admission after RESTING settlement (not a blanket missing-meta sweep). */
export async function listLiveFsmSplitAdmissionCandidateTripIds(
  prisma: { $queryRaw: Prisma.TransactionClient['$queryRaw'] },
  vehicleId: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ trip_id: string }>>`
    SELECT t.id::text AS trip_id
    FROM vehicle_trips t
    WHERE t.vehicle_id = ${vehicleId}
      AND t.trip_status::text = 'COMPLETED'
      AND t.end_time IS NOT NULL
      AND (t.raw_detection_meta->'diV0BoundaryAdmissionV1'->>'revisionKey') IS NULL
      AND (
        (
          t.end_detection_mode::text = 'MID_TRIP_GAP_SPLIT'
          AND (t.raw_detection_meta->>'splitTriggeredBy') = ${LIVE_FSM_SPLIT_TRIGGER}
        )
        OR (
          (t.raw_detection_meta->>'splitTriggeredBy') = ${LIVE_FSM_SPLIT_TRIGGER}
          AND (t.raw_detection_meta->>'splitFrom') IS NOT NULL
        )
      )
    ORDER BY t.end_time ASC, t.id ASC`;
  return rows.map((r) => r.trip_id);
}

export type LiveFsmSplitAdmissionEligibility =
  | { eligible: true; tripId: string; vehicleId: string; role: 'SPLIT_PARENT' | 'SPLIT_CONTINUATION' }
  | { eligible: false; tripId: string; vehicleId: string; reason: string };

/** Read-only eligibility for a single trip (ops dry-run / scoped recovery). */
export async function evaluateLiveFsmSplitAdmissionEligibility(
  prisma: { $queryRaw: Prisma.TransactionClient['$queryRaw'] },
  tripId: string,
  expectedVehicleId: string,
): Promise<LiveFsmSplitAdmissionEligibility> {
  const rows = await prisma.$queryRaw<
    Array<{
      vehicle_id: string;
      trip_status: string;
      end_detection_mode: string | null;
      raw_detection_meta: unknown;
    }>
  >`
    SELECT t.vehicle_id::text AS vehicle_id, t.trip_status::text AS trip_status,
           t.end_detection_mode::text AS end_detection_mode, t.raw_detection_meta
    FROM vehicle_trips t WHERE t.id = ${tripId} LIMIT 1`;
  const row = rows[0];
  if (!row) return { eligible: false, tripId, vehicleId: expectedVehicleId, reason: 'TRIP_NOT_FOUND' };
  if (row.vehicle_id !== expectedVehicleId) {
    return { eligible: false, tripId, vehicleId: row.vehicle_id, reason: 'VEHICLE_MISMATCH' };
  }
  if (readTripDiBoundaryAdmissionV1(row.raw_detection_meta) != null) {
    return { eligible: false, tripId, vehicleId: row.vehicle_id, reason: 'ADMISSION_ALREADY_PRESENT' };
  }
  if (isLiveFsmSplitParentCandidate({
    tripStatus: row.trip_status,
    endDetectionMode: row.end_detection_mode,
    rawDetectionMeta: row.raw_detection_meta,
  })) {
    return { eligible: true, tripId, vehicleId: row.vehicle_id, role: 'SPLIT_PARENT' };
  }
  if (isLiveFsmSplitContinuationCandidate({
    tripStatus: row.trip_status,
    rawDetectionMeta: row.raw_detection_meta,
  })) {
    return { eligible: true, tripId, vehicleId: row.vehicle_id, role: 'SPLIT_CONTINUATION' };
  }
  return { eligible: false, tripId, vehicleId: row.vehicle_id, reason: 'NOT_LIVE_FSM_SPLIT_CANDIDATE' };
}
