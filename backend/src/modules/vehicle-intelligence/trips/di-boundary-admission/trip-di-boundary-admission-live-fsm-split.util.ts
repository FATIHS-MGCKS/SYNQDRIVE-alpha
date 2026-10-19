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
