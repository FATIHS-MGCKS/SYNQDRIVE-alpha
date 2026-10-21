import type { PrismaClient } from '@prisma/client';
import { readCurrentBoundaryRepairGeneration } from '../../trips/boundary-repair.state.util';
import type { DiV0S4RunPurpose, DiV0S4State, DiV0S4SupersededReason } from '../s4a-foundation/di-v0-s4a-contract';
import { buildDiV0S4BoundaryFingerprint } from '../s4a-foundation/di-v0-s4a-identity';
import { DI_V0_S4E_DRIFT_HORIZON_SECONDS } from './di-v0-s4e-config';

/** T11_SUPERSEDE `from` states (contract); excludes SUPERSEDED. */
export const DI_V0_S4E_T11_ELIGIBLE_STATUSES: readonly DiV0S4State[] = [
  'PENDING',
  'LEASED',
  'FAILED_RETRYABLE',
  'COMPLETED',
  'FAILED_TERMINAL',
  'SKIPPED_INELIGIBLE',
];

export interface DiV0S4DriftWatchCandidateRow {
  work_item_id: string;
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  boundary_fingerprint: string;
  status: string;
  run_purpose: string;
  lease_epoch: bigint;
  settlement_anchor_at: Date;
  trip_status: string;
  start_time: Date;
  end_time: Date | null;
  dimo_segment_id: string | null;
  merge_parent_trip_id: string | null;
  raw_detection_meta: unknown;
  canonical_organization_id: string;
  trip_vehicle_id: string;
}

export interface DiV0S4DriftWatchCandidate {
  workItemId: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  storedFingerprint: string;
  status: DiV0S4State;
  runPurpose: DiV0S4RunPurpose;
  leaseEpoch: bigint;
  settlementAnchorAt: Date;
  tripStatus: string;
  canonicalFingerprint: string;
  canonicalOrganizationId: string;
  tripVehicleId: string;
}

export type DiV0S4DriftScopeCorruptionCode = 'ORGANIZATION_MISMATCH' | 'VEHICLE_MISMATCH';

export function classifyDriftSupersedeReason(tripStatus: string): DiV0S4SupersededReason {
  if (tripStatus === 'CANCELLED') return 'TRIP_CANCELLED';
  if (tripStatus === 'ONGOING') return 'TRIP_NOT_COMPLETED';
  return 'BOUNDARY_CHANGED';
}

function canonicalFingerprintFromRow(row: DiV0S4DriftWatchCandidateRow): string {
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

function toCandidate(row: DiV0S4DriftWatchCandidateRow): DiV0S4DriftWatchCandidate {
  return {
    workItemId: row.work_item_id,
    organizationId: row.organization_id,
    vehicleId: row.vehicle_id,
    tripId: row.trip_id,
    storedFingerprint: row.boundary_fingerprint,
    status: row.status as DiV0S4State,
    runPurpose: row.run_purpose as DiV0S4RunPurpose,
    leaseEpoch: row.lease_epoch,
    settlementAnchorAt: row.settlement_anchor_at,
    tripStatus: row.trip_status,
    canonicalFingerprint: canonicalFingerprintFromRow(row),
    canonicalOrganizationId: row.canonical_organization_id,
    tripVehicleId: row.trip_vehicle_id,
  };
}

export function scopeCorruptionForCandidate(
  candidate: DiV0S4DriftWatchCandidate,
  tripVehicleId: string,
): DiV0S4DriftScopeCorruptionCode | null {
  if (candidate.organizationId !== candidate.canonicalOrganizationId) return 'ORGANIZATION_MISMATCH';
  if (candidate.vehicleId !== tripVehicleId) return 'VEHICLE_MISMATCH';
  return null;
}

/**
 * Bounded, read-only candidate enumeration inside the frozen drift horizon. No provider calls; no trip writes.
 */
export async function listDiV0S4DriftWatchCandidates(
  prisma: PrismaClient,
  limit: number,
): Promise<DiV0S4DriftWatchCandidate[]> {
  const batch = Math.max(1, Math.min(limit, 500));
  const statuses = DI_V0_S4E_T11_ELIGIBLE_STATUSES;
  const horizonSeconds = DI_V0_S4E_DRIFT_HORIZON_SECONDS;
  const rows = await prisma.$queryRaw<DiV0S4DriftWatchCandidateRow[]>`
    SELECT wi.id AS work_item_id, wi.organization_id, wi.vehicle_id, wi.trip_id, wi.boundary_fingerprint,
      wi.status::text AS status, wi.run_purpose::text AS run_purpose, wi.lease_epoch, wi.settlement_anchor_at,
      t.trip_status::text AS trip_status,
      t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
      t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
      v.organization_id AS canonical_organization_id, t.vehicle_id AS trip_vehicle_id
    FROM di_v0_s4_work_items wi
    JOIN vehicle_trips t ON t.id = wi.trip_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE wi.status::text = ANY(${statuses}::text[])
      AND wi.settlement_anchor_at IS NOT NULL
      AND wi.settlement_anchor_at + make_interval(secs => ${horizonSeconds}::int) >= clock_timestamp()
    ORDER BY wi.settlement_anchor_at ASC, wi.id ASC
    LIMIT ${batch}`;
  return rows.map(toCandidate);
}

export async function countDiV0S4DriftWatchCandidatesInHorizon(prisma: PrismaClient): Promise<number> {
  const statuses = DI_V0_S4E_T11_ELIGIBLE_STATUSES;
  const horizonSeconds = DI_V0_S4E_DRIFT_HORIZON_SECONDS;
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n
    FROM di_v0_s4_work_items wi
    WHERE wi.status::text = ANY(${statuses}::text[])
      AND wi.settlement_anchor_at IS NOT NULL
      AND wi.settlement_anchor_at + make_interval(secs => ${horizonSeconds}::int) >= clock_timestamp()`;
  return Number(rows[0]?.n ?? 0);
}
