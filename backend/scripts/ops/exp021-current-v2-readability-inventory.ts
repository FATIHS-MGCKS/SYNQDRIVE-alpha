#!/usr/bin/env ts-node
/**
 * Read-only disjoint CURRENT V2 readability inventory (Production-safe).
 */
import { PrismaClient } from '@prisma/client';
import { buildDiV0S4BoundaryFingerprint } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { readCurrentBoundaryRepairGeneration } from '../../src/modules/vehicle-intelligence/trips/boundary-repair.state.util';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import {
  evaluateEvGtAdmission,
  evaluateEvGtProductReadGate,
  type EvGtAdmissionScope,
} from './exp021-ev-ground-truth-admission.lib';

const ADMISSION_KEY = 'diV0BoundaryAdmissionV1';

async function main(): Promise<void> {
  const observedAtUtc = new Date().toISOString();
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        projection_id: string;
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        work_item_id: string;
        trip_status: string;
        start_time: Date;
        end_time: Date | null;
        dimo_segment_id: string | null;
        merge_parent_trip_id: string | null;
        raw_detection_meta: unknown;
        detection_state: string | null;
        active_trip_id: string | null;
        proposed_repairs: bigint;
        boundary_fingerprint: string | null;
      }>
    >`
      SELECT p.id AS projection_id, p.organization_id, p.vehicle_id, p.trip_id, p.work_item_id,
        t.trip_status::text AS trip_status, t.start_time, t.end_time,
        t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
        dts.state::text AS detection_state, dts.active_trip_id::text AS active_trip_id,
        (SELECT count(*)::bigint FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'PROPOSED') AS proposed_repairs,
        wi.boundary_fingerprint
      FROM di_v0_trip_speed_quality_projections_v1 p
      JOIN vehicle_trips t ON t.id = p.trip_id
      LEFT JOIN vehicle_trip_detection_states dts ON dts.vehicle_id = t.vehicle_id
      LEFT JOIN di_v0_s4_work_items wi ON wi.id = p.work_item_id
      WHERE p.lifecycle_status = 'CURRENT' AND p.qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}`;

    const categories = {
      totalCurrentV2: 0,
      productReadWouldSucceed: 0,
      admissionValidRevisionMatch: 0,
      admissionMissing: 0,
      admissionRevisionMismatch: 0,
      releasePreconditionBlocked: 0,
      boundaryFingerprintMismatchVsWorkItem: 0,
      tripOpenOrMissingEnd: 0,
    };

    for (const row of rows) {
      categories.totalCurrentV2 += 1;
      if (row.end_time == null || row.trip_status !== 'COMPLETED') {
        categories.tripOpenOrMissingEnd += 1;
        continue;
      }

      const scope: EvGtAdmissionScope = {
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

      const admissionEval = evaluateEvGtAdmission(scope);
      const wiFp = row.boundary_fingerprint ?? '';
      const gate = wiFp ? evaluateEvGtProductReadGate(scope, wiFp) : { ok: false as const, reason: 'BOUNDARY_FINGERPRINT_MISMATCH' };

      const liveFp = buildDiV0S4BoundaryFingerprint({
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
      if (wiFp && liveFp !== wiFp) categories.boundaryFingerprintMismatchVsWorkItem += 1;

      if (admissionEval.ok) {
        categories.admissionValidRevisionMatch += 1;
      } else if (admissionEval.code === 'ADMISSION_RECORD_MISSING') {
        categories.admissionMissing += 1;
      } else if (admissionEval.code === 'ADMISSION_REVISION_MISMATCH') {
        categories.admissionRevisionMismatch += 1;
      } else {
        categories.releasePreconditionBlocked += 1;
      }

      if (gate.ok) categories.productReadWouldSucceed += 1;
    }

    console.log(
      JSON.stringify(
        {
          schema: 'EXP021_CURRENT_V2_READABILITY_INVENTORY_V1',
          observedAtUtc,
          qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
          categories,
          note:
            'Disjoint primary buckets for admission use first-match priority: open trip, then valid admission, missing, revision mismatch, other release blocks. productReadWouldSucceed is separate (gate pass count).',
          productionMutations: 'NONE',
          providerCalls: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
