import type { PrismaClient } from '@prisma/client';
import { buildDiV0S4BoundaryFingerprint } from '../s4a-foundation/di-v0-s4a-identity';
import { readCurrentBoundaryRepairGeneration } from '../../trips/boundary-repair.state.util';
import { deriveSecondAlignedEnclosingWindow } from '../position-acquisition/di-v0-position-window';
import { resolveDiV0SourceFamily } from '../position-acquisition/di-v0-position-source-family';
import type { DiV0S4ClaimResult } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import type { DiV0S4cContextFailure, DiV0S4cResolvedAcquisitionContext } from './di-v0-s4c-types';

type ResolveResult = { ok: true; context: DiV0S4cResolvedAcquisitionContext } | { ok: false; failure: DiV0S4cContextFailure };

/** Read-only canonical acquisition context for a fenced lease (no authoritative writes). */
export async function resolveDiV0S4cAcquisitionContext(
  prisma: PrismaClient,
  lease: DiV0S4ClaimResult,
): Promise<ResolveResult> {
  const rows = await prisma.$queryRaw<
    Array<{
      organization_id: string;
      vehicle_id: string;
      trip_id: string;
      boundary_fingerprint: string;
      run_purpose: string;
      pinned_snapshot_hash: string | null;
      trip_status: string;
      start_time: Date;
      end_time: Date | null;
      dimo_segment_id: string | null;
      merge_parent_trip_id: string | null;
      raw_detection_meta: unknown;
      token_id: number | null;
      raw_json: unknown;
    }>
  >`
    SELECT w.organization_id, w.vehicle_id, w.trip_id, w.boundary_fingerprint, w.run_purpose::text AS run_purpose,
      w.pinned_snapshot_hash,
      t.trip_status::text AS trip_status,
      t.start_time AT TIME ZONE 'UTC' AS start_time,
      t.end_time AT TIME ZONE 'UTC' AS end_time,
      t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
      dv.token_id, dv.raw_json
    FROM di_v0_s4_work_items w
    JOIN vehicle_trips t ON t.id = w.trip_id
    JOIN vehicles v ON v.id = t.vehicle_id AND v.organization_id = w.organization_id
    LEFT JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
    WHERE w.id = ${lease.workItemId}`;

  const row = rows[0];
  if (!row) {
    return { ok: false, failure: { code: 'MISSING_TRIP', safeMessage: 'work item or trip not found' } };
  }
  if (row.end_time == null) {
    return { ok: false, failure: { code: 'MISSING_TRIP', safeMessage: 'trip end time required' } };
  }
  if (row.token_id == null || !Number.isFinite(row.token_id) || row.token_id <= 0) {
    return { ok: false, failure: { code: 'INVALID_TOKEN', safeMessage: 'DIMO tokenId missing' } };
  }
  if (row.raw_json == null) {
    return { ok: false, failure: { code: 'MISSING_DEVICE_IDENTITY', safeMessage: 'DIMO device identity missing' } };
  }
  if (!row.raw_json) {
    return { ok: false, failure: { code: 'MISSING_DIMO_LINK', safeMessage: 'vehicle has no DIMO link' } };
  }

  const fingerprint = buildDiV0S4BoundaryFingerprint({
    organizationId: row.organization_id,
    vehicleId: row.vehicle_id,
    tripId: row.trip_id,
    tripStatus: row.trip_status,
    startTime: row.start_time,
    endTime: row.end_time,
    dimoSegmentId: row.dimo_segment_id,
    mergeParentTripId: row.merge_parent_trip_id,
    boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(row.raw_detection_meta),
  });
  if (fingerprint !== row.boundary_fingerprint) {
    return { ok: false, failure: { code: 'TENANT_MISMATCH', safeMessage: 'boundary fingerprint drift' } };
  }

  const startMs = row.start_time.getTime();
  const endMs = row.end_time.getTime();
  const enclosing = deriveSecondAlignedEnclosingWindow(startMs, endMs);
  const windowStart = new Date(enclosing.fromUtc);
  const windowEnd = new Date(enclosing.toUtc);
  const family = resolveDiV0SourceFamily(row.raw_json).sourceFamily;

  return {
    ok: true,
    context: {
      organizationId: row.organization_id,
      vehicleId: row.vehicle_id,
      tripId: row.trip_id,
      sourceFamily: family,
      boundaryFingerprint: row.boundary_fingerprint,
      tripStartTime: row.start_time,
      tripEndTime: row.end_time,
      dimoTokenId: row.token_id,
      dimoDeviceIdentity: row.raw_json,
      runPurpose: row.run_purpose as DiV0S4cResolvedAcquisitionContext['runPurpose'],
      pinnedSnapshotHash: row.pinned_snapshot_hash,
      widenedStartMs: enclosing.widenedStartMs,
      widenedEndMs: enclosing.widenedEndMs,
      windowStart,
      windowEnd,
    },
  };
}
