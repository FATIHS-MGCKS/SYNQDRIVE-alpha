#!/usr/bin/env ts-node
/**
 * EXP021 EV Ground Truth — read-only pre/post deploy baseline (no mutations, no provider calls).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildDiV0S4BoundaryFingerprint } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { readCurrentBoundaryRepairGeneration } from '../../src/modules/vehicle-intelligence/trips/boundary-repair.state.util';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import {
  evaluateEvGtAdmission,
  evaluateEvGtProductReadGate,
  type EvGtAdmissionScope,
} from './exp021-ev-ground-truth-admission.lib';

const ORG = process.env.EXP021_EV_GT_ORG_ID;
const TRIP = process.env.EXP021_EV_GT_TRIP_ID;
const WI = process.env.EXP021_EV_GT_WORK_ITEM_ID;
const PROJECTION_ID = process.env.EXP021_EV_GT_PROJECTION_ID;
const BASELINE_PHASE = process.env.EXP021_EV_GT_BASELINE_PHASE ?? 'PRE_DEPLOY';
const PRODUCTION_SHA = process.env.EXP021_EV_GT_PRODUCTION_SHA ?? null;
const ANALYSIS_CODE_SHA = process.env.EXP021_EV_GT_ANALYSIS_CODE_SHA ?? null;

function req(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

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

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const organizationId = req('EXP021_EV_GT_ORG_ID', ORG);
  const tripId = req('EXP021_EV_GT_TRIP_ID', TRIP);
  const workItemId = req('EXP021_EV_GT_WORK_ITEM_ID', WI);
  const projectionId = process.env.EXP021_EV_GT_PROJECTION_ID ?? null;

  const observedAtUtc = new Date().toISOString();
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
      }>
    >`
      SELECT start_time, end_time, trip_status::text AS trip_status, dimo_segment_id,
        merge_parent_trip_id, raw_detection_meta, is_repaired
      FROM vehicle_trips WHERE id = ${tripId} LIMIT 1`;
    const trip = tripRows[0];
    if (!trip?.end_time) throw new Error('trip not found or open');

    const fsmRows = await prisma.$queryRaw<
      Array<{ state: string; active_trip_id: string | null }>
    >`
      SELECT state::text AS state, active_trip_id::text AS active_trip_id
      FROM vehicle_trip_detection_states dts
      JOIN vehicle_trips t ON t.vehicle_id = dts.vehicle_id
      WHERE t.id = ${tripId} LIMIT 1`;
    const fsm = fsmRows[0] ?? null;

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

    const snapshotMeta = await prisma.$queryRaw<
      Array<{
        acquisition_window_start: Date;
        acquisition_window_end: Date;
        channel_manifest: unknown;
      }>
    >`
      SELECT acquisition_window_start, acquisition_window_end, channel_manifest
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${organizationId} AND trip_id = ${tripId}
        AND snapshot_hash = ${ctx.pinnedSnapshotHash}
      LIMIT 1`;
    const snap = snapshotMeta[0];

    const outboxRows = await prisma.$queryRaw<
      Array<{
        status: string;
        qc_policy_version: string;
        attempt_count: number;
        last_error_code: string | null;
        updated_at: Date;
      }>
    >`
      SELECT status, qc_policy_version, attempt_count, last_error_code, updated_at
      FROM di_v0_trip_speed_quality_auto_projection_outbox_v1
      WHERE work_item_id = ${workItemId} LIMIT 1`;

    const projWhere = projectionId
      ? prisma.$queryRaw<
          Array<{
            id: string;
            lifecycle_status: string;
            qc_policy_version: string;
            projection_version: string;
            projection_json: unknown;
            content_fingerprint: string;
            idempotency_key: string;
          }>
        >`
          SELECT id, lifecycle_status, qc_policy_version, projection_version, projection_json,
            content_fingerprint, idempotency_key
          FROM di_v0_trip_speed_quality_projections_v1
          WHERE id = ${projectionId} LIMIT 1`
      : prisma.$queryRaw<
          Array<{
            id: string;
            lifecycle_status: string;
            qc_policy_version: string;
            projection_version: string;
            projection_json: unknown;
            content_fingerprint: string;
            idempotency_key: string;
          }>
        >`
          SELECT id, lifecycle_status, qc_policy_version, projection_version, projection_json,
            content_fingerprint, idempotency_key
          FROM di_v0_trip_speed_quality_projections_v1
          WHERE organization_id = ${organizationId} AND trip_id = ${tripId}
            AND work_item_id = ${workItemId} AND lifecycle_status = 'CURRENT'
          ORDER BY created_at DESC LIMIT 1`;

    const projectionRows = await projWhere;
    const projectionRow = projectionRows[0];

    const liveFp = buildDiV0S4BoundaryFingerprint({
      organizationId,
      vehicleId: ctx.workItem!.vehicle_id,
      tripId,
      tripStatus: trip.trip_status,
      startTime: trip.start_time,
      endTime: trip.end_time,
      dimoSegmentId: trip.dimo_segment_id,
      mergeParentTripId: trip.merge_parent_trip_id,
      boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(trip.raw_detection_meta),
    });

    const admissionScope: EvGtAdmissionScope = {
      organizationId,
      vehicleId: ctx.workItem!.vehicle_id,
      tripId,
      tripStatus: trip.trip_status,
      startTime: trip.start_time,
      endTime: trip.end_time,
      dimoSegmentId: trip.dimo_segment_id,
      mergeParentTripId: trip.merge_parent_trip_id,
      rawDetectionMeta: trip.raw_detection_meta,
      detectionState: fsm?.state ?? null,
      activeTripId: fsm?.active_trip_id ?? null,
      proposedBoundaryRepairCount: repairs.filter((r) => r.status === 'PROPOSED').length,
    };
    const admissionEval = evaluateEvGtAdmission(admissionScope);
    const productGate = evaluateEvGtProductReadGate(
      admissionScope,
      ctx.workItem!.boundary_fingerprint,
    );

    const perSecond = buildEvGroundTruthPerSecondReplay(ctx);
    const pj = projectionRow?.projection_json as Record<string, unknown> | undefined;
    const quality = (pj?.quality as Record<string, unknown> | undefined) ?? null;
    const speed = (pj?.speed as Record<string, unknown> | undefined) ?? null;

    const boundaryReconciliation = {
      ownerReportedEndBerlin: '2026-10-16T05:54:55.989+02:00',
      tripEndUtc: trip.end_time.toISOString(),
      snapshotAcquisitionStartUtc: snap?.acquisition_window_start?.toISOString() ?? null,
      snapshotAcquisitionEndUtc: snap?.acquisition_window_end?.toISOString() ?? null,
      acquisitionGridStartLabel: ctx.acquisitionWindow.startLabel,
      acquisitionGridEndLabel: ctx.acquisitionWindow.endLabel,
      note:
        'Trip end (segment boundary) is not identical to exclusive 1s acquisition grid end; grid uses second-aligned bucket labels from snapshot window.',
      perSecondRowCount: perSecond.length,
    };

    const manifest = {
      schema: 'EXP021_EV_GROUND_TRUTH_BASELINE_MANIFEST_V1',
      baselinePhase: BASELINE_PHASE,
      observedAtUtc,
      productionSha: PRODUCTION_SHA,
      analysisCodeSha: ANALYSIS_CODE_SHA,
      generationCommand:
        'cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/exp021-ev-ground-truth-baseline.ts --out-dir <dir>',
      policyVersions: {
        qcPolicyVersion: projectionRow?.qc_policy_version ?? null,
        projectionVersion: projectionRow?.projection_version ?? null,
        calibrationVersion: ctx.shadowRun.calibrationVersion,
        inputEvidenceVersion: ctx.shadowRun.inputEvidenceVersion,
      },
      referenceCampaign: {
        codename: 'EXP021_EV_GROUND_TRUTH',
        vehicleLabel: 'Tesla Model 3 (owner-confirmed)',
        dimoTokenId: '186946',
        priorityNote: 'OPTIMIZATION_PRIORITY=1_AFTER_JOINT_DEPLOY; not part of current joint deploy',
      },
      identities: {
        organizationId,
        vehicleId: ctx.workItem!.vehicle_id,
        tripId,
        primaryWorkItemId: workItemId,
        shadowRunId: ctx.shadowRun.id,
        pinnedSnapshotHash: ctx.pinnedSnapshotHash,
        currentV2ProjectionId: projectionRow?.id ?? projectionId,
        boundaryFingerprintPinned: ctx.workItem!.boundary_fingerprint,
        boundaryFingerprintLive: liveFp,
        boundaryFingerprintMatch: liveFp === ctx.workItem!.boundary_fingerprint,
        combinedInputIdentity: ctx.workItem!.combined_input_identity,
      },
      tripBoundaries: {
        startUtc: trip.start_time.toISOString(),
        endUtc: trip.end_time.toISOString(),
        tripStatus: trip.trip_status,
        isRepaired: trip.is_repaired,
        boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(trip.raw_detection_meta),
      },
      fsm: fsm
        ? { state: fsm.state, activeTripId: fsm.active_trip_id }
        : { state: null, activeTripId: null },
      admission: {
        evaluation: admissionEval,
        rawMetaAdmissionV1:
          (trip.raw_detection_meta as Record<string, unknown> | null)?.diV0BoundaryAdmissionV1 ?? null,
      },
      productReadBoundaryGate: productGate,
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
      outbox: outboxRows[0]
        ? {
            status: outboxRows[0].status,
            qcPolicyVersion: outboxRows[0].qc_policy_version,
            attemptCount: outboxRows[0].attempt_count,
            lastErrorCode: outboxRows[0].last_error_code,
            updatedAtUtc: outboxRows[0].updated_at.toISOString(),
          }
        : null,
      projectionStore: projectionRow
        ? {
            id: projectionRow.id,
            lifecycleStatus: projectionRow.lifecycle_status,
            contentFingerprint: projectionRow.content_fingerprint,
            idempotencyKey: projectionRow.idempotency_key,
            verifiedSpeedSummary: quality || speed
              ? {
                  qcTrustedMaxKmh: speed?.qcTrustedMaxKmh ?? null,
                  qcTrustedMeanKmh: speed?.qcTrustedMeanKmh ?? null,
                  trustedNumericCoveragePercent: quality?.trustedNumericCoveragePercent ?? null,
                  assessabilityLevel:
                    (pj?.assessability as Record<string, unknown> | undefined)?.level ?? null,
                  assessabilityReasons:
                    (pj?.assessability as Record<string, unknown> | undefined)?.reasons ?? null,
                }
              : null,
          }
        : null,
      forensicReplay: {
        replayMode: ctx.replayMode,
        dbTransactionReadOnly: ctx.dbTransactionReadOnly,
        dbTransactionIsolation: ctx.dbTransactionIsolation,
        snapshotVerified: ctx.snapshotVerified,
        channelManifest: snap?.channel_manifest ?? null,
      },
      boundaryReconciliation,
      video: {
        receivedAndAnalyzed: false,
        ownerReportsVideoExists: true,
        protocolReady: true,
      },
      postDeployVerification: {
        status: BASELINE_PHASE === 'PRE_DEPLOY' ? 'NOT_RUN_PENDING_JOINT_DEPLOY' : 'PENDING_OWNER_AUTHORIZATION',
        expectationIfBoundariesUnchanged:
          'Admission reconcile should restore product visibility without new S4 fetch (expectation until observed).',
      },
      productionMutations: 'NONE',
      providerCalls: 'NONE',
    };

    fs.mkdirSync(outDir, { recursive: true });
    const manifestPath = path.join(outDir, `${BASELINE_PHASE}_BASELINE_MANIFEST.json`);
    const perSecondPath = path.join(outDir, `${BASELINE_PHASE}_PER_SECOND_REPLAY.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(perSecondPath, JSON.stringify(perSecond, null, 2));

    const sumsPath = path.join(outDir, 'SHA256SUMS');
    const mHash = sha256File(manifestPath);
    const pHash = sha256File(perSecondPath);
    fs.writeFileSync(
      sumsPath,
      `${mHash}  ${path.basename(manifestPath)}\n${pHash}  ${path.basename(perSecondPath)}\n`,
    );

    const provenancePath = path.join(outDir, 'PROVENANCE.json');
    fs.writeFileSync(
      provenancePath,
      JSON.stringify(
        {
          schema: 'EXP021_EV_GROUND_TRUTH_PROVENANCE_V1',
          baselinePhase: BASELINE_PHASE,
          observedAtUtc,
          artifactHashes: { manifestSha256: mHash, perSecondReplaySha256: pHash },
          packageSha256: createHash('sha256').update(fs.readFileSync(sumsPath)).digest('hex'),
        },
        null,
        2,
      ),
    );

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          outDir,
          manifestPath,
          perSecondPath,
          perSecondRows: perSecond.length,
          manifestSha256: mHash,
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
