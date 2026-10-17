#!/usr/bin/env ts-node
/**
 * EXP021 EV Ground Truth — read-only boundary + stop/creep forensic export (no mutations, no provider calls).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  readCurrentBoundaryRepairGeneration,
  readRawDetectionMeta,
} from '../../src/modules/vehicle-intelligence/trips/boundary-repair.state.util';
import {
  buildTripFsmForensicsR8V1,
  resolveStartForensicProvenance,
} from '../../src/modules/vehicle-intelligence/trips/trip-fsm-forensics.util';
import {
  readLifecycleRecoveryRoot,
  readStartEpisodeFromTrip,
} from '../../src/modules/vehicle-intelligence/trips/trip-lifecycle-recovery-meta';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import {
  EXP021_EV_GT_REFERENCE,
  EXP021_FORENSIC_FOCUS_WINDOWS_UTC,
  EXP021_VIDEO_ANCHOR_UTC,
  enumerateBucketLabelsInclusive,
  exportBucketWithContext,
  exportForensicBucket,
  pickStationarySupportedIntervals,
  verifyBaselineParity,
} from './exp021-ev-ground-truth-forensic-export.lib';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';

const REF = EXP021_EV_GT_REFERENCE;

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256File(filePath: string): string {
  const h = createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function pickEvidenceSummaryFields(summary: Record<string, unknown> | null): Record<string, unknown> {
  if (!summary) return {};
  const keys = [
    'confirmedStartAt',
    'confirmedStartSource',
    'confirmedEndAt',
    'confirmedEndSource',
    'startCandidateAt',
    'startCandidateObservedAt',
    'startCandidateEnteredAt',
    'startRecognizedAt',
    'startCandidateClockSource',
    'startEvidencePath',
    'startBoundaryAdjustedMs',
    'endCandidateAt',
    'endCandidateEnteredAt',
    'endRecognizedAt',
    'endBoundaryAdjustedMs',
    'dimoSegmentId',
    'segmentId',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (summary[k] !== undefined) out[k] = summary[k];
  }
  return out;
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const observedAtUtc = new Date().toISOString();
  const organizationId = process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId;
  const tripId = process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId;
  const workItemId = process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId;
  const productionSha = process.env.EXP021_EV_GT_PRODUCTION_SHA ?? REF.productionSha;

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });

    const tripRows = await prisma.$queryRaw<
      Array<{
        start_time: Date;
        end_time: Date | null;
        trip_status: string;
        dimo_segment_id: string | null;
        merge_parent_trip_id: string | null;
        raw_detection_meta: unknown;
        is_repaired: boolean;
        created_at: Date;
        start_detection_mode: string | null;
        possible_start_at: Date | null;
        first_activity_at: Date | null;
      }>
    >`
      SELECT start_time, end_time, trip_status::text AS trip_status, dimo_segment_id,
        merge_parent_trip_id, raw_detection_meta, is_repaired, created_at,
        start_detection_mode, possible_start_at, first_activity_at
      FROM vehicle_trips WHERE id = ${tripId} LIMIT 1`;
    const trip = tripRows[0];
    if (!trip?.end_time) throw new Error('trip not found or open');

    const detRows = await prisma.$queryRaw<
      Array<{
        state: string;
        active_trip_id: string | null;
        possible_start_at: Date | null;
        possible_start_entered_at: Date | null;
        possible_end_at: Date | null;
        possible_end_entered_at: Date | null;
        last_evidence_summary: unknown;
        start_detection_mode: string | null;
        start_confidence: string | null;
        updated_at: Date;
      }>
    >`
      SELECT dts.state::text AS state, dts.active_trip_id::text AS active_trip_id,
        dts.possible_start_at, dts.possible_start_entered_at,
        dts.possible_end_at, dts.possible_end_entered_at,
        dts.last_evidence_summary, dts.start_detection_mode, dts.start_confidence::text,
        dts.updated_at
      FROM vehicle_trip_detection_states dts
      JOIN vehicle_trips t ON t.vehicle_id = dts.vehicle_id
      WHERE t.id = ${tripId}
      LIMIT 1`;
    const det = detRows[0] ?? null;

    const trackingRuns = await prisma.$queryRaw<
      Array<{
        id: string;
        run_type: string;
        state_at_run: string;
        result_state: string | null;
        requested_from: Date | null;
        requested_to: Date | null;
        created_at: Date;
        result_summary: unknown;
      }>
    >`
      SELECT id, run_type, state_at_run::text, result_state::text,
        requested_from, requested_to, created_at, result_summary
      FROM vehicle_trip_tracking_runs
      WHERE trip_id = ${tripId}
      ORDER BY created_at ASC
      LIMIT 40`;

    const repairs = await prisma.$queryRaw<
      Array<{
        id: string;
        repair_type: string;
        status: string;
        reason: string;
        window_from: Date;
        window_to: Date;
        applied_at: Date | null;
        created_at: Date;
      }>
    >`
      SELECT id, repair_type, status, reason, window_from, window_to, applied_at, created_at
      FROM trip_repairs WHERE trip_id = ${tripId}
      ORDER BY created_at ASC`;

    const rawMeta = readRawDetectionMeta(trip.raw_detection_meta);
    const evidenceSummary =
      det?.last_evidence_summary && typeof det.last_evidence_summary === 'object'
        ? (det.last_evidence_summary as Record<string, unknown>)
        : null;

    const startProv = resolveStartForensicProvenance({
      evidenceSummary,
      detPossibleStartAt: det?.possible_start_at ?? null,
      detPossibleStartEnteredAt: det?.possible_start_entered_at ?? null,
      tripCanonicalStartAt: trip.start_time,
      priorRawDetectionMeta: trip.raw_detection_meta,
    });

    const fsmForensicsBlock =
      (rawMeta.tripFsmForensics as Record<string, unknown> | undefined) ??
      buildTripFsmForensicsR8V1({
        startCandidateAt: startProv.startCandidateAt,
        startCandidateClockSource: startProv.startCandidateClockSource,
        startCandidateEnteredAt: startProv.startCandidateEnteredAt,
        startRecognizedAt: startProv.startRecognizedAt,
        canonicalStartAt: startProv.startEpisodeCanonicalAt,
        tripCanonicalStartAt: trip.start_time,
        startBoundarySource: startProv.startBoundarySource,
        startEvidencePath: startProv.startEvidencePath,
        startBoundaryAdjustedMs: startProv.startBoundaryAdjustedMs,
      });

    const lifecycleRecovery = readLifecycleRecoveryRoot(trip.raw_detection_meta);
    const startEpisode = readStartEpisodeFromTrip(trip.raw_detection_meta);

    const perSecond = buildEvGroundTruthPerSecondReplay(ctx);
    const parity = verifyBaselineParity(perSecond);

    const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const shadowMap = new Map<string, DiV0TripSpeedQualityShadowRow>();
    for (const r of ctx.shadowIntervals) {
      shadowMap.set(dateToBucketLabel(r.referenceTime), r);
    }

    const preVideoBuckets = enumerateBucketLabelsInclusive(
      '2026-10-16T03:36:00Z',
      '2026-10-16T03:37:40Z',
    );
    const preVideoPrefix = preVideoBuckets.map((label) =>
      exportForensicBucket(label, ctx, shadowMap.get(label), posByLabel),
    );

    const stationarySupportedIntervals = pickStationarySupportedIntervals(perSecond);

    const focusWindows = EXP021_FORENSIC_FOCUS_WINDOWS_UTC.map((w) => {
      const centers = enumerateBucketLabelsInclusive(w.from, w.to);
      return {
        ...w,
        bucketCount: centers.length,
        buckets: centers.map((c) => exportBucketWithContext(c, ctx, 5)),
      };
    });

    const boundaryProvenance = {
      schema: 'EXP021_EV_GT_BOUNDARY_PROVENANCE_V1',
      observedAtUtc,
      productionSha,
      analysisCodeSha: process.env.EXP021_EV_GT_ANALYSIS_CODE_SHA ?? null,
      tripId,
      vehicleId: ctx.workItem!.vehicle_id,
      organizationId,
      persisted: {
        startUtc: trip.start_time.toISOString(),
        endUtc: trip.end_time.toISOString(),
        tripStatus: trip.trip_status,
        dimoSegmentId: trip.dimo_segment_id,
        mergeParentTripId: trip.merge_parent_trip_id,
        isRepaired: trip.is_repaired,
        boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(trip.raw_detection_meta),
        tripCreatedAtUtc: trip.created_at.toISOString(),
        startDetectionModeOnTripRow: trip.start_detection_mode,
        possibleStartAtOnTripRowUtc: trip.possible_start_at?.toISOString() ?? null,
        firstActivityAtUtc: trip.first_activity_at?.toISOString() ?? null,
      },
      externalVideoAnchor: {
        firstVisibleClockUtc: EXP021_VIDEO_ANCHOR_UTC,
        offsetSecondsPersistedStartToVideoAnchor: 101,
        note: 'Owner: physical reverse maneuver at video t=0; no earlier video file.',
      },
      detectionStateAtExport: det
        ? {
            state: det.state,
            activeTripId: det.active_trip_id,
            possibleStartAtUtc: det.possible_start_at?.toISOString() ?? null,
            possibleStartEnteredAtUtc: det.possible_start_entered_at?.toISOString() ?? null,
            startDetectionMode: det.start_detection_mode,
            startConfidence: det.start_confidence,
            detectionStateUpdatedAtUtc: det.updated_at.toISOString(),
          }
        : null,
      lastEvidenceSummaryTripFields: pickEvidenceSummaryFields(evidenceSummary),
      resolvedStartForensicProvenance: {
        startCandidateAtUtc: startProv.startCandidateAt?.toISOString() ?? null,
        startCandidateEnteredAtUtc: startProv.startCandidateEnteredAt?.toISOString() ?? null,
        startRecognizedAtUtc: startProv.startRecognizedAt?.toISOString() ?? null,
        startEpisodeCanonicalAtUtc: startProv.startEpisodeCanonicalAt.toISOString(),
        tripCanonicalStartAtUtc: startProv.tripCanonicalStartAt.toISOString(),
        startCandidateClockSource: startProv.startCandidateClockSource,
        startBoundarySource: startProv.startBoundarySource,
        startEvidencePath: startProv.startEvidencePath,
        startBoundaryAdjustedMs: startProv.startBoundaryAdjustedMs,
      },
      rawDetectionMetaSlices: {
        tripFsmForensics: rawMeta.tripFsmForensics ?? null,
        diV0BoundaryAdmissionV1: rawMeta.diV0BoundaryAdmissionV1 ?? null,
        lifecycleRecovery,
        startEpisode,
      },
      tripFsmForensicsResolved: fsmForensicsBlock,
      repairHistory: repairs.map((r) => ({
        id: r.id,
        repairType: r.repair_type,
        status: r.status,
        reason: r.reason,
        windowFromUtc: r.window_from.toISOString(),
        windowToUtc: r.window_to.toISOString(),
        appliedAtUtc: r.applied_at?.toISOString() ?? null,
        createdAtUtc: r.created_at.toISOString(),
      })),
      trackingRunSummaries: trackingRuns.map((r) => ({
        id: r.id,
        runType: r.run_type,
        stateAtRun: r.state_at_run,
        resultState: r.result_state,
        requestedFromUtc: r.requested_from?.toISOString() ?? null,
        requestedToUtc: r.requested_to?.toISOString() ?? null,
        createdAtUtc: r.created_at.toISOString(),
        resultSummaryStartFields: pickEvidenceSummaryFields(
          r.result_summary && typeof r.result_summary === 'object'
            ? (r.result_summary as Record<string, unknown>)
            : null,
        ),
      })),
      eventTimeline: [
        {
          role: 'PERSISTED_TRIP_START',
          atUtc: trip.start_time.toISOString(),
          sourceField: 'vehicle_trips.start_time',
          epistemic: 'CONFIRMED',
        },
        {
          role: 'DIMO_SEGMENT_ID_LINK',
          atUtc: trip.start_time.toISOString(),
          segmentId: trip.dimo_segment_id,
          sourceField: 'vehicle_trips.dimo_segment_id',
          epistemic: trip.dimo_segment_id ? 'CONFIRMED' : 'UNKNOWN',
        },
        {
          role: 'S4_ACQUISITION_GRID_START',
          atUtc: ctx.acquisitionWindow.startLabel,
          sourceField: 'di_v0_s4_evidence_snapshots.acquisition_window_start',
          epistemic: 'CONFIRMED',
        },
        {
          role: 'FSM_START_CANDIDATE',
          atUtc: startProv.startCandidateAt?.toISOString() ?? null,
          sourceField: 'last_evidence_summary.startCandidateAt | possible_start_at',
          epistemic: startProv.startCandidateAt ? 'CONFIRMED' : 'UNKNOWN',
        },
        {
          role: 'FSM_START_RECOGNIZED',
          atUtc: startProv.startRecognizedAt?.toISOString() ?? null,
          sourceField: 'last_evidence_summary.startRecognizedAt',
          epistemic: startProv.startRecognizedAt ? 'CONFIRMED' : 'UNKNOWN',
        },
        {
          role: 'CONFIRMED_START_BOUNDARY',
          atUtc: startProv.startEpisodeCanonicalAt.toISOString(),
          boundarySource: startProv.startBoundarySource,
          adjustedMs: startProv.startBoundaryAdjustedMs,
          sourceField: 'confirmedStartAt | lifecycleRecovery.startEpisode',
          epistemic: 'CONFIRMED',
        },
        {
          role: 'EXTERNAL_VIDEO_OVERLAY_CLOCK',
          atUtc: EXP021_VIDEO_ANCHOR_UTC,
          sourceField: 'owner_video_TC_00062_first_frame',
          epistemic: 'CONFIRMED_EXTERNAL_REVIEW',
        },
      ],
      provenanceGaps: [
        {
          field: 'provider_segment_start_time_payload',
          reason: 'DIMO segment timestamps not stored in frozen pre-deploy bundle; requires provider API or segment cache row export (not fetched in this task).',
        },
        {
          field: 'telemetry_ingest_receive_time',
          reason: 'Not exported in pinned S4 snapshot or per-second replay.',
        },
        {
          field: 'fsm_worker_processing_instant_at_trip_create',
          reason: 'Requires raw_detection_meta / tracking run payload — partial export above; empty if fields were never persisted.',
        },
      ],
      codePathReference: {
        resolveConfirmedStartBoundary:
          'backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts — DIMO segment preferred over route/core refinement',
        tripStartBoundaryMaxLookbackMs: 'env TRIP_START_BOUNDARY_MAX_LOOKBACK_MS (default 35 min) — not re-read from Production in this export',
      },
      productionMutations: 'NONE',
      providerCalls: 'NONE',
    };

    const stopCreepForensic = {
      schema: 'EXP021_EV_GT_STOP_CREEP_FORENSIC_V1',
      observedAtUtc,
      productionSha,
      baselineParity: parity,
      pinnedSnapshotHash: ctx.pinnedSnapshotHash,
      combinedInputIdentity: ctx.workItem!.combined_input_identity,
      stationarySupportedIntervals,
      preVideoPersistedStartPrefix: {
        bucketCount: preVideoPrefix.length,
        rowAbsentCount: preVideoPrefix.filter((r) => r.positionGapDiagnosis === 'ROW_ABSENT_EXPLICIT')
          .length,
        presentCount: preVideoPrefix.filter((r) => r.positionGapDiagnosis === 'PRESENT_OK').length,
        buckets: preVideoPrefix,
      },
      focusWindows,
      aggregateVideoTachoZeroCrossTab: {
        note: 'Cross-tab from frozen replay for buckets in video tacho-zero windows (no tacho values in DB export).',
        buckets: EXP021_FORENSIC_FOCUS_WINDOWS_UTC.filter((w) => w.id.startsWith('video_tacho_zero'))
          .flatMap((w) => enumerateBucketLabelsInclusive(w.from, w.to))
          .map((label) => {
            const row = perSecond.find((r) => r.bucketLabelUtc === label);
            return {
              bucketLabelUtc: label,
              positionAvailability: row?.positionAvailability ?? null,
              motionState: row?.motionState ?? null,
              qcTrustLevel: row?.qcTrustLevel ?? null,
              qcReasonCodes: row?.qcReasonCodes ?? [],
              l3SpeedKmh: row?.l3SpeedKmh ?? null,
            };
          }),
      },
      semanticsNote: {
        stationarySupportedMeaning:
          'QC V2 TRUSTED_LIMITED with motionState=STATIONARY_SUPPORTED and speedEvidenceState=STATIONARY_BAND — evaluates low-speed/stop band, not a guarantee of physical speed 0.',
        rowAbsentMeaning:
          'ROW_ABSENT in pinned POSITION snapshot — acquisition/sampling gap in S4 evidence, not auto-filled in replay.',
        noMotionEvidenceMeaning:
          'S1 motionState NO_MOTION_EVIDENCE — distinct from STATIONARY_SUPPORTED band acceptance.',
      },
      productionMutations: 'NONE',
      providerCalls: 'NONE',
    };

    fs.mkdirSync(outDir, { recursive: true });
    const boundaryPath = path.join(outDir, 'TRIP_BOUNDARY_PROVENANCE_EXPORT.json');
    const stopPath = path.join(outDir, 'STOP_CREEP_DATA_GAP_FORENSIC_EXPORT.json');
    const manifestPath = path.join(outDir, 'FORENSIC_EXPORT_MANIFEST.json');

    fs.writeFileSync(boundaryPath, JSON.stringify(boundaryProvenance, null, 2));
    fs.writeFileSync(stopPath, JSON.stringify(stopCreepForensic, null, 2));

    const manifest = {
      schema: 'EXP021_EV_GT_FORENSIC_EXPORT_MANIFEST_V1',
      observedAtUtc,
      productionSha,
      tripId,
      organizationId,
      workItemId,
      generationCommand:
        'cd backend && npm run exp021:ev-ground-truth:forensic-export -- --out-dir <dir>',
      artifacts: {
        tripBoundaryProvenance: {
          path: path.basename(boundaryPath),
          sha256: sha256File(boundaryPath),
        },
        stopCreepDataGap: {
          path: path.basename(stopPath),
          sha256: sha256File(stopPath),
        },
      },
      baselineParity: parity,
      frozenPreDeployPackageUnchanged: true,
      productionMutations: 'NONE',
      providerCalls: 'NONE',
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const sums = `${sha256File(manifestPath)}  ${path.basename(manifestPath)}\n${sha256File(boundaryPath)}  ${path.basename(boundaryPath)}\n${sha256File(stopPath)}  ${path.basename(stopPath)}\n`;
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), sums);

    process.stdout.write(
      JSON.stringify(
        {
          ok: parity.ok,
          outDir,
          baselineParity: parity,
          dimoSegmentId: trip.dimo_segment_id,
          startBoundarySource: startProv.startBoundarySource,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
