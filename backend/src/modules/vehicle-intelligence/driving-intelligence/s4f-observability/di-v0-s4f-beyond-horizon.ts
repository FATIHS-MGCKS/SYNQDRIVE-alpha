import type { DiV0S4fReadDb } from './di-v0-s4f-read-db';
import { DI_V0_S4F_DRIFT_HORIZON_SECONDS } from './di-v0-s4f-config';
import {
  canonicalBoundaryFingerprintFromRow,
  classifyDiV0S4fScopeCorruption,
  type DiV0S4fCanonicalWorkTripRow,
  type DiV0S4fScopeCorruptionCode,
} from './di-v0-s4f-canonical-scope';
import {
  type DiV0S4fKeysetScanCursor,
  resolveDiV0S4fScanWatermark,
} from './di-v0-s4f-keyset-cursor';

export type DiV0S4fBeyondHorizonCursor = DiV0S4fKeysetScanCursor;

export interface DiV0S4fBeyondHorizonBatchResult {
  scannedCount: number;
  boundaryMismatchCount: number;
  scopeCorruptionCount: number;
  boundaryMismatchWorkItemIds: string[];
  scopeCorruptionWorkItemIds: Array<{ workItemId: string; code: DiV0S4fScopeCorruptionCode }>;
  nextCursor: DiV0S4fBeyondHorizonCursor;
}

/**
 * Beyond S4E drift horizon: COUNT / REPORT ONLY — never T11 or mutations.
 * Scope corruption is classified before boundary fingerprint comparison (S4E parity).
 */
export async function reconcileDiV0S4BeyondDriftHorizonBatch(
  db: DiV0S4fReadDb,
  limit: number,
  cursor: DiV0S4fBeyondHorizonCursor,
  organizationId?: string,
): Promise<DiV0S4fBeyondHorizonBatchResult> {
  const batch = Math.max(1, Math.min(limit, 500));
  const horizonSeconds = DI_V0_S4F_DRIFT_HORIZON_SECONDS;
  const { watermark, cursor: scanCursor } = await resolveDiV0S4fScanWatermark(db, cursor);
  const anchor = scanCursor.settlementAnchorAt;
  const afterId = scanCursor.workItemId ?? '';

  const resolvedRows: DiV0S4fCanonicalWorkTripRow[] = organizationId
    ? await db.$queryRaw<DiV0S4fCanonicalWorkTripRow[]>`
        SELECT wi.id AS work_item_id, wi.organization_id, wi.vehicle_id, wi.trip_id, wi.boundary_fingerprint,
          wi.settlement_anchor_at,
          t.trip_status::text AS trip_status,
          t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
          t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
          v.organization_id AS canonical_organization_id, t.vehicle_id AS trip_vehicle_id
        FROM di_v0_s4_work_items wi
        JOIN vehicle_trips t ON t.id = wi.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE wi.organization_id = ${organizationId}
          AND wi.created_at <= ${watermark}::timestamptz
          AND wi.settlement_anchor_at IS NOT NULL
          AND wi.settlement_anchor_at + make_interval(secs => ${horizonSeconds}::int) < clock_timestamp()
          AND (
            ${anchor}::timestamptz IS NULL
            OR wi.settlement_anchor_at > ${anchor}::timestamptz
            OR (wi.settlement_anchor_at = ${anchor}::timestamptz AND wi.id > ${afterId}::text)
          )
        ORDER BY wi.settlement_anchor_at ASC, wi.id ASC
        LIMIT ${batch}`
    : await db.$queryRaw<DiV0S4fCanonicalWorkTripRow[]>`
        SELECT wi.id AS work_item_id, wi.organization_id, wi.vehicle_id, wi.trip_id, wi.boundary_fingerprint,
          wi.settlement_anchor_at,
          t.trip_status::text AS trip_status,
          t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
          t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
          v.organization_id AS canonical_organization_id, t.vehicle_id AS trip_vehicle_id
        FROM di_v0_s4_work_items wi
        JOIN vehicle_trips t ON t.id = wi.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE wi.created_at <= ${watermark}::timestamptz
          AND wi.settlement_anchor_at IS NOT NULL
          AND wi.settlement_anchor_at + make_interval(secs => ${horizonSeconds}::int) < clock_timestamp()
          AND (
            ${anchor}::timestamptz IS NULL
            OR wi.settlement_anchor_at > ${anchor}::timestamptz
            OR (wi.settlement_anchor_at = ${anchor}::timestamptz AND wi.id > ${afterId}::text)
          )
        ORDER BY wi.settlement_anchor_at ASC, wi.id ASC
        LIMIT ${batch}`;

  let boundaryMismatchCount = 0;
  let scopeCorruptionCount = 0;
  const boundaryMismatchWorkItemIds: string[] = [];
  const scopeCorruptionWorkItemIds: Array<{ workItemId: string; code: DiV0S4fScopeCorruptionCode }> = [];

  for (const row of resolvedRows) {
    const scope = classifyDiV0S4fScopeCorruption(row);
    if (scope) {
      scopeCorruptionCount += 1;
      if (scopeCorruptionWorkItemIds.length < 20) {
        scopeCorruptionWorkItemIds.push({ workItemId: row.work_item_id, code: scope });
      }
      continue;
    }
    const canonical = canonicalBoundaryFingerprintFromRow(row);
    if (canonical !== row.boundary_fingerprint) {
      boundaryMismatchCount += 1;
      if (boundaryMismatchWorkItemIds.length < 20) boundaryMismatchWorkItemIds.push(row.work_item_id);
    }
  }

  const last = resolvedRows[resolvedRows.length - 1];
  const nextCursor: DiV0S4fBeyondHorizonCursor = last
    ? {
        scanWatermarkCreatedAt: scanCursor.scanWatermarkCreatedAt,
        settlementAnchorAt: last.settlement_anchor_at,
        workItemId: last.work_item_id,
      }
    : scanCursor;

  return {
    scannedCount: resolvedRows.length,
    boundaryMismatchCount,
    scopeCorruptionCount,
    boundaryMismatchWorkItemIds,
    scopeCorruptionWorkItemIds,
    nextCursor,
  };
}
