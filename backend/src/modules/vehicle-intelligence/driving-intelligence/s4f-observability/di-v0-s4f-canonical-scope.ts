import { readCurrentBoundaryRepairGeneration } from '../../trips/boundary-repair.state.util';
import { buildDiV0S4BoundaryFingerprint } from '../s4a-foundation/di-v0-s4a-identity';
import {
  scopeCorruptionForCandidate,
  type DiV0S4DriftScopeCorruptionCode,
} from '../s4e-drift-watcher/di-v0-s4e-drift-candidates';

export type { DiV0S4DriftScopeCorruptionCode as DiV0S4fScopeCorruptionCode };

export interface DiV0S4fCanonicalWorkTripRow {
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
  trip_vehicle_id: string;
}

export function classifyDiV0S4fScopeCorruption(row: DiV0S4fCanonicalWorkTripRow): DiV0S4DriftScopeCorruptionCode | null {
  return scopeCorruptionForCandidate(
    {
      workItemId: row.work_item_id,
      organizationId: row.organization_id,
      vehicleId: row.vehicle_id,
      tripId: row.trip_id,
      storedFingerprint: row.boundary_fingerprint,
      status: 'PENDING',
      runPurpose: 'PRIMARY',
      leaseEpoch: BigInt(0),
      settlementAnchorAt: new Date(0),
      tripStatus: row.trip_status,
      canonicalFingerprint: '',
      canonicalOrganizationId: row.canonical_organization_id,
      tripVehicleId: row.trip_vehicle_id,
    },
    row.trip_vehicle_id,
  );
}

/** Canonical boundary fingerprint uses trip vehicle + canonical org (S4E scope authority). */
export function canonicalBoundaryFingerprintFromRow(row: DiV0S4fCanonicalWorkTripRow): string {
  return buildDiV0S4BoundaryFingerprint({
    organizationId: row.canonical_organization_id,
    vehicleId: row.trip_vehicle_id,
    tripId: row.trip_id,
    tripStatus: row.trip_status,
    startTime: row.start_time,
    endTime: row.end_time,
    dimoSegmentId: row.dimo_segment_id,
    mergeParentTripId: row.merge_parent_trip_id,
    boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(row.raw_detection_meta),
  });
}
