#!/usr/bin/env ts-node
/**
 * EXP021 — read-only FSM / trip / S4 / acquisition timeline for one WI.
 * No provider calls; no writes.
 */
import * as fs from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { buildDiV0S4BoundaryFingerprint } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { deriveSecondAlignedEnclosingWindow } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-window';
import { DI_V0_S4_LIMITS } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-projection.types';

const ORG = process.env.EXP021_FSM_ORG ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TRIP = process.env.EXP021_FSM_TRIP_ID ?? '533b2bf8-fa07-4f0b-bc40-d540447a1542';
const WI = process.env.EXP021_FSM_WORK_ITEM_ID ?? '339856c6-a4af-43f8-aecd-07baacec3d22';
const VEHICLE = process.env.EXP021_FSM_VEHICLE_ID ?? '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const OUT = process.env.EXP021_FSM_TIMELINE_OUT ?? '/tmp/exp021-fsm-acquisition-timeline.json';
const GAP_BEFORE = '2026-10-14T14:58:35Z';
const GAP_AFTER = '2026-10-14T15:21:20Z';

function readBoundaryRepairGeneration(raw: unknown): string | null {
  if (raw == null || typeof raw !== 'object') return null;
  const br = (raw as Record<string, unknown>).boundaryRepair;
  if (br == null || typeof br !== 'object') return null;
  const gen = (br as Record<string, unknown>).generation;
  return typeof gen === 'string' ? gen : null;
}

function countPosPresent(labels: string[], posByLabel: Map<string, { availability: string }>): number {
  let n = 0;
  for (const l of labels) {
    const b = posByLabel.get(l);
    if (b && b.availability !== 'ROW_ABSENT') n += 1;
  }
  return n;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const productionReleaseSha = process.env.EXP021_RUNTIME_GIT_SHA ?? process.env.SYNQDRIVE_RELEASE_GIT_SHA ?? null;
  const analysisGitSha = process.env.EXP021_ANALYSIS_GIT_SHA ?? 'workspace';

  try {
    const report = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL transaction_read_only = on`;

        const wiRows = await tx.$queryRaw<
          Array<{
            id: string;
            trip_id: string;
            vehicle_id: string;
            status: string;
            run_purpose: string;
            boundary_fingerprint: string;
            boundary_occurrence: number;
            created_at: Date;
            updated_at: Date;
            completed_at: Date | null;
            settlement_anchor_at: Date | null;
            eligible_at: Date | null;
            pinned_snapshot_hash: string | null;
            pinned_at: Date | null;
            combined_input_identity: string | null;
            pipeline_version_key: string;
            shadow_run_id: string | null;
          }>
        >`
          SELECT id, trip_id, vehicle_id, status::text AS status, run_purpose::text AS run_purpose,
                 boundary_fingerprint, boundary_occurrence, created_at, updated_at, completed_at,
                 settlement_anchor_at, eligible_at, pinned_snapshot_hash, pinned_at, combined_input_identity,
                 pipeline_version_key, shadow_run_id
          FROM di_v0_s4_work_items
          WHERE organization_id = ${ORG} AND id = ${WI}
          LIMIT 1`;

        const wi = wiRows[0];
        if (!wi) throw new Error('WORK_ITEM_NOT_FOUND');

        const tripRows = await tx.$queryRaw<
          Array<{
            id: string;
            start_time: Date;
            end_time: Date | null;
            created_at: Date;
            trip_status: string;
            dimo_segment_id: string | null;
            merge_parent_trip_id: string | null;
            raw_detection_meta: unknown;
            possible_end_at: Date | null;
            last_activity_at: Date | null;
            first_activity_at: Date | null;
            duration_minutes: number | null;
            distance_km: number | null;
            end_detection_mode: string | null;
            start_detection_mode: string | null;
            trip_source: string;
            is_repaired: boolean;
            gap_ended: boolean;
            enriched_at: Date | null;
          }>
        >`
          SELECT id, start_time, end_time, created_at, trip_status::text AS trip_status,
                 dimo_segment_id, merge_parent_trip_id, raw_detection_meta,
                 possible_end_at, last_activity_at, first_activity_at, duration_minutes, distance_km,
                 end_detection_mode, start_detection_mode, trip_source::text AS trip_source,
                 is_repaired, gap_ended, enriched_at
          FROM vehicle_trips WHERE id::text = ${TRIP} LIMIT 1`;

        const trip = tripRows[0];
        if (!trip) throw new Error('TRIP_NOT_FOUND');

        const repairs = await tx.$queryRaw<
          Array<{ id: string; status: string; applied_at: Date | null; created_at: Date; repair_type: string }>
        >`
          SELECT id, status, applied_at, created_at, repair_type
          FROM trip_repairs WHERE trip_id::text = ${TRIP} ORDER BY created_at ASC`;

        const allWi = await tx.$queryRaw<
          Array<{ id: string; status: string; boundary_fingerprint: string; created_at: Date; completed_at: Date | null }>
        >`
          SELECT id, status::text AS status, boundary_fingerprint, created_at, completed_at
          FROM di_v0_s4_work_items
          WHERE organization_id = ${ORG} AND trip_id::text = ${TRIP}
          ORDER BY created_at ASC`;

        const snapRows = await tx.$queryRaw<
          Array<{
            snapshot_hash: string;
            acquisition_window_start: Date;
            acquisition_window_end: Date;
            created_at: Date;
            boundary_fingerprint: string;
            channel_manifest: unknown;
            payload_gzip: Buffer;
            uncompressed_bytes: number | bigint;
          }>
        >`
          SELECT snapshot_hash, acquisition_window_start, acquisition_window_end, created_at, boundary_fingerprint,
                 channel_manifest, payload_gzip, uncompressed_bytes
          FROM di_v0_s4_evidence_snapshots
          WHERE organization_id = ${ORG} AND trip_id::text = ${TRIP}
            AND snapshot_hash = ${wi.pinned_snapshot_hash}
          LIMIT 1`;

        const snap = snapRows[0];
        if (!snap) throw new Error('SNAPSHOT_NOT_FOUND');

        const shadowBounds =
          wi.shadow_run_id != null
            ? await tx.$queryRaw<Array<{ min_ref: Date; max_ref: Date; row_count: bigint }>>`
                SELECT min(reference_time) AS min_ref, max(reference_time) AS max_ref, count(*)::bigint AS row_count
                FROM di_v0_shadow_intervals
                WHERE organization_id = ${ORG} AND trip_id::text = ${TRIP}
                  AND shadow_run_id = ${wi.shadow_run_id}`
            : [];

        const trackingRuns = await tx.$queryRaw<
          Array<{ id: string; created_at: Date; state_at_run: string; result_state: string | null; run_type: string }>
        >`
          SELECT id, created_at, state_at_run::text AS state_at_run, result_state::text AS result_state, run_type::text AS run_type
          FROM vehicle_trip_tracking_runs
          WHERE trip_id::text = ${TRIP}
            AND created_at >= ${new Date('2026-10-14T14:00:00Z')}
            AND created_at < ${new Date('2026-10-14T18:00:00Z')}
          ORDER BY created_at ASC
          LIMIT 100`;

        const detectionState = await tx.$queryRaw<
          Array<{ state: string; last_activity_at: Date | null; possible_end_at: Date | null; active_trip_id: string | null }>
        >`
          SELECT state::text AS state, last_activity_at, possible_end_at, active_trip_id::text AS active_trip_id
          FROM vehicle_trip_detection_states WHERE vehicle_id::text = ${VEHICLE} LIMIT 1`;

        const projections = await tx.$queryRaw<
          Array<{ id: string; projection_version: string; qc_policy_version: string; lifecycle_status: string; created_at: Date }>
        >`
          SELECT id, projection_version, qc_policy_version, lifecycle_status::text AS lifecycle_status, created_at
          FROM di_v0_trip_speed_quality_projections_v1
          WHERE organization_id = ${ORG} AND work_item_id = ${WI}
          ORDER BY created_at ASC`;

        const neighborTrips = await tx.$queryRaw<
          Array<{ id: string; start_time: Date; end_time: Date | null; trip_status: string; dimo_segment_id: string | null }>
        >`
          SELECT id, start_time, end_time, trip_status::text AS trip_status, dimo_segment_id
          FROM vehicle_trips
          WHERE vehicle_id::text = ${VEHICLE}
            AND start_time >= ${new Date('2026-10-14T12:00:00Z')}
            AND start_time < ${new Date('2026-10-14T20:00:00Z')}
          ORDER BY start_time ASC`;

        const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
          {
            organization_id: ORG,
            vehicle_id: wi.vehicle_id,
            trip_id: wi.trip_id,
            boundary_fingerprint: wi.boundary_fingerprint,
            acquisition_window_start: snap.acquisition_window_start,
            acquisition_window_end: snap.acquisition_window_end,
            channel_manifest: snap.channel_manifest,
            payload_gzip: snap.payload_gzip,
            uncompressed_bytes: snap.uncompressed_bytes,
          },
          {
            organizationId: ORG,
            vehicleId: wi.vehicle_id,
            tripId: wi.trip_id,
            boundaryFingerprint: wi.boundary_fingerprint,
            snapshotHash: wi.pinned_snapshot_hash!,
            sourceFamily: 'RUPTELA_R1' as DiV0S4SourceFamily,
          },
        );
        if (!verified.ok) throw new Error(`SNAPSHOT_VERIFY:${verified.code}`);

        const posPayload = verified.parsed.channelPayloads.POSITION;
        const r1Payload = verified.parsed.channelPayloads.R1_OBD;
        const posEntry = verified.parsed.channelManifest.find((c) => c.channel === 'POSITION');
        const position =
          posPayload && posEntry?.formatVersion === DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1
            ? parseDiV0PositionSnapshot(posPayload)
            : null;
        const posByLabel = new Map(position?.buckets.map((b) => [b.bucketLabel, b]) ?? []);
        const allLabels = position?.buckets.map((b) => b.bucketLabel) ?? [];
        const postGapLabels = allLabels.filter((l) => Date.parse(l) > Date.parse(GAP_AFTER));
        const postGapPresent = countPosPresent(postGapLabels, posByLabel);

        const currentFp = buildDiV0S4BoundaryFingerprint({
          organizationId: ORG,
          vehicleId: VEHICLE,
          tripId: TRIP,
          tripStatus: trip.trip_status,
          startTime: trip.start_time,
          endTime: trip.end_time,
          dimoSegmentId: trip.dimo_segment_id,
          mergeParentTripId: trip.merge_parent_trip_id,
          boundaryRepairGeneration: readBoundaryRepairGeneration(trip.raw_detection_meta),
        });

        const enclosingFromCurrent =
          trip.end_time != null
            ? deriveSecondAlignedEnclosingWindow(trip.start_time.getTime(), trip.end_time.getTime())
            : null;

        const enclosingFromPinned = deriveSecondAlignedEnclosingWindow(
          snap.acquisition_window_start.getTime(),
          snap.acquisition_window_end.getTime(),
        );

        const quietSeconds =
          wi.settlement_anchor_at && wi.eligible_at
            ? Math.round((wi.eligible_at.getTime() - wi.settlement_anchor_at.getTime()) / 1000)
            : null;

        return {
          kind: 'EXP021_FSM_ACQUISITION_TIMELINE_V1',
          sha: { productionReleaseSha, analysisGitSha },
          scope: { org: ORG, trip: TRIP, workItem: WI, vehicle: VEHICLE },
          quietPeriodConfig: {
            settlementQuietPeriodSeconds: DI_V0_S4_LIMITS.settlementQuietPeriodSeconds,
            source: 'DI_V0_S4_LIMITS.settlementQuietPeriodSeconds (s4a-contract)',
            note: 'Eligible_at = settlement_anchor_at + quiet period at WI insert; does NOT widen acquisition window.',
          },
          acquisitionWindowLineage: {
            answerA_fieldSupplyingEnd:
              'Pinned di_v0_s4_evidence_snapshots.acquisition_window_end (written by S4C from deriveSecondAlignedEnclosingWindow(trip.start_time, trip.end_time) at execution)',
            answerB_natureOfEnd:
              'Second-aligned ceil of vehicle_trips.end_time at S4 execution — fachliches FSM/segment trip end, not WI completed_at and not eligible_at',
            answerC_quietPeriodInWindow:
              'No — quiet period gates enqueue/eligible_at only; acquisition window is trip start/end alignment per di-v0-s4c-acquisition-context.ts',
            pinnedWindow: {
              startInclusiveUtc: snap.acquisition_window_start.toISOString(),
              endExclusiveUtc: snap.acquisition_window_end.toISOString(),
              bucketCount: allLabels.length,
              matchesDeriveFromPinnedStorage: enclosingFromPinned,
            },
            currentTripEnclosingWindow: enclosingFromCurrent,
            currentTripTimes: {
              start_time: trip.start_time.toISOString(),
              end_time: trip.end_time?.toISOString() ?? null,
            },
          },
          boundaryFingerprint: {
            pinnedOnWorkItem: wi.boundary_fingerprint,
            recomputedFromCurrentTrip: currentFp,
            matchesCurrentTrip: currentFp === wi.boundary_fingerprint,
            snapshotRowFingerprint: snap.boundary_fingerprint,
          },
          workItem: {
            ...wi,
            created_at: wi.created_at.toISOString(),
            updated_at: wi.updated_at.toISOString(),
            completed_at: wi.completed_at?.toISOString() ?? null,
            settlement_anchor_at: wi.settlement_anchor_at?.toISOString() ?? null,
            eligible_at: wi.eligible_at?.toISOString() ?? null,
            pinned_at: wi.pinned_at?.toISOString() ?? null,
            quietSecondsObserved: quietSeconds,
          },
          trip: {
            ...trip,
            start_time: trip.start_time.toISOString(),
            end_time: trip.end_time?.toISOString() ?? null,
            created_at: trip.created_at.toISOString(),
            possible_end_at: trip.possible_end_at?.toISOString() ?? null,
            last_activity_at: trip.last_activity_at?.toISOString() ?? null,
            first_activity_at: trip.first_activity_at?.toISOString() ?? null,
            enriched_at: trip.enriched_at?.toISOString() ?? null,
            boundaryRepairGeneration: readBoundaryRepairGeneration(trip.raw_detection_meta),
          },
          tripRepairs: repairs.map((r) => ({
            ...r,
            applied_at: r.applied_at?.toISOString() ?? null,
            created_at: r.created_at.toISOString(),
          })),
          allWorkItemsForTrip: allWi.map((w) => ({
            ...w,
            created_at: w.created_at.toISOString(),
            completed_at: w.completed_at?.toISOString() ?? null,
          })),
          evidenceSnapshot: {
            snapshot_hash: snap.snapshot_hash,
            created_at: snap.created_at.toISOString(),
            acquisition_window_start: snap.acquisition_window_start.toISOString(),
            acquisition_window_end: snap.acquisition_window_end.toISOString(),
          },
          shadowIntervals: shadowBounds[0]
            ? {
                min_reference_time: shadowBounds[0].min_ref.toISOString(),
                max_reference_time: shadowBounds[0].max_ref.toISOString(),
                row_count: Number(shadowBounds[0].row_count),
              }
            : null,
          projections: projections.map((p) => ({ ...p, created_at: p.created_at.toISOString() })),
          neighborTrips: neighborTrips.map((t) => ({
            id: t.id,
            start_time: t.start_time.toISOString(),
            end_time: t.end_time?.toISOString() ?? null,
            trip_status: t.trip_status,
            dimo_segment_id: t.dimo_segment_id,
          })),
          trackingRuns: trackingRuns.map((r) => ({ ...r, created_at: r.created_at.toISOString() })),
          detectionStateNow: detectionState[0]
            ? {
                ...detectionState[0],
                last_activity_at: detectionState[0].last_activity_at?.toISOString() ?? null,
                possible_end_at: detectionState[0].possible_end_at?.toISOString() ?? null,
              }
            : null,
          postGapAndTail: {
            gapBoundariesPresent: [GAP_BEFORE, GAP_AFTER],
            positionBucketsAfterGapUntilAcqEnd: postGapLabels.length,
            positionPresentAfterGap: postGapPresent,
            positionAbsentAfterGap: postGapLabels.length - postGapPresent,
            interpretation:
              'Post-gap POSITION present rows indicate movement/telemetry resumed before acquisition end; not explainable as quiet-period padding alone.',
          },
          fsmStateHistoryStored: 'UNKNOWN — no persisted FSM transition log table queried; only current detection state + tracking run summaries.',
        };
      },
      { timeout: 180_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
