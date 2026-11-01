import { Prisma } from '@prisma/client';
import { LIVE_FSM_SPLIT_TRIGGER } from './di-boundary-admission/trip-di-boundary-admission-live-fsm-split.util';

const DISCARD_TOO_SHORT_NO_DISTANCE = 'too_short_no_distance';
const BOUNDARY_EXTENSION = 'PARTIAL_TRIP_BOUNDARY_EXTENSION';

export function readTripDiscardReason(rawDetectionMeta: unknown): string | null {
  if (rawDetectionMeta == null || typeof rawDetectionMeta !== 'object' || Array.isArray(rawDetectionMeta)) {
    return null;
  }
  const reason = (rawDetectionMeta as Record<string, unknown>).discardReason;
  return typeof reason === 'string' ? reason : null;
}

export function readSplitFromTripId(rawDetectionMeta: unknown): string | null {
  if (rawDetectionMeta == null || typeof rawDetectionMeta !== 'object' || Array.isArray(rawDetectionMeta)) {
    return null;
  }
  const splitFrom = (rawDetectionMeta as Record<string, unknown>).splitFrom;
  return typeof splitFrom === 'string' && splitFrom.length > 0 ? splitFrom : null;
}

function hasReconciledBoundaryExtensionOnParent(rawDetectionMeta: unknown, isRepaired: boolean): boolean {
  if (isRepaired) return true;
  if (rawDetectionMeta == null || typeof rawDetectionMeta !== 'object' || Array.isArray(rawDetectionMeta)) {
    return false;
  }
  const meta = rawDetectionMeta as Record<string, unknown>;
  const repair = meta.boundaryRepair;
  if (repair != null && typeof repair === 'object' && !Array.isArray(repair)) {
    if ((repair as Record<string, unknown>).repairType === BOUNDARY_EXTENSION) return true;
  }
  const history = meta.boundaryRepairHistory;
  if (Array.isArray(history)) {
    for (const entry of history) {
      if (entry != null && typeof entry === 'object' && !Array.isArray(entry)) {
        if ((entry as Record<string, unknown>).repairType === BOUNDARY_EXTENSION) return true;
      }
    }
  }
  return false;
}

type TripListRow = {
  id: string;
  tripStatus: string;
  startTime: Date;
  rawDetectionMeta: unknown;
  isRepaired?: boolean;
  endDetectionMode?: string | null;
};

/**
 * In-memory filter when parent row is already loaded (tests / batch hydration).
 * Does not hide independent CANCELLED trips or suffixes without proven reconciliation.
 */
export function shouldHideReconciledGapSplitSuffixFromCustomerList(
  suffix: TripListRow,
  parent: TripListRow,
): boolean {
  if (suffix.tripStatus !== 'CANCELLED') return false;
  if (readTripDiscardReason(suffix.rawDetectionMeta) !== DISCARD_TOO_SHORT_NO_DISTANCE) return false;
  if (parent.tripStatus !== 'COMPLETED') return false;
  if (parent.endDetectionMode !== 'MID_TRIP_GAP_SPLIT') return false;
  if (!hasReconciledBoundaryExtensionOnParent(parent.rawDetectionMeta, parent.isRepaired ?? false)) {
    return false;
  }
  if (parent.rawDetectionMeta == null || typeof parent.rawDetectionMeta !== 'object' || Array.isArray(parent.rawDetectionMeta)) {
    return false;
  }
  const parentMeta = parent.rawDetectionMeta as Record<string, unknown>;
  if (parentMeta.splitTriggeredBy !== LIVE_FSM_SPLIT_TRIGGER) return false;

  const splitFrom = readSplitFromTripId(suffix.rawDetectionMeta);
  if (splitFrom != null) {
    return splitFrom === parent.id;
  }

  const splitSecondStartAt = parentMeta.splitSecondStartAt;
  if (typeof splitSecondStartAt !== 'string' || splitSecondStartAt.length === 0) return false;
  const anchorMs = Date.parse(splitSecondStartAt);
  if (!Number.isFinite(anchorMs)) return false;
  return suffix.startTime.getTime() === anchorMs;
}

/**
 * Trip ids that are CANCELLED LIVE_FSM gap-split suffixes absorbed into a reconciled canonical parent.
 * Used for customer-facing list/stats (DB rows and Master Admin reads stay unchanged).
 */
export async function listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
  prisma: { $queryRaw: Prisma.TransactionClient['$queryRaw'] },
  vehicleId: string,
  options?: { from?: Date; to?: Date },
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ suffix_id: string }>>`
    SELECT suffix.id::text AS suffix_id
    FROM vehicle_trips suffix
    INNER JOIN vehicle_trips parent ON parent.vehicle_id = suffix.vehicle_id
    WHERE suffix.vehicle_id = ${vehicleId}
      AND suffix.trip_status::text = 'CANCELLED'
      AND suffix.raw_detection_meta->>'discardReason' = ${DISCARD_TOO_SHORT_NO_DISTANCE}
      AND parent.trip_status::text = 'COMPLETED'
      AND parent.end_detection_mode::text = 'MID_TRIP_GAP_SPLIT'
      AND (parent.raw_detection_meta->>'splitTriggeredBy') = ${LIVE_FSM_SPLIT_TRIGGER}
      AND (
        parent.is_repaired = true
        OR parent.raw_detection_meta->'boundaryRepair'->>'repairType' = ${BOUNDARY_EXTENSION}
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(parent.raw_detection_meta->'boundaryRepairHistory') = 'array'
              THEN parent.raw_detection_meta->'boundaryRepairHistory'
              ELSE '[]'::jsonb
            END
          ) elem
          WHERE elem->>'repairType' = ${BOUNDARY_EXTENSION}
        )
      )
      AND (
        (suffix.raw_detection_meta->>'splitFrom') = parent.id::text
        OR (
          (parent.raw_detection_meta->>'splitSecondStartAt') IS NOT NULL
          AND suffix.start_time = (parent.raw_detection_meta->>'splitSecondStartAt')::timestamptz
        )
      )
      ${options?.from ? Prisma.sql`AND suffix.start_time >= ${options.from}` : Prisma.empty}
      ${options?.to ? Prisma.sql`AND suffix.start_time <= ${options.to}` : Prisma.empty}`;
  return rows.map((r) => r.suffix_id);
}

export function filterCustomerVisibleTrips<T extends TripListRow>(
  trips: T[],
  hiddenSuffixIds: ReadonlySet<string>,
): T[] {
  if (hiddenSuffixIds.size === 0) return trips;
  return trips.filter((trip) => !hiddenSuffixIds.has(trip.id));
}
