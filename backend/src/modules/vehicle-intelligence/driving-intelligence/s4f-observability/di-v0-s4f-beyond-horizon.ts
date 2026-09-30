import type { PrismaClient } from '@prisma/client';
import { readCurrentBoundaryRepairGeneration } from '../../trips/boundary-repair.state.util';
import { buildDiV0S4BoundaryFingerprint } from '../s4a-foundation/di-v0-s4a-identity';
import { DI_V0_S4F_DRIFT_HORIZON_SECONDS } from './di-v0-s4f-config';

export interface DiV0S4fBeyondHorizonCursor {
  settlementAnchorAt: Date | null;
  workItemId: string | null;
}

export interface DiV0S4fBeyondHorizonBatchResult {
  scannedCount: number;
  mismatchCount: number;
  mismatchWorkItemIds: string[];
  nextCursor: DiV0S4fBeyondHorizonCursor;
}

interface BeyondHorizonRow {
  work_item_id: string;
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  boundary_fingerprint: string;
  settlement_anchor_at: Date;
  trip_status: string;
  start_time: Date;
  end_time: Date | null;
  dimo_segment_id: string | null;
  merge_parent_trip_id: string | null;
  raw_detection_meta: unknown;
  canonical_organization_id: string;
}

function canonicalFingerprint(row: BeyondHorizonRow): string {
  return buildDiV0S4BoundaryFingerprint({
    organizationId: row.canonical_organization_id,
    vehicleId: row.vehicle_id,
    tripId: row.trip_id,
    tripStatus: row.trip_status,
    startTime: row.start_time,
    endTime: row.end_time,
    dimoSegmentId: row.dimo_segment_id,
    mergeParentTripId: row.merge_parent_trip_id,
    boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(row.raw_detection_meta),
  });
}

/**
 * Beyond S4E drift horizon: COUNT / REPORT ONLY — never T11 or mutations.
 */
export async function reconcileDiV0S4BeyondDriftHorizonBatch(
  prisma: PrismaClient,
  limit: number,
  cursor: DiV0S4fBeyondHorizonCursor,
  organizationId?: string,
): Promise<DiV0S4fBeyondHorizonBatchResult> {
  const batch = Math.max(1, Math.min(limit, 500));
  const horizonSeconds = DI_V0_S4F_DRIFT_HORIZON_SECONDS;
  const anchor = cursor.settlementAnchorAt;
  const afterId = cursor.workItemId ?? '';

  const rows = organizationId
    ? await prisma.$queryRaw<BeyondHorizonRow[]>`
        SELECT wi.id AS work_item_id, wi.organization_id, wi.vehicle_id, wi.trip_id, wi.boundary_fingerprint,
          wi.settlement_anchor_at,
          t.trip_status::text AS trip_status,
          t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
          t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
          v.organization_id AS canonical_organization_id
        FROM di_v0_s4_work_items wi
        JOIN vehicle_trips t ON t.id = wi.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE wi.organization_id = ${organizationId}
          AND wi.settlement_anchor_at IS NOT NULL
          AND wi.settlement_anchor_at + make_interval(secs => ${horizonSeconds}::int) < clock_timestamp()
          AND (
            ${anchor}::timestamptz IS NULL
            OR wi.settlement_anchor_at > ${anchor}::timestamptz
            OR (wi.settlement_anchor_at = ${anchor}::timestamptz AND wi.id > ${afterId}::text)
          )
        ORDER BY wi.settlement_anchor_at ASC, wi.id ASC
        LIMIT ${batch}`
    : await prisma.$queryRaw<BeyondHorizonRow[]>`
        SELECT wi.id AS work_item_id, wi.organization_id, wi.vehicle_id, wi.trip_id, wi.boundary_fingerprint,
          wi.settlement_anchor_at,
          t.trip_status::text AS trip_status,
          t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
          t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
          v.organization_id AS canonical_organization_id
        FROM di_v0_s4_work_items wi
        JOIN vehicle_trips t ON t.id = wi.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE wi.settlement_anchor_at IS NOT NULL
          AND wi.settlement_anchor_at + make_interval(secs => ${horizonSeconds}::int) < clock_timestamp()
          AND (
            ${anchor}::timestamptz IS NULL
            OR wi.settlement_anchor_at > ${anchor}::timestamptz
            OR (wi.settlement_anchor_at = ${anchor}::timestamptz AND wi.id > ${afterId}::text)
          )
        ORDER BY wi.settlement_anchor_at ASC, wi.id ASC
        LIMIT ${batch}`;

  let mismatchCount = 0;
  const mismatchWorkItemIds: string[] = [];
  for (const row of rows) {
    const canonical = canonicalFingerprint(row);
    if (canonical !== row.boundary_fingerprint) {
      mismatchCount += 1;
      if (mismatchWorkItemIds.length < 20) mismatchWorkItemIds.push(row.work_item_id);
    }
  }

  const last = rows[rows.length - 1];
  const nextCursor: DiV0S4fBeyondHorizonCursor = last
    ? { settlementAnchorAt: last.settlement_anchor_at, workItemId: last.work_item_id }
    : cursor;

  return {
    scannedCount: rows.length,
    mismatchCount,
    mismatchWorkItemIds,
    nextCursor,
  };
}
